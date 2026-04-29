// Mirror of src/extension/bootstrap/migrations.ts — kept here so the webview
// can display + copy the snippet without crossing the IPC boundary.
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
