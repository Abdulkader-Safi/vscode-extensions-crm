import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

async function fetchNotifications(): Promise<Notification[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("notifications")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    throw error;
  }
  return (data as Notification[]) ?? [];
}

export function useNotificationsQuery() {
  return createQuery<Notification[], Error>({
    queryKey: qk.notifications(),
    queryFn: fetchNotifications,
  });
}

type Ctx = { previous: Notification[] };

export function useMarkNotificationReadMutation() {
  const client = useQueryClient();
  return createMutation<void, Error, string, Ctx>({
    mutationFn: async (id) => {
      const { error } = await getSupabase()
        .from("notifications")
        .update({ read: true })
        .eq("id", id);
      if (error) {
        throw error;
      }
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: qk.notifications() });
      const previous =
        client.getQueryData<Notification[]>(qk.notifications()) ?? [];
      client.setQueryData<Notification[]>(qk.notifications(), (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx) {
        client.setQueryData(qk.notifications(), ctx.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.notifications() });
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const client = useQueryClient();
  return createMutation<void, Error, void, Ctx>({
    mutationFn: async () => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { error } = await getSupabase()
        .from("notifications")
        .update({ read: true })
        .eq("user_id", auth.user.id)
        .eq("read", false);
      if (error) {
        throw error;
      }
    },
    onMutate: async () => {
      await client.cancelQueries({ queryKey: qk.notifications() });
      const previous =
        client.getQueryData<Notification[]>(qk.notifications()) ?? [];
      client.setQueryData<Notification[]>(qk.notifications(), (old) =>
        (old ?? []).map((n) => ({ ...n, read: true })),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx) {
        client.setQueryData(qk.notifications(), ctx.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.notifications() });
    },
  });
}
