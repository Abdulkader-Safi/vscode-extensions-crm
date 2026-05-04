import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  client_id: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  created_at?: string;
  updated_at?: string;
};

export type ProjectInsert = Omit<Project, "id" | "created_at" | "updated_at">;

async function fetchProjects(): Promise<Project[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as Project[]) ?? [];
}

async function fetchProject(id: string): Promise<Project | null> {
  if (!auth.user) {
    return null;
  }
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as Project) ?? null;
}

export function useProjectsQuery() {
  return createQuery<Project[], Error>({
    queryKey: qk.projects(),
    queryFn: fetchProjects,
  });
}

export function useProjectQuery(id: string) {
  return createQuery<Project | null, Error>({
    queryKey: qk.project(id),
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });
}

type CreateCtx = { previous: Project[]; optimisticId: string };
type UpdateCtx = { previousList: Project[]; previousOne: Project | undefined };

export function useCreateProjectMutation() {
  const client = useQueryClient();
  return createMutation<
    Project,
    Error,
    Omit<ProjectInsert, "user_id">,
    CreateCtx
  >({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("projects")
        .insert({ ...payload, user_id: auth.user.id })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Project;
    },
    onMutate: async (payload) => {
      await client.cancelQueries({ queryKey: qk.projects() });
      const previous = client.getQueryData<Project[]>(qk.projects()) ?? [];
      const optimistic = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...payload,
        created_at: new Date().toISOString(),
      } as Project;
      client.setQueryData<Project[]>(qk.projects(), [optimistic, ...previous]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.projects(), ctx.previous);
      }
    },
    onSuccess: (real, _vars, ctx) => {
      client.setQueryData<Project[]>(qk.projects(), (old) =>
        (old ?? []).map((p) => (p.id === ctx?.optimisticId ? real : p)),
      );
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.projects() });
    },
  });
}

export function useUpdateProjectMutation() {
  const client = useQueryClient();
  return createMutation<
    Project,
    Error,
    { id: string; patch: Partial<Project> },
    UpdateCtx
  >({
    mutationFn: async (vars) => {
      const { data, error } = await getSupabase()
        .from("projects")
        .update(vars.patch)
        .eq("id", vars.id)
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Project;
    },
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: qk.projects() });
      await client.cancelQueries({ queryKey: qk.project(vars.id) });
      const previousList = client.getQueryData<Project[]>(qk.projects()) ?? [];
      const previousOne = client.getQueryData<Project>(qk.project(vars.id));
      client.setQueryData<Project[]>(qk.projects(), (old) =>
        (old ?? []).map((p) =>
          p.id === vars.id ? { ...p, ...vars.patch } : p,
        ),
      );
      if (previousOne) {
        client.setQueryData<Project>(qk.project(vars.id), {
          ...previousOne,
          ...vars.patch,
        });
      }
      return { previousList, previousOne };
    },
    onError: (_err, vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.projects(), ctx.previousList);
        if (ctx.previousOne) {
          client.setQueryData(qk.project(vars.id), ctx.previousOne);
        }
      }
    },
    onSettled: (_data, _err, vars) => {
      client.invalidateQueries({ queryKey: qk.projects() });
      client.invalidateQueries({ queryKey: qk.project(vars.id) });
    },
  });
}

// Delete uses the centralized softDelete() helper in src/webview/lib/softDelete.ts.
