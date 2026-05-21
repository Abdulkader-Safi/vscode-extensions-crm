import { MIGRATIONS, type Migration } from "./migrations";
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
      // Send the entire migration body as a single _vscrm_exec_sql call.
      // PostgREST wraps each request in a transaction, and EXECUTE inside the
      // plpgsql helper runs all statements in that transaction — so any
      // failure mid-migration rolls back the whole file. We can't add
      // explicit BEGIN/COMMIT inside the helper (plpgsql forbids transaction
      // control), but we don't need to: the implicit transaction is enough.
      await rpcExecSql(cfg, mig.sql);
      // Version-pin runs as a separate call so its own atomic insert is
      // independent of the migration body's transaction.
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

  // The helper function `_vscrm_exec_sql` stays installed so future migration
  // bundles (shipped in extension upgrades) can be applied automatically on
  // the next activation without re-onboarding. It is locked to service_role
  // (REVOKE ... FROM anon, authenticated, public) so it expands no surface
  // beyond holding the service-role key itself.
  return { applied, skipped };
}

function pgQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
