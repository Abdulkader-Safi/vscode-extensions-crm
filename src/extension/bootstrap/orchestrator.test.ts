import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { MigrationProgress } from "../../shared/messages";
import type { SupabaseConfig } from "./orchestrator";

type MigrationFixture = { name: string; sql: string };
const TEST_MIGRATIONS: MigrationFixture[] = [];

mock.module("./migrations", () => ({
  MIGRATIONS: TEST_MIGRATIONS,
}));

const { runMigrations } = await import("./orchestrator");

const cfg: SupabaseConfig = {
  url: "https://stub.example",
  serviceRoleKey: "sr-key",
};

type Call = { url: string; init: RequestInit | undefined };
let calls: Call[];
let responder: (call: Call, idx: number) => Response | Promise<Response>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  responder = () => new Response(null, { status: 200 });
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const call: Call = { url, init };
    calls.push(call);
    return Promise.resolve(responder(call, calls.length - 1));
  }) as typeof fetch;
  TEST_MIGRATIONS.length = 0;
  TEST_MIGRATIONS.push(
    { name: "test_001.sql", sql: "SELECT 1;" },
    { name: "test_002.sql", sql: "SELECT 2; SELECT 3;" },
  );
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("runMigrations", () => {
  test("skips all migrations when every name is already applied", async () => {
    responder = (call) => {
      if (call.url.includes("/_vscrm_migrations?")) {
        return new Response(
          JSON.stringify([
            { name: "test_001.sql" },
            { name: "test_002.sql" },
          ]),
          { status: 200 },
        );
      }
      return new Response(null, { status: 200 });
    };
    const progress: MigrationProgress[] = [];
    const result = await runMigrations(cfg, (p) => progress.push(p));

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(["test_001.sql", "test_002.sql"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/_vscrm_migrations?select=name");
    expect(progress.every((p) => p.status === "done")).toBe(true);
  });

  test("runs all migrations when PostgREST returns 404 (table missing)", async () => {
    responder = (call) => {
      if (call.url.includes("/_vscrm_migrations?")) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 200 });
    };
    const result = await runMigrations(cfg, () => {});

    expect(result.applied).toEqual(["test_001.sql", "test_002.sql"]);
    expect(result.skipped).toEqual([]);
    // 1 GET + (1 body + 1 insert) + (1 body + 1 insert) = 5 calls
    expect(calls).toHaveLength(5);
    const posts = calls.slice(1);
    expect(posts.every((c) => c.init?.method === "POST")).toBe(true);
    expect(posts.every((c) => c.url.endsWith("/rpc/_vscrm_exec_sql"))).toBe(
      true,
    );
  });

  test("runs only pending migrations in mixed state", async () => {
    responder = (call) => {
      if (call.url.includes("/_vscrm_migrations?")) {
        return new Response(JSON.stringify([{ name: "test_001.sql" }]), {
          status: 200,
        });
      }
      return new Response(null, { status: 200 });
    };
    const progress: MigrationProgress[] = [];
    const result = await runMigrations(cfg, (p) => progress.push(p));

    expect(result.applied).toEqual(["test_002.sql"]);
    expect(result.skipped).toEqual(["test_001.sql"]);
    // 1 GET + (1 body + 1 insert) for migration 2 = 3 calls
    expect(calls).toHaveLength(3);
    const m1 = progress.filter((p) => p.name === "test_001.sql");
    const m2 = progress.filter((p) => p.name === "test_002.sql");
    expect(m1.map((p) => p.status)).toEqual(["done"]);
    expect(m2.map((p) => p.status)).toEqual(["running", "done"]);
  });

  test("rejects and emits error progress when an RPC POST returns 500", async () => {
    responder = (call, idx) => {
      if (call.url.includes("/_vscrm_migrations?")) {
        return new Response(null, { status: 404 });
      }
      // first POST is migration 1's body — make it fail
      if (idx === 1) {
        return new Response("permission denied", { status: 500 });
      }
      return new Response(null, { status: 200 });
    };
    const progress: MigrationProgress[] = [];
    let thrown: Error | null = null;
    try {
      await runMigrations(cfg, (p) => progress.push(p));
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toContain("RPC _vscrm_exec_sql failed (500)");

    const last = progress[progress.length - 1];
    expect(last.status).toBe("error");
    expect(last.name).toBe("test_001.sql");
    expect(last.error).toContain("500");
    // 1 GET + 1 failed POST = 2 (no tracking insert attempted)
    expect(calls).toHaveLength(2);
  });

  test("propagates a network rejection from listAppliedMigrations", async () => {
    responder = (call) => {
      if (call.url.includes("/_vscrm_migrations?")) {
        throw new Error("ENOTFOUND");
      }
      return new Response(null, { status: 200 });
    };
    let thrown: Error | null = null;
    try {
      await runMigrations(cfg, () => {});
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toContain("ENOTFOUND");
  });

  test("sends apikey + Authorization Bearer + Content-Type on RPC POSTs", async () => {
    responder = (call) => {
      if (call.url.includes("/_vscrm_migrations?")) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 200 });
    };
    await runMigrations(cfg, () => {});

    const post = calls.find((c) => c.init?.method === "POST");
    expect(post).toBeDefined();
    const headers = post!.init!.headers as Record<string, string>;
    expect(headers["apikey"]).toBe("sr-key");
    expect(headers["Authorization"]).toBe("Bearer sr-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
