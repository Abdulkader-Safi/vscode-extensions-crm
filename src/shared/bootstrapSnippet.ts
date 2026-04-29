// Single source of truth for the SQL helper users paste into the Supabase
// SQL Editor before vs-crm can apply migrations. Imported by both the host
// (to run as part of bootstrap) and the webview (to display + copy).
export const BOOTSTRAP_FUNCTION_SNIPPET = `-- Run this once in your Supabase SQL Editor.
-- vs-crm uses this helper to apply schema migrations during onboarding AND
-- to apply any new migrations shipped with future extension upgrades —
-- so it stays installed. It is locked to the service_role (REVOKE EXECUTE
-- FROM anon, authenticated, public) so it cannot be invoked by your app's
-- end-users. Safe to drop manually if you stop using vs-crm.

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
