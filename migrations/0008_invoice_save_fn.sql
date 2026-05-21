-- Atomic invoice + line-items save. Wraps insert/update of `invoices` plus
-- replace-all of `invoice_items` in a single transaction so a failure mid-way
-- can't leave an orphaned invoice or stale items. plpgsql functions execute
-- inside the caller's transaction; any RAISE here rolls back everything.
--
-- Security: SECURITY INVOKER (default). RLS on `invoices` and `invoice_items`
-- enforces ownership on every row touched, so we don't need DEFINER.

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
      total, currency, notes, paid_at
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
      NULLIF(p_invoice->>'paid_at', '')::timestamptz
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
      paid_at = NULLIF(p_invoice->>'paid_at', '')::timestamptz
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
