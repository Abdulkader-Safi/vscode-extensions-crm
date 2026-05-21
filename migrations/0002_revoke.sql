-- Defense-in-depth. Both functions below are trigger-only — they're invoked
-- by Postgres triggers (auth.users INSERT, BEFORE UPDATE on user tables) and
-- never by app code. We revoke EXECUTE from anon/authenticated/public so they
-- can't be called directly via PostgREST RPC if exposure ever leaks (e.g. a
-- schema-cache reload after a config change re-publishes the function).
--
-- handle_new_user is SECURITY DEFINER and writes to public.profiles; without
-- this revoke, any signed-in user who could reach the RPC endpoint could
-- insert arbitrary profile rows. update_updated_at_column is lower-risk but
-- locked down for symmetry.
--
-- REVOKE on a role that already has no privilege is a no-op, so this file is
-- safe to re-run (the orchestrator skips applied files anyway).

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
