import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

export type CommunicationLog = {
  id: string;
  client_id: string | null;
  type: string;
  title: string | null;
  content: string | null;
  occurred_at: string;
  created_at: string;
};

export type CommunicationLogInsert = Omit<
  CommunicationLog,
  "id" | "created_at"
>;

async function fetchCommunicationLogs(
  clientId: string,
): Promise<CommunicationLog[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("communication_logs")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("client_id", clientId)
    .order("occurred_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as CommunicationLog[]) ?? [];
}

export function useCommunicationLogsQuery(clientId: string) {
  return createQuery<CommunicationLog[], Error>({
    queryKey: qk.communicationLogs(clientId),
    queryFn: () => fetchCommunicationLogs(clientId),
    enabled: !!clientId,
  });
}

export function useCreateCommunicationLogMutation(clientId: string) {
  const client = useQueryClient();
  return createMutation<
    CommunicationLog,
    Error,
    Omit<CommunicationLogInsert, "user_id" | "client_id">
  >({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("communication_logs")
        .insert({ ...payload, user_id: auth.user.id, client_id: clientId })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as CommunicationLog;
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.communicationLogs(clientId) });
    },
  });
}
