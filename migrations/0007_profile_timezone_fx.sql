-- Globalization + FX prep for `profiles`:
--   * `timezone` — IANA tz name (e.g. "Africa/Cairo"). Used by `formatDate()`
--     so dashboard / report labels match the user's actual day boundaries.
--   * `fx_rates` — JSONB map { "USD": 1, "EUR": 0.92, ... } expressing each
--     currency's value in the profile's base currency. Empty default; the
--     Settings UI populates it as currencies appear in invoices/expenses.
-- Both are additive and nullable-safe (defaults). No data migration needed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fx_rates JSONB NOT NULL DEFAULT '{}'::jsonb;
