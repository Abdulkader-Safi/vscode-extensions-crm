import type { QueryClient } from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { TABLE_INVALIDATIONS } from "./keys";

// Subscribe to postgres_changes for every table the app reads. When a row
// changes, invalidate the matching query keys so any cache entry refetches.
// For the tab that just mutated, invalidation is a no-op race (its data is
// already optimistic + server-confirmed). For *other* tabs / clients, this
// is what makes multi-tab sync feel live.
//
// We use one channel for the whole schema (cheaper than one per table) and
// dispatch on `payload.table`.
export function startRealtime(client: QueryClient): () => void {
  const supa = getSupabase();
  const channel = supa
    .channel("vs-crm:postgres-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public" },
      (payload: { table?: string }) => {
        const t = payload.table;
        if (!t) {
          return;
        }
        const targets = TABLE_INVALIDATIONS[t];
        if (!targets) {
          return;
        }
        for (const key of targets) {
          client.invalidateQueries({ queryKey: key });
        }
      },
    )
    .subscribe();
  return () => {
    supa.removeChannel(channel);
  };
}
