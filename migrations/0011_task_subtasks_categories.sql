-- Task subtasks + categories (Batches 17 + 20).
--
-- parent_task_id turns tasks into a one-level tree (a task's children are its
-- subtasks). ON DELETE CASCADE so deleting a parent removes its subtasks.
-- category is a free-form text label (chip-input autocompletes from existing
-- values, mirroring how client tags work) — no separate category table.
--
-- RLS unchanged: the existing "tasks all" policy (auth.uid() = user_id) covers
-- the new columns. Subtasks inherit the parent's owner via the same user_id.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID
    REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS tasks_parent_idx
  ON public.tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;
