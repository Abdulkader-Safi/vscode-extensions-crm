-- Track which migration files have been applied so the extension can run new ones idempotently.
CREATE TABLE IF NOT EXISTS public._vsccrm_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
