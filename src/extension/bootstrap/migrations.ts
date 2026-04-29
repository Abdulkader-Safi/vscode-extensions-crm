// SQL files are loaded as string literals via esbuild's `text` loader
// (see esbuild.js loader config). Order matters — earliest first.
import schemaSql from "../../../migrations/0001_schema.sql";
import revokeSql from "../../../migrations/0002_revoke.sql";
import trackingSql from "../../../migrations/0003_vsccrm_tracking.sql";

export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  { name: "0001_schema.sql", sql: schemaSql },
  { name: "0002_revoke.sql", sql: revokeSql },
  { name: "0003_vsccrm_tracking.sql", sql: trackingSql },
];

// SQL the user pastes once into the Supabase SQL Editor before migrations
// can be auto-applied. Creates a SECURITY DEFINER helper that runs arbitrary
// statements with elevated privileges; we drop it again at the end of bootstrap.
export const BOOTSTRAP_FUNCTION_SQL = `-- Run this once in your Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- vs-crm uses this helper to apply schema migrations, then drops it
-- automatically when bootstrap completes. Safe to delete it manually if you prefer.

CREATE OR REPLACE FUNCTION public._vscrm_exec_sql(stmt text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  EXECUTE stmt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._vscrm_exec_sql(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public._vscrm_exec_sql(text) TO service_role;
`;

export const TEARDOWN_FUNCTION_SQL = `DROP FUNCTION IF EXISTS public._vscrm_exec_sql(text);`;
