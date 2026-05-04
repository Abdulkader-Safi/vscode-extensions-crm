import type { QueryClient } from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { markRealtimeStatus } from "../connection.svelte";
import { TABLE_INVALIDATIONS } from "./keys";
import {
  TRASH_COUNT_KEY,
  trashKey,
  type SoftDeletableTable,
} from "../softDelete";

// Subscribe to postgres_changes for every table the app reads. When a row
// changes, invalidate the matching query keys so any cache entry refetches.
// For the tab that just mutated, invalidation is a no-op race (its data is
// already optimistic + server-confirmed). For *other* tabs / clients, this
// is what makes multi-tab sync feel live.
//
// We use one channel for the whole schema (cheaper than one per table) and
// dispatch on `payload.table`.
//
// Soft-delete: an UPDATE flipping `deleted_at` looks identical to any other
// UPDATE. We don't read the payload to distinguish — invalidating both the
// live list and the trash list lets each refetch with its own filter and
// converge to the right state in any direction (delete, restore, edit).
const SOFT_DELETABLE: ReadonlySet<SoftDeletableTable> = new Set([
  "clients",
  "projects",
  "tasks",
  "invoices",
  "expenses",
  "leads",
]);

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
        if (SOFT_DELETABLE.has(t as SoftDeletableTable)) {
          client.invalidateQueries({
            queryKey: trashKey(t as SoftDeletableTable),
          });
          client.invalidateQueries({ queryKey: TRASH_COUNT_KEY });
        }
      },
    )
    .subscribe((status) => {
      markRealtimeStatus(status);
    });
  return () => {
    supa.removeChannel(channel);
  };
}
