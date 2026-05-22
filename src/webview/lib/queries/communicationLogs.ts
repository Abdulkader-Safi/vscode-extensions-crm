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
  lead_id?: string | null;
  task_id?: string | null;
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

// --- Lead variants (Batch 19) — same table, scoped by lead_id. ---

const leadLogsKey = (leadId: string) =>
  ["communication_logs", "lead", leadId] as const;

async function fetchLeadCommunicationLogs(
  leadId: string,
): Promise<CommunicationLog[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("communication_logs")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as CommunicationLog[]) ?? [];
}

export function useLeadCommunicationLogsQuery(leadId: string) {
  return createQuery<CommunicationLog[], Error>({
    queryKey: leadLogsKey(leadId),
    queryFn: () => fetchLeadCommunicationLogs(leadId),
    enabled: !!leadId,
  });
}

export function useCreateLeadCommunicationLogMutation(leadId: string) {
  const client = useQueryClient();
  return createMutation<
    CommunicationLog,
    Error,
    Omit<CommunicationLogInsert, "user_id" | "client_id" | "lead_id">
  >({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("communication_logs")
        .insert({ ...payload, user_id: auth.user.id, lead_id: leadId })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as CommunicationLog;
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: leadLogsKey(leadId) });
    },
  });
}

// --- Task variants (Batch 16) — same table, scoped by task_id. ---

const taskLogsKey = (taskId: string) =>
  ["communication_logs", "task", taskId] as const;

async function fetchTaskCommunicationLogs(
  taskId: string,
): Promise<CommunicationLog[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("communication_logs")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("task_id", taskId)
    .order("occurred_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as CommunicationLog[]) ?? [];
}

export function useTaskCommunicationLogsQuery(taskId: string) {
  return createQuery<CommunicationLog[], Error>({
    queryKey: taskLogsKey(taskId),
    queryFn: () => fetchTaskCommunicationLogs(taskId),
    enabled: !!taskId,
  });
}

export function useCreateTaskCommunicationLogMutation(taskId: string) {
  const client = useQueryClient();
  return createMutation<
    CommunicationLog,
    Error,
    Omit<CommunicationLogInsert, "user_id" | "client_id" | "task_id">
  >({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("communication_logs")
        .insert({ ...payload, user_id: auth.user.id, task_id: taskId })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as CommunicationLog;
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: taskLogsKey(taskId) });
    },
  });
}
