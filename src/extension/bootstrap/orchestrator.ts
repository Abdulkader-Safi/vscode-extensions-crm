import { splitSqlStatements } from "./sqlSplitter";
import {
  MIGRATIONS,
  TEARDOWN_FUNCTION_SQL,
  type Migration,
} from "./migrations";
import type {
  MigrationProgress,
  RunMigrationsResult,
} from "../../shared/messages";

export type ProgressFn = (p: MigrationProgress) => void;

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

async function rpcExecSql(cfg: SupabaseConfig, stmt: string): Promise<void> {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/_vscrm_exec_sql`, {
    method: "POST",
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "params=single-object",
    },
    body: JSON.stringify({ stmt }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(
      `RPC _vscrm_exec_sql failed (${res.status}): ${text || res.statusText}`,
    );
  }
}

async function listAppliedMigrations(
  cfg: SupabaseConfig,
): Promise<Set<string>> {
  // The tracking table may not exist on the first run — gracefully treat 404 as empty.
  const res = await fetch(`${cfg.url}/rest/v1/_vsccrm_migrations?select=name`, {
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
    },
  });
  if (res.status === 404 || res.status === 406) return new Set();
  if (!res.ok) return new Set(); // permissive — if PostgREST is grumpy, attempt all migrations
  try {
    const rows = (await res.json()) as Array<{ name: string }>;
    return new Set(rows.map((r) => r.name));
  } catch {
    return new Set();
  }
}

export async function pingSupabase(
  url: string,
  anonKey: string,
  serviceRoleKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const a = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
    });
    if (!a.ok) {
      return {
        ok: false,
        error: `Auth health check failed: ${a.status} ${a.statusText}`,
      };
    }
    const b = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!b.ok && b.status !== 200 && b.status !== 404) {
      return {
        ok: false,
        error: `REST check failed: ${b.status} ${b.statusText}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runMigrations(
  cfg: SupabaseConfig,
  onProgress: ProgressFn,
): Promise<RunMigrationsResult> {
  const total = MIGRATIONS.length;
  const applied: string[] = [];
  const skipped: string[] = [];

  // The tracking table itself is created by 0003 — for runs before that,
  // the listAppliedMigrations() will 404 and we apply everything.
  let alreadyApplied = await listAppliedMigrations(cfg);

  for (let idx = 0; idx < MIGRATIONS.length; idx++) {
    const mig: Migration = MIGRATIONS[idx];
    if (alreadyApplied.has(mig.name)) {
      skipped.push(mig.name);
      onProgress({
        current: idx + 1,
        total,
        name: mig.name,
        status: "done",
      });
      continue;
    }

    onProgress({
      current: idx + 1,
      total,
      name: mig.name,
      status: "running",
    });

    try {
      const stmts = splitSqlStatements(mig.sql);
      for (const s of stmts) {
        await rpcExecSql(cfg, s);
      }
      // Record the migration as applied (only if the tracking table exists).
      // 0003 creates that table — once it exists, mark all future migrations.
      if (mig.name === "0003_vsccrm_tracking.sql" || alreadyApplied.size > 0) {
        await rpcExecSql(
          cfg,
          `INSERT INTO public._vsccrm_migrations(name) VALUES (${pgQuote(
            mig.name,
          )}) ON CONFLICT (name) DO NOTHING`,
        );
        alreadyApplied = new Set([...alreadyApplied, mig.name]);
      }
      // Also record the tracking migration itself once the table exists.
      if (mig.name === "0003_vsccrm_tracking.sql") {
        for (const earlier of MIGRATIONS.slice(0, idx)) {
          await rpcExecSql(
            cfg,
            `INSERT INTO public._vsccrm_migrations(name) VALUES (${pgQuote(
              earlier.name,
            )}) ON CONFLICT (name) DO NOTHING`,
          );
        }
      }
      applied.push(mig.name);
      onProgress({
        current: idx + 1,
        total,
        name: mig.name,
        status: "done",
      });
    } catch (e) {
      const msg = (e as Error).message;
      onProgress({
        current: idx + 1,
        total,
        name: mig.name,
        status: "error",
        error: msg,
      });
      throw e;
    }
  }

  // Tear down the helper function — service role key will also be cleared by caller.
  try {
    await rpcExecSql(cfg, TEARDOWN_FUNCTION_SQL);
  } catch {
    // non-fatal
  }

  return { applied, skipped };
}

function pgQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
