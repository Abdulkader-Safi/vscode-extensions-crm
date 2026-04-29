import { createQuery } from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

export type TimeEntry = {
  id: string;
  task_id: string | null;
  project_id: string | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  created_at: string;
};

async function fetchTimeEntries(projectId?: string): Promise<TimeEntry[]> {
  if (!auth.user) {
    return [];
  }
  let q = getSupabase()
    .from("time_entries")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("started_at", { ascending: false });
  if (projectId) {
    q = q.eq("project_id", projectId);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return (data as TimeEntry[]) ?? [];
}

export function useTimeEntriesQuery(projectId?: string) {
  return createQuery<TimeEntry[], Error>({
    queryKey: qk.timeEntries(projectId),
    queryFn: () => fetchTimeEntries(projectId),
  });
}
