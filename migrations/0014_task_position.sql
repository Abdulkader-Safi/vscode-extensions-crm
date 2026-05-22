-- Subtask ordering (Batch 16).
--
-- Adds an explicit `position` column so subtasks can be drag-reordered on the
-- task detail page and the order persists across refetches. Nullable: existing
-- rows (and top-level tasks, which aren't reordered) keep NULL and fall back to
-- created_at. New/reordered subtasks get sequential 0..n values.
--
-- RLS unchanged: the existing user-scoped tasks policy covers the new column.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS position INTEGER;
