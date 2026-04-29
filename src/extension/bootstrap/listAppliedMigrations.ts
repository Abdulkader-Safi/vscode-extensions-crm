import type { SupabaseConfig } from "./orchestrator";

export async function listAppliedMigrations(
  cfg: SupabaseConfig,
): Promise<Set<string>> {
  // The tracking table is created at the top of 0001_schema.sql. On the very
  // first run it doesn't exist yet — PostgREST returns 404, treat as empty.
  const res = await fetch(`${cfg.url}/rest/v1/_vscrm_migrations?select=name`, {
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
