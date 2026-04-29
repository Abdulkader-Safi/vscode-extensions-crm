// Single source of truth for the SQL helper users paste into the Supabase
// SQL Editor before vs-crm can apply migrations. Imported by both the host
// (to run as part of bootstrap) and the webview (to display + copy).
export const BOOTSTRAP_FUNCTION_SNIPPET = `-- Run this once in your Supabase SQL Editor.
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
