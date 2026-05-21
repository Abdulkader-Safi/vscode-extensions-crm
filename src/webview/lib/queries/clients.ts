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

export type Client = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type ClientInsert = Omit<Client, "id" | "created_at" | "updated_at"> & {
  user_id: string;
};

async function fetchClients(): Promise<Client[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("clients")
    .select("*")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as Client[]) ?? [];
}

async function fetchClient(id: string): Promise<Client | null> {
  if (!auth.user) {
    return null;
  }
  const { data, error } = await getSupabase()
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as Client) ?? null;
}

export function useClientsQuery() {
  return createQuery<Client[], Error>({
    queryKey: qk.clients(),
    queryFn: fetchClients,
  });
}

// Filter shape consumed by the paginated list query. Sort is fixed to
// `created_at desc` for the cards grid — no sort UI on /clients today.
export type ClientListFilters = {
  search?: string;
  tags?: string[];
};

// Paginated list query for /clients. Filters become server-side: search uses
// PostgREST's .or() across name/company/email; tag overlap uses .overlaps()
// on the tags text[] column. queryKey holds the live spec so changing
// filters refetches from page 0.
export function useClientsListQuery(
  argsStore: Readable<{ filters: ClientListFilters }>,
) {
  return createInfiniteQuery(
    derivedStore(argsStore, ({ filters }) => ({
      queryKey: ["clients", "list", filters] as readonly unknown[],
      initialPageParam: 0,
      getNextPageParam: (last: Client[], all: Client[][]) => {
        if (last.length < PAGE_SIZE) return undefined;
        return all.length * PAGE_SIZE;
      },
      queryFn: async ({ pageParam }: { pageParam: number }) => {
        if (!auth.user) return [];
        let q = getSupabase()
          .from("clients")
          .select("*")
          .eq("user_id", auth.user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(pageParam, pageParam + PAGE_SIZE - 1);
        if (filters.search) {
          const term = filters.search.replace(/[%_]/g, "\\$&");
          q = q.or(
            `name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`,
          );
        }
        if (filters.tags && filters.tags.length > 0) {
          q = q.overlaps("tags", filters.tags);
        }
        const { data, error } = await q;
        if (error) throw error;
        return (data as Client[]) ?? [];
      },
    })),
  );
}

// Separate tiny query for the full set of distinct tags so the chip strip
// shows every tag the user has, not just the ones on currently-loaded pages.
async function fetchDistinctClientTags(): Promise<string[]> {
  if (!auth.user) return [];
  const { data, error } = await getSupabase()
    .from("clients")
    .select("tags")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of (data ?? []) as { tags: string[] | null }[]) {
    for (const t of row.tags ?? []) set.add(t);
  }
  return [...set].sort();
}

export function useClientTagsQuery() {
  return createQuery<string[], Error>({
    queryKey: ["clients", "tags"] as const,
    queryFn: fetchDistinctClientTags,
  });
}

export function useClientQuery(id: string) {
  return createQuery<Client | null, Error>({
    queryKey: qk.client(id),
    queryFn: () => fetchClient(id),
    enabled: !!id,
  });
}

type CreateCtx = {
  snapshots: [readonly unknown[], unknown][];
  optimisticId: string;
};
type UpdateCtx = {
  snapshots: [readonly unknown[], unknown][];
  previousOne: Client | undefined;
};

export function useCreateClientMutation() {
  const client = useQueryClient();
  return createMutation<
    Client,
    Error,
    Omit<ClientInsert, "user_id">,
    CreateCtx
  >({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("clients")
        .insert({ ...payload, user_id: auth.user.id })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Client;
    },
    onMutate: async (payload) => {
      await client.cancelQueries({ queryKey: qk.clients() });
      const snapshots = client.getQueriesData({ queryKey: qk.clients() }) as [
        readonly unknown[],
        unknown,
      ][];
      const optimistic: Client = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...payload,
        created_at: new Date().toISOString(),
      } as Client;
      client.setQueriesData({ queryKey: qk.clients() }, (old) =>
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
      client.setQueriesData({ queryKey: qk.clients() }, (old) =>
        replaceInCaches(old, ctx.optimisticId, real),
      );
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.clients() });
      // Distinct-tags query may need to refresh if tags changed.
      client.invalidateQueries({ queryKey: ["clients", "tags"] });
    },
  });
}

export function useUpdateClientMutation() {
  const client = useQueryClient();
  return createMutation<
    Client,
    Error,
    { id: string; patch: Partial<Client> },
    UpdateCtx
  >({
    mutationFn: async (vars) => {
      const { data, error } = await getSupabase()
        .from("clients")
        .update(vars.patch)
        .eq("id", vars.id)
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Client;
    },
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: qk.clients() });
      await client.cancelQueries({ queryKey: qk.client(vars.id) });
      const snapshots = client.getQueriesData({ queryKey: qk.clients() }) as [
        readonly unknown[],
        unknown,
      ][];
      const previousOne = client.getQueryData<Client>(qk.client(vars.id));
      client.setQueriesData({ queryKey: qk.clients() }, (old) =>
        patchInCaches(old, vars.id, vars.patch),
      );
      if (previousOne) {
        client.setQueryData<Client>(qk.client(vars.id), {
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
          client.setQueryData(qk.client(vars.id), ctx.previousOne);
        }
      }
    },
    onSettled: (_data, _err, vars) => {
      client.invalidateQueries({ queryKey: qk.clients() });
      client.invalidateQueries({ queryKey: qk.client(vars.id) });
      client.invalidateQueries({ queryKey: ["clients", "tags"] });
    },
  });
}

// Delete uses the centralized softDelete() helper in src/webview/lib/softDelete.ts.
