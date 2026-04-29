import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

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

export function useClientQuery(id: string) {
  return createQuery<Client | null, Error>({
    queryKey: qk.client(id),
    queryFn: () => fetchClient(id),
    enabled: !!id,
  });
}

type CreateCtx = { previous: Client[]; optimisticId: string };
type UpdateCtx = { previousList: Client[]; previousOne: Client | undefined };
type DeleteCtx = { previous: Client[] };

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
      const previous = client.getQueryData<Client[]>(qk.clients()) ?? [];
      const optimistic: Client = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...payload,
        created_at: new Date().toISOString(),
      } as Client;
      client.setQueryData<Client[]>(qk.clients(), [optimistic, ...previous]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.clients(), ctx.previous);
      }
    },
    onSuccess: (real, _vars, ctx) => {
      client.setQueryData<Client[]>(qk.clients(), (old) =>
        (old ?? []).map((c) => (c.id === ctx?.optimisticId ? real : c)),
      );
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.clients() });
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
      const previousList = client.getQueryData<Client[]>(qk.clients()) ?? [];
      const previousOne = client.getQueryData<Client>(qk.client(vars.id));
      client.setQueryData<Client[]>(qk.clients(), (old) =>
        (old ?? []).map((c) =>
          c.id === vars.id ? { ...c, ...vars.patch } : c,
        ),
      );
      if (previousOne) {
        client.setQueryData<Client>(qk.client(vars.id), {
          ...previousOne,
          ...vars.patch,
        });
      }
      return { previousList, previousOne };
    },
    onError: (_err, vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.clients(), ctx.previousList);
        if (ctx.previousOne) {
          client.setQueryData(qk.client(vars.id), ctx.previousOne);
        }
      }
    },
    onSettled: (_data, _err, vars) => {
      client.invalidateQueries({ queryKey: qk.clients() });
      client.invalidateQueries({ queryKey: qk.client(vars.id) });
    },
  });
}

export function useDeleteClientMutation() {
  const client = useQueryClient();
  return createMutation<string, Error, string, DeleteCtx>({
    mutationFn: async (id) => {
      const { error } = await getSupabase()
        .from("clients")
        .delete()
        .eq("id", id);
      if (error) {
        throw error;
      }
      return id;
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: qk.clients() });
      const previous = client.getQueryData<Client[]>(qk.clients()) ?? [];
      client.setQueryData<Client[]>(
        qk.clients(),
        previous.filter((c) => c.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx) {
        client.setQueryData(qk.clients(), ctx.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.clients() });
    },
  });
}
