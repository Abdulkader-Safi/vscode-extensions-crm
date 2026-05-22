-- Lead notes / activity timeline (Batch 19).
--
-- Reuse the existing communication_logs table for lead notes instead of a
-- separate table — one timeline shape for both clients and leads. A log row
-- is now scoped to a client OR a lead (client_id was already nullable).
-- ON DELETE CASCADE so deleting a lead clears its notes.
--
-- RLS unchanged: the existing "comm all" policy (auth.uid() = user_id) covers
-- the new column.

ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS lead_id UUID
    REFERENCES public.leads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comm_logs_lead_idx
  ON public.communication_logs (lead_id)
  WHERE lead_id IS NOT NULL;
