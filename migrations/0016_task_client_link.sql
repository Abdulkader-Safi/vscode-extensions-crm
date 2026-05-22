-- Direct client pin on a task (Batch 16).
--
-- Tasks normally reach a client through their project (project.client_id), but
-- some tasks aren't tied to a project. This optional FK lets the user pin a
-- client directly. ON DELETE SET NULL so deleting a client doesn't cascade-
-- delete its tasks.
--
-- RLS unchanged: the existing user-scoped tasks policy covers the new column.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_id UUID
    REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_client_idx
  ON public.tasks (client_id)
  WHERE client_id IS NOT NULL;
