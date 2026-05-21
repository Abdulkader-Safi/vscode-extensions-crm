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

export type ProjectListFilters = {
  status?: string;
  clientId?: string;
};
export type ProjectListSortField =
  | "created_at"
  | "name"
  | "end_date"
  | "budget";
export type ProjectListSort = {
  field: ProjectListSortField;
  direction: "asc" | "desc";
};

export function useProjectsListQuery(
  argsStore: Readable<{
    filters: ProjectListFilters;
    sort: ProjectListSort;
  }>,
) {
  return createInfiniteQuery(
    derivedStore(argsStore, ({ filters, sort }) => ({
      queryKey: ["projects", "list", filters, sort] as readonly unknown[],
      initialPageParam: 0,
      getNextPageParam: (last: Project[], all: Project[][]) => {
        if (last.length < PAGE_SIZE) return undefined;
        return all.length * PAGE_SIZE;
      },
      queryFn: async ({ pageParam }: { pageParam: number }) => {
        if (!auth.user) return [];
        let q = getSupabase()
          .from("projects")
          .select("*")
          .eq("user_id", auth.user.id)
          .is("deleted_at", null)
          .order(sort.field, { ascending: sort.direction === "asc" })
          .range(pageParam, pageParam + PAGE_SIZE - 1);
        if (filters.status) q = q.eq("status", filters.status);
        if (filters.clientId) q = q.eq("client_id", filters.clientId);
        const { data, error } = await q;
        if (error) throw error;
        return (data as Project[]) ?? [];
      },
    })),
  );
}

type CreateCtx = {
  snapshots: [readonly unknown[], unknown][];
  optimisticId: string;
};
type UpdateCtx = {
  snapshots: [readonly unknown[], unknown][];
  previousOne: Project | undefined;
};

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
      const snapshots = client.getQueriesData({ queryKey: qk.projects() }) as [
        readonly unknown[],
        unknown,
      ][];
      const optimistic = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...payload,
        created_at: new Date().toISOString(),
      } as Project;
      client.setQueriesData({ queryKey: qk.projects() }, (old) =>
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
      client.setQueriesData({ queryKey: qk.projects() }, (old) =>
        replaceInCaches(old, ctx.optimisticId, real),
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
      const snapshots = client.getQueriesData({ queryKey: qk.projects() }) as [
        readonly unknown[],
        unknown,
      ][];
      const previousOne = client.getQueryData<Project>(qk.project(vars.id));
      client.setQueriesData({ queryKey: qk.projects() }, (old) =>
        patchInCaches(old, vars.id, vars.patch),
      );
      if (previousOne) {
        client.setQueryData<Project>(qk.project(vars.id), {
          ...previousOne,
          ...vars.patch,
        });
      }
      return { snapshots, previousOne };
    },
    onError: (_err, vars, ctx) => {
      if (ctx) {
        for (const [key, data] of ctx.snapshots) {
          client.setQueryData(key, data);
        }
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
