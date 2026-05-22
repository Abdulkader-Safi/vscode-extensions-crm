-- Public client portal (Batch 14).
--
-- A user can mint a share token for an invoice; anyone with the token can view
-- a read-only copy at the portal site without signing in.
--
-- Security model: we do NOT add an anon SELECT policy on `invoices` — that
-- would let any anon enumerate every shared invoice by querying without a
-- filter. Instead, a single SECURITY DEFINER function `crm_get_shared_invoice`
-- takes the exact token and returns the one matching row (plus its items,
-- client name, and issuer branding) as JSON. anon can only EXECUTE the
-- function; it never touches the tables directly. The function redacts
-- sensitive columns (user_id, share_token) before returning.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS invoices_share_token_idx
  ON public.invoices (share_token)
  WHERE share_token IS NOT NULL;

-- Returns the shared invoice bundle, or NULL when the token is unknown,
-- expired, or the invoice was deleted.
CREATE OR REPLACE FUNCTION public.crm_get_shared_invoice(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices;
  v_result JSONB;
BEGIN
  IF p_token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_inv
  FROM public.invoices
  WHERE share_token = p_token
    AND deleted_at IS NULL
    AND (share_expires_at IS NULL OR share_expires_at > now())
  LIMIT 1;

  IF v_inv.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    -- Redact owner + token before sending to the public.
    'invoice', (to_jsonb(v_inv) - 'user_id' - 'share_token'),
    'items', (
      SELECT COALESCE(jsonb_agg(to_jsonb(it) - 'user_id' ORDER BY it.position), '[]'::jsonb)
      FROM public.invoice_items it
      WHERE it.invoice_id = v_inv.id
    ),
    'client', (
      SELECT jsonb_build_object('name', c.name, 'company', c.company, 'email', c.email)
      FROM public.clients c
      WHERE c.id = v_inv.client_id
    ),
    'issuer', (
      SELECT jsonb_build_object(
        'display_name', p.display_name,
        'company_name', p.company_name,
        'logo_url', p.logo_url,
        'brand_color', p.brand_color
      )
      FROM public.profiles p
      WHERE p.id = v_inv.user_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_get_shared_invoice(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_get_shared_invoice(UUID) TO anon, authenticated;
