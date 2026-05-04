import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

export type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: string;
  value: number;
  notes: string | null;
  position: number;
  converted_client_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LeadInsert = Omit<Lead, "id" | "created_at" | "updated_at">;

async function fetchLeads(): Promise<Lead[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("leads")
    .select("*")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .order("position");
  if (error) {
    throw error;
  }
  return (data as Lead[]) ?? [];
}

export function useLeadsQuery() {
  return createQuery<Lead[], Error>({
    queryKey: qk.leads(),
    queryFn: fetchLeads,
  });
}

type ReorderCtx = { previous: Lead[] };

export function useCreateLeadMutation() {
  const client = useQueryClient();
  return createMutation<Lead, Error, Omit<LeadInsert, "user_id">>({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("leads")
        .insert({ ...payload, user_id: auth.user.id })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Lead;
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.leads() });
    },
  });
}

// Delete uses the centralized softDelete() helper in src/webview/lib/softDelete.ts.

// Convert lead → insert client + flip lead.stage to "won".
// Two-step (no atomic Postgres function) — failure mode: client created
// but lead update fails ⇒ user can re-fire; client de-dup is on the user.
export function useConvertLeadMutation() {
  const client = useQueryClient();
  return createMutation<{ id: string }, Error, Lead>({
    mutationFn: async (lead) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const supa = getSupabase();
      const { data, error } = await supa
        .from("clients")
        .insert({
          user_id: auth.user.id,
          name: lead.name,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          notes: lead.notes,
        })
        .select()
        .single();
      if (error) {
        throw error;
      }
      const { error: e2 } = await supa
        .from("leads")
        .update({ stage: "won", converted_client_id: data.id })
        .eq("id", lead.id);
      if (e2) {
        throw e2;
      }
      return data;
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.leads() });
      client.invalidateQueries({ queryKey: qk.clients() });
    },
  });
}

// Bulk reorder after a kanban drop. Each card gets its column's stage and
// its index as position. Optimistic patch reflects the local drop instantly.
export function useReorderLeadsMutation() {
  const client = useQueryClient();
  return createMutation<
    void,
    Error,
    { id: string; stage: string; position: number }[],
    ReorderCtx
  >({
    mutationFn: async (updates) => {
      const supa = getSupabase();
      await Promise.all(
        updates.map((u) =>
          supa
            .from("leads")
            .update({ stage: u.stage, position: u.position })
            .eq("id", u.id),
        ),
      );
    },
    onMutate: async (updates) => {
      await client.cancelQueries({ queryKey: qk.leads() });
      const previous = client.getQueryData<Lead[]>(qk.leads()) ?? [];
      const byId = new Map(updates.map((u) => [u.id, u] as const));
      client.setQueryData<Lead[]>(qk.leads(), (old) =>
        (old ?? []).map((l) => {
          const patch = byId.get(l.id);
          return patch
            ? { ...l, stage: patch.stage, position: patch.position }
            : l;
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.leads(), ctx.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.leads() });
    },
  });
}
