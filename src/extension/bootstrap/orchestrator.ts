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
import { listAppliedMigrations } from "./listAppliedMigrations";

type ProgressFn = (p: MigrationProgress) => void;

export type SupabaseConfig = {
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

  const alreadyApplied = await listAppliedMigrations(cfg);

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
      // The tracking table is created in 0001 itself, so by the time the
      // first migration's statements have all run we can record it. Every
      // subsequent migration records itself the same way.
      await rpcExecSql(
        cfg,
        `INSERT INTO public._vscrm_migrations(name) VALUES (${pgQuote(
          mig.name,
        )}) ON CONFLICT (name) DO NOTHING`,
      );
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

  // Tear down the helper function — service role key is cleared by caller.
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
