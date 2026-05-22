import {
  createQuery,
  createInfiniteQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import type { Readable } from "svelte/store";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";
import {
  PAGE_SIZE,
  derivedStore,
  prependToCaches,
  replaceInCaches,
  patchInCaches,
} from "./pagination";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string | null;
  time_spent_minutes: number;
  completed_at: string | null;
  // Batch 17 — subtasks (one-level tree) + free-form category.
  parent_task_id?: string | null;
  category?: string | null;
  // Batch 16 — explicit subtask ordering (NULL for unordered/top-level rows).
  position?: number | null;
  // Batch 16 — optional direct client pin (independent of project.client_id).
  client_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TaskInsert = Omit<Task, "id" | "created_at" | "updated_at">;

// `topLevelOnly` excludes subtasks (parent_task_id IS NOT NULL) from list /
// project views so children only appear nested under their parent.
async function fetchTasks(
  projectId?: string,
  topLevelOnly = false,
): Promise<Task[]> {
  if (!auth.user) {
    return [];
  }
  let q = getSupabase()
    .from("tasks")
    .select("*")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (projectId) {
    q = q.eq("project_id", projectId);
  }
  if (topLevelOnly) {
    q = q.is("parent_task_id", null);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return (data as Task[]) ?? [];
}

export function useTasksQuery(projectId?: string) {
  return createQuery<Task[], Error>({
    queryKey: qk.tasks(projectId),
    queryFn: () => fetchTasks(projectId),
  });
}

// Single task for the /tasks/:id detail page.
export function useTaskQuery(idStore: Readable<string>) {
  return createQuery(
    derivedStore(idStore, (id) => ({
      queryKey: ["tasks", "one", id] as readonly unknown[],
      enabled: !!id,
      queryFn: async () => {
        if (!auth.user || !id) return null;
        const { data, error } = await getSupabase()
          .from("tasks")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return (data as Task) ?? null;
      },
    })),
  );
}

// Children of a task, ordered by explicit position then created_at as
// tiebreak (rows predating drag-reorder have a NULL position).
const subtasksKey = (parentId: string) =>
  ["tasks", "subtasks", parentId] as readonly unknown[];

export function useSubtasksQuery(parentIdStore: Readable<string>) {
  return createQuery(
    derivedStore(parentIdStore, (parentId) => ({
      queryKey: subtasksKey(parentId),
      enabled: !!parentId,
      queryFn: async () => {
        if (!auth.user || !parentId) return [];
        const { data, error } = await getSupabase()
          .from("tasks")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("parent_task_id", parentId)
          .is("deleted_at", null)
          .order("position", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });
        if (error) throw error;
        return (data as Task[]) ?? [];
      },
    })),
  );
}

// Persists a new subtask order: writes sequential position 0..n for the given
// ids (already in the desired order) and refreshes the parent's subtask cache.
export function useReorderSubtasksMutation() {
  const client = useQueryClient();
  return createMutation<void, Error, { parentId: string; orderedIds: string[] }>(
    {
      mutationFn: async (vars) => {
        const supa = getSupabase();
        await Promise.all(
          vars.orderedIds.map((id, i) =>
            supa.from("tasks").update({ position: i }).eq("id", id),
          ),
        );
      },
      onSettled: (_d, _e, vars) => {
        client.invalidateQueries({ queryKey: subtasksKey(vars.parentId) });
      },
    },
  );
}

// Distinct non-null categories the user has used — feeds the chip-input
// autocomplete (mirrors useClientTagsQuery).
export function useTaskCategoriesQuery() {
  return createQuery<string[], Error>({
    queryKey: ["tasks", "categories"] as const,
    queryFn: async () => {
      if (!auth.user) return [];
      const { data, error } = await getSupabase()
        .from("tasks")
        .select("category")
        .eq("user_id", auth.user.id)
        .is("deleted_at", null)
        .not("category", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      for (const row of (data ?? []) as { category: string | null }[]) {
        if (row.category) set.add(row.category);
      }
      return [...set].sort();
    },
  });
}

export type TaskListFilters = {
  status?: string;
  projectId?: string;
  priority?: string;
  category?: string;
};
export type TaskListSortField =
  | "created_at"
  | "due_date"
  | "priority"
  | "title";
export type TaskListSort = {
  field: TaskListSortField;
  direction: "asc" | "desc";
};

// Paginated list query for /tasks. Filters move server-side via .eq().
// Caveat: `priority` sort is alphabetical on the column (high/low/medium/urgent),
// not by perceived urgency. The legacy client-side sort used a PRIORITY_RANK
// mapping; replicating that server-side would need either a generated rank
// column (extra migration) or PostgREST raw SQL. We accept alphabetical for
// now — when sorting by priority isn't actually critical it's fine; the kanban
// view shows urgency visually anyway.
export function useTasksListQuery(
  argsStore: Readable<{ filters: TaskListFilters; sort: TaskListSort }>,
) {
  return createInfiniteQuery(
    derivedStore(argsStore, ({ filters, sort }) => ({
      queryKey: ["tasks", "list", filters, sort] as readonly unknown[],
      initialPageParam: 0,
      getNextPageParam: (last: Task[], all: Task[][]) => {
        if (last.length < PAGE_SIZE) return undefined;
        return all.length * PAGE_SIZE;
      },
      queryFn: async ({ pageParam }: { pageParam: number }) => {
        if (!auth.user) return [];
        let q = getSupabase()
          .from("tasks")
          .select("*")
          .eq("user_id", auth.user.id)
          .is("deleted_at", null)
          // Top-level only — subtasks appear nested on the task detail page.
          .is("parent_task_id", null)
          .order(sort.field, { ascending: sort.direction === "asc" })
          .range(pageParam, pageParam + PAGE_SIZE - 1);
        if (filters.status) q = q.eq("status", filters.status);
        if (filters.projectId) q = q.eq("project_id", filters.projectId);
        if (filters.priority) q = q.eq("priority", filters.priority);
        if (filters.category) q = q.eq("category", filters.category);
        const { data, error } = await q;
        if (error) throw error;
        return (data as Task[]) ?? [];
      },
    })),
  );
}

type CreateCtx = {
  snapshots: [readonly unknown[], unknown][];
  optimisticId: string;
};
type UpdateCtx = { snapshots: [readonly unknown[], unknown][] };

export function useCreateTaskMutation() {
  const client = useQueryClient();
  return createMutation<Task, Error, Omit<TaskInsert, "user_id">, CreateCtx>({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("tasks")
        .insert({ ...payload, user_id: auth.user.id })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Task;
    },
    onMutate: async (payload) => {
      await client.cancelQueries({ queryKey: qk.tasks() });
      const snapshots = client.getQueriesData({ queryKey: qk.tasks() }) as [
        readonly unknown[],
        unknown,
      ][];
      const optimistic = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...payload,
        time_spent_minutes: payload.time_spent_minutes ?? 0,
        completed_at: payload.completed_at ?? null,
        created_at: new Date().toISOString(),
      } as Task;
      client.setQueriesData({ queryKey: qk.tasks() }, (old) =>
        prependToCaches(old, optimistic),
      );
      return { snapshots, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        for (const [key, data] of ctx.snapshots) {
          client.setQueryData(key, data);
        }
      }
    },
    onSuccess: (real, _vars, ctx) => {
      if (!ctx) return;
      client.setQueriesData({ queryKey: qk.tasks() }, (old) =>
        replaceInCaches(old, ctx.optimisticId, real),
      );
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.tasks() });
    },
  });
}

export function useUpdateTaskMutation() {
  const client = useQueryClient();
  return createMutation<
    Task,
    Error,
    { id: string; patch: Partial<Task> },
    UpdateCtx
  >({
    mutationFn: async (vars) => {
      const { data, error } = await getSupabase()
        .from("tasks")
        .update(vars.patch)
        .eq("id", vars.id)
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Task;
    },
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: qk.tasks() });
      const snapshots = client.getQueriesData({ queryKey: qk.tasks() }) as [
        readonly unknown[],
        unknown,
      ][];
      client.setQueriesData({ queryKey: qk.tasks() }, (old) =>
        patchInCaches(old, vars.id, vars.patch),
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        for (const [key, data] of ctx.snapshots) {
          client.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.tasks() });
    },
  });
}

// Delete uses the centralized softDelete() helper in src/webview/lib/softDelete.ts.

// Stop-timer mutation: bumps time_spent_minutes on the task and inserts a
// time_entries row in one logical step. Optimistic patch keeps the UI snappy;
// server is authoritative for the final minute count.
export function useStopTimerMutation() {
  const client = useQueryClient();
  return createMutation<
    void,
    Error,
    {
      taskId: string;
      projectId: string | null;
      currentMinutes: number;
      addMinutes: number;
      startedAt: string;
      endedAt: string;
    }
  >({
    mutationFn: async (vars) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const supa = getSupabase();
      const { error: e1 } = await supa
        .from("tasks")
        .update({
          time_spent_minutes: vars.currentMinutes + vars.addMinutes,
        })
        .eq("id", vars.taskId);
      if (e1) {
        throw e1;
      }
      const { error: e2 } = await supa.from("time_entries").insert({
        user_id: auth.user.id,
        task_id: vars.taskId,
        project_id: vars.projectId,
        started_at: vars.startedAt,
        ended_at: vars.endedAt,
        duration_minutes: vars.addMinutes,
      });
      if (e2) {
        throw e2;
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.tasks() });
      client.invalidateQueries({ queryKey: qk.timeEntries() });
    },
  });
}
