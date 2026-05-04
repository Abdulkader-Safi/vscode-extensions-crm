-- Soft-delete support. Each row gets a nullable `deleted_at`. List queries
-- filter `deleted_at IS NULL`; the Trash view inverts the predicate. Hard
-- delete (purge) is still available for manual cleanup from Trash.
--
-- We do NOT cascade soft-delete (deleting a client leaves its invoices alive
-- — restoring the client brings them back into view because they were never
-- hidden in the first place). This is intentional: hiding child rows would
-- require unwinding on restore, which becomes ambiguous if a child was
-- soft-deleted independently.

ALTER TABLE public.clients              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.projects             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.tasks                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.invoices             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.invoice_items        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.expenses             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.leads                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.communication_logs   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial indexes: list queries (`deleted_at IS NULL`) hit the live index;
-- Trash queries (`deleted_at IS NOT NULL`) hit the trash index. Each is
-- much smaller than a full index over both states.
CREATE INDEX IF NOT EXISTS idx_clients_user_live            ON public.clients(user_id)            WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_user_trash           ON public.clients(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_user_live           ON public.projects(user_id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_user_trash          ON public.projects(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_user_live              ON public.tasks(user_id)              WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_user_trash             ON public.tasks(user_id, deleted_at)  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_user_live           ON public.invoices(user_id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_user_trash          ON public.invoices(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_user_live           ON public.expenses(user_id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_user_trash          ON public.expenses(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_user_live              ON public.leads(user_id)              WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_user_trash             ON public.leads(user_id, deleted_at)  WHERE deleted_at IS NOT NULL;
