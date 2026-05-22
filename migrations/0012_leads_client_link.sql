-- Link leads to an existing client (Batch 18).
--
-- When a user creates a lead from an existing client, this FK records the
-- relationship so contact-info changes can be traced back. ON DELETE SET NULL
-- so deleting a client doesn't cascade-delete its leads. Distinct from
-- `converted_client_id` (which records the client a *won* lead became).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS client_id UUID
    REFERENCES public.clients(id) ON DELETE SET NULL;
