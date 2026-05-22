-- Task activity / notes timeline (Batch 16).
--
-- Reuse communication_logs for task notes + comments, same as clients and
-- leads — one timeline shape across all three. A log row is now scoped to a
-- client OR a lead OR a task. ON DELETE CASCADE so deleting a task clears its
-- activity.
--
-- RLS unchanged: the existing "comm all" policy (auth.uid() = user_id) covers
-- the new column.

ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS task_id UUID
    REFERENCES public.tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comm_logs_task_idx
  ON public.communication_logs (task_id)
  WHERE task_id IS NOT NULL;
