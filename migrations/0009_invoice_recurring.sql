-- Recurring / template invoices (Batch 12).
--
-- A "template" invoice is just a normal invoices row with `is_template = true`.
-- Children of a template are spawned by `crm_run_recurring_invoices()`, which
-- runs daily under pg_cron. Each child references its parent via
-- `parent_invoice_id` and starts in status 'draft' so the user can review /
-- send / adjust before billing the client.
--
-- The cron job is wrapped in a graceful exception so this migration is safe to
-- run before `pg_cron` is enabled in Supabase. When the extension is missing,
-- the schedule is skipped and a NOTICE prints how to enable it; manual SELECTs
-- against the function still work for testing.

-- Columns ---------------------------------------------------------------------

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id UUID
    REFERENCES public.invoices(id) ON DELETE SET NULL;

-- Subset of RFC 5545 RRULE we accept:
--   { "freq": "weekly" | "monthly" | "quarterly" | "yearly",
--     "interval": number (>=1),
--     "until": "YYYY-MM-DD" (optional),
--     "count": number (optional) }
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS recurrence JSONB;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

-- Partial index — the cron sweep filters by these two predicates every day.
CREATE INDEX IF NOT EXISTS invoices_next_run_idx
  ON public.invoices (next_run_at)
  WHERE is_template AND next_run_at IS NOT NULL;

-- Function --------------------------------------------------------------------

-- Spawns child invoices for every due template, advances each template's
-- next_run_at by its recurrence rule, returns the number of children created.
-- Runs as SECURITY DEFINER so pg_cron (which runs as the cron role) can call
-- it without needing per-user JWT. Each loop iteration is scoped to the
-- template's owner via user_id so RLS-equivalent isolation is preserved.

CREATE OR REPLACE FUNCTION public.crm_run_recurring_invoices()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_new_id UUID;
  v_count INTEGER := 0;
  v_freq TEXT;
  v_interval INTEGER;
  v_due_offset INTEGER;
  v_next TIMESTAMPTZ;
  v_count_limit INTEGER;
  v_children_so_far INTEGER;
  v_until DATE;
BEGIN
  FOR v_template IN
    SELECT *
    FROM public.invoices
    WHERE is_template
      AND next_run_at IS NOT NULL
      AND next_run_at <= now()
      AND deleted_at IS NULL
  LOOP
    v_freq := lower(coalesce(v_template.recurrence->>'freq', 'monthly'));
    v_interval := greatest(1, coalesce((v_template.recurrence->>'interval')::int, 1));
    v_until := nullif(v_template.recurrence->>'until', '')::date;
    v_count_limit := nullif(v_template.recurrence->>'count', '')::int;

    -- Stop if we've exceeded `until`.
    IF v_until IS NOT NULL AND (v_template.next_run_at::date) > v_until THEN
      UPDATE public.invoices SET next_run_at = NULL WHERE id = v_template.id;
      CONTINUE;
    END IF;

    -- Stop if we've created enough children already.
    IF v_count_limit IS NOT NULL THEN
      SELECT count(*) INTO v_children_so_far
      FROM public.invoices
      WHERE parent_invoice_id = v_template.id;
      IF v_children_so_far >= v_count_limit THEN
        UPDATE public.invoices SET next_run_at = NULL WHERE id = v_template.id;
        CONTINUE;
      END IF;
    END IF;

    -- Days between issue_date and due_date on the template — copied to each child.
    v_due_offset := COALESCE(v_template.due_date - v_template.issue_date, 0);

    INSERT INTO public.invoices (
      user_id, client_id, project_id,
      invoice_number, status,
      issue_date, due_date,
      subtotal, tax_rate, tax_amount, discount, total, currency,
      notes,
      is_template, parent_invoice_id
    ) VALUES (
      v_template.user_id, v_template.client_id, v_template.project_id,
      -- Suffix the template's number with the run date so each child is unique
      -- under the (user_id, invoice_number) constraint.
      v_template.invoice_number || '-' || to_char(v_template.next_run_at, 'YYYYMMDD'),
      'draft',
      v_template.next_run_at::date,
      (v_template.next_run_at::date) + (v_due_offset || ' days')::interval,
      v_template.subtotal, v_template.tax_rate, v_template.tax_amount,
      v_template.discount, v_template.total, v_template.currency,
      v_template.notes,
      false, v_template.id
    )
    RETURNING id INTO v_new_id;

    -- Copy line items.
    INSERT INTO public.invoice_items (user_id, invoice_id, description, quantity, unit_price, total, position)
    SELECT user_id, v_new_id, description, quantity, unit_price, total, position
    FROM public.invoice_items
    WHERE invoice_id = v_template.id;

    -- Advance next_run_at by the recurrence rule.
    v_next := CASE v_freq
      WHEN 'weekly'    THEN v_template.next_run_at + (v_interval || ' weeks')::interval
      WHEN 'monthly'   THEN v_template.next_run_at + (v_interval || ' months')::interval
      WHEN 'quarterly' THEN v_template.next_run_at + ((v_interval * 3) || ' months')::interval
      WHEN 'yearly'    THEN v_template.next_run_at + (v_interval || ' years')::interval
      ELSE v_template.next_run_at + (v_interval || ' months')::interval
    END;

    UPDATE public.invoices SET next_run_at = v_next WHERE id = v_template.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_run_recurring_invoices() FROM PUBLIC, anon, authenticated;
-- service_role + postgres can call directly for manual testing; pg_cron's
-- worker runs as `postgres` so no explicit GRANT is needed for the schedule.

-- Cron schedule (graceful when pg_cron is absent) -----------------------------

DO $$
BEGIN
  -- Try to schedule. If the cron extension isn't enabled (most common), the
  -- exception clause prints a hint and the migration still succeeds. The user
  -- can flip on pg_cron from the Supabase dashboard later; re-running this
  -- migration is a no-op except for the schedule, which we re-create idempotently.
  PERFORM cron.unschedule('vscrm-recurring-invoices')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'vscrm-recurring-invoices'
  );
  PERFORM cron.schedule(
    'vscrm-recurring-invoices',
    '0 1 * * *', -- daily at 01:00 UTC
    $job$SELECT public.crm_run_recurring_invoices()$job$
  );
EXCEPTION
  WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
    RAISE NOTICE 'pg_cron not enabled — recurring invoices will not auto-spawn. Enable it in Supabase Dashboard → Database → Extensions, then re-run this migration (or call SELECT cron.schedule(...) once).';
END;
$$;

-- Replace crm_save_invoice to also persist the new recurring fields.
-- (The 0008 version doesn't know about is_template / recurrence / next_run_at,
-- so the webview's "Make recurring" toggle wouldn't round-trip without this.)
CREATE OR REPLACE FUNCTION public.crm_save_invoice(
  p_invoice_id UUID,
  p_invoice JSONB,
  p_items JSONB
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.invoices (
      user_id, client_id, project_id, invoice_number, status,
      issue_date, due_date, subtotal, tax_rate, tax_amount, discount,
      total, currency, notes, paid_at,
      is_template, recurrence, next_run_at
    ) VALUES (
      v_uid,
      NULLIF(p_invoice->>'client_id', '')::uuid,
      NULLIF(p_invoice->>'project_id', '')::uuid,
      p_invoice->>'invoice_number',
      COALESCE(p_invoice->>'status', 'draft'),
      COALESCE((p_invoice->>'issue_date')::date, CURRENT_DATE),
      NULLIF(p_invoice->>'due_date', '')::date,
      COALESCE((p_invoice->>'subtotal')::numeric, 0),
      COALESCE((p_invoice->>'tax_rate')::numeric, 0),
      COALESCE((p_invoice->>'tax_amount')::numeric, 0),
      COALESCE((p_invoice->>'discount')::numeric, 0),
      COALESCE((p_invoice->>'total')::numeric, 0),
      COALESCE(p_invoice->>'currency', 'USD'),
      p_invoice->>'notes',
      NULLIF(p_invoice->>'paid_at', '')::timestamptz,
      COALESCE((p_invoice->>'is_template')::boolean, false),
      CASE
        WHEN p_invoice ? 'recurrence' AND p_invoice->'recurrence' IS NOT NULL
        THEN p_invoice->'recurrence'
        ELSE NULL
      END,
      NULLIF(p_invoice->>'next_run_at', '')::timestamptz
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.invoices SET
      client_id = NULLIF(p_invoice->>'client_id', '')::uuid,
      project_id = NULLIF(p_invoice->>'project_id', '')::uuid,
      invoice_number = p_invoice->>'invoice_number',
      status = COALESCE(p_invoice->>'status', status),
      issue_date = COALESCE((p_invoice->>'issue_date')::date, issue_date),
      due_date = NULLIF(p_invoice->>'due_date', '')::date,
      subtotal = COALESCE((p_invoice->>'subtotal')::numeric, subtotal),
      tax_rate = COALESCE((p_invoice->>'tax_rate')::numeric, tax_rate),
      tax_amount = COALESCE((p_invoice->>'tax_amount')::numeric, tax_amount),
      discount = COALESCE((p_invoice->>'discount')::numeric, discount),
      total = COALESCE((p_invoice->>'total')::numeric, total),
      currency = COALESCE(p_invoice->>'currency', currency),
      notes = p_invoice->>'notes',
      paid_at = NULLIF(p_invoice->>'paid_at', '')::timestamptz,
      is_template = COALESCE((p_invoice->>'is_template')::boolean, is_template),
      recurrence = CASE
        WHEN p_invoice ? 'recurrence' THEN p_invoice->'recurrence'
        ELSE recurrence
      END,
      next_run_at = CASE
        WHEN p_invoice ? 'next_run_at'
        THEN NULLIF(p_invoice->>'next_run_at', '')::timestamptz
        ELSE next_run_at
      END
    WHERE id = p_invoice_id AND user_id = v_uid
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'invoice % not found', p_invoice_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  DELETE FROM public.invoice_items WHERE invoice_id = v_id;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.invoice_items (
      user_id, invoice_id, description, quantity, unit_price, total, position
    )
    SELECT
      v_uid,
      v_id,
      item->>'description',
      COALESCE((item->>'quantity')::numeric, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'total')::numeric, 0),
      COALESCE((item->>'position')::int, 0)
    FROM jsonb_array_elements(p_items) AS item;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_save_invoice(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_save_invoice(UUID, JSONB, JSONB) TO authenticated;
