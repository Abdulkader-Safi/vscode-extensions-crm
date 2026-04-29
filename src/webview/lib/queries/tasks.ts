import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

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
  created_at?: string;
  updated_at?: string;
};

export type TaskInsert = Omit<Task, "id" | "created_at" | "updated_at">;

async function fetchTasks(projectId?: string): Promise<Task[]> {
  if (!auth.user) {
    return [];
  }
  let q = getSupabase()
    .from("tasks")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (projectId) {
    q = q.eq("project_id", projectId);
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

type CreateCtx = { previous: Task[]; optimisticId: string };
type UpdateCtx = { previous: Task[] };
type DeleteCtx = { previous: Task[] };

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
      const previous = client.getQueryData<Task[]>(qk.tasks()) ?? [];
      const optimistic = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...payload,
        time_spent_minutes: payload.time_spent_minutes ?? 0,
        completed_at: payload.completed_at ?? null,
        created_at: new Date().toISOString(),
      } as Task;
      client.setQueryData<Task[]>(qk.tasks(), [optimistic, ...previous]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.tasks(), ctx.previous);
      }
    },
    onSuccess: (real, _vars, ctx) => {
      client.setQueryData<Task[]>(qk.tasks(), (old) =>
        (old ?? []).map((t) => (t.id === ctx?.optimisticId ? real : t)),
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
      const previous = client.getQueryData<Task[]>(qk.tasks()) ?? [];
      client.setQueryData<Task[]>(qk.tasks(), (old) =>
        (old ?? []).map((t) =>
          t.id === vars.id ? { ...t, ...vars.patch } : t,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.tasks(), ctx.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.tasks() });
    },
  });
}

export function useDeleteTaskMutation() {
  const client = useQueryClient();
  return createMutation<string, Error, string, DeleteCtx>({
    mutationFn: async (id) => {
      const { error } = await getSupabase().from("tasks").delete().eq("id", id);
      if (error) {
        throw error;
      }
      return id;
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: qk.tasks() });
      const previous = client.getQueryData<Task[]>(qk.tasks()) ?? [];
      client.setQueryData<Task[]>(
        qk.tasks(),
        previous.filter((t) => t.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx) {
        client.setQueryData(qk.tasks(), ctx.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.tasks() });
    },
  });
}

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
