// Soft-delete / restore / purge for every list-bearing table.
// One canonical entrypoint replaces the per-table delete mutations.
// Design notes:
//  - softDelete optimistically drops rows from the list cache, PATCHes
//    deleted_at, then surfaces a 5s toast with an "Undo" action that calls
//    restore() with the same ids. svelte-sonner provides the action button.
//  - No cascade. Soft-deleting a client leaves its invoices alive — restore
//    brings the parent back; children were never hidden.
//  - purge() is the hard-delete path (only used from the Trash view).
//
// Invalidation hits TABLE_INVALIDATIONS keys + the trash/count keys so the
// sidebar badge updates without manual wiring per call site.

import { toast } from "svelte-sonner";
import type { QueryClient } from "@tanstack/svelte-query";
import { getSupabase } from "./supabase";
import { auth } from "./stores/auth.svelte";
import { qk, TABLE_INVALIDATIONS } from "./queries/keys";

export type SoftDeletableTable =
  | "clients"
  | "projects"
  | "tasks"
  | "invoices"
  | "expenses"
  | "leads";

const LIST_KEY: Record<SoftDeletableTable, readonly unknown[]> = {
  clients: qk.clients(),
  projects: qk.projects(),
  tasks: qk.tasks(),
  invoices: qk.invoices(),
  expenses: qk.expenses(),
  leads: qk.leads(),
};

const LABEL: Record<SoftDeletableTable, { one: string; many: string }> = {
  clients: { one: "Client", many: "clients" },
  projects: { one: "Project", many: "projects" },
  tasks: { one: "Task", many: "tasks" },
  invoices: { one: "Invoice", many: "invoices" },
  expenses: { one: "Expense", many: "expenses" },
  leads: { one: "Lead", many: "leads" },
};

type Row = { id: string };

export const TRASH_COUNT_KEY = ["trash", "_count"] as const;
export function trashKey(table: SoftDeletableTable): readonly unknown[] {
  return ["trash", table] as const;
}

function describe(
  table: SoftDeletableTable,
  n: number,
  verb: "deleted" | "restored" | "permanently deleted",
): string {
  const lbl = LABEL[table];
  return n === 1 ? `${lbl.one} ${verb}` : `${n} ${lbl.many} ${verb}`;
}

function invalidateAll(client: QueryClient, table: SoftDeletableTable): void {
  for (const key of TABLE_INVALIDATIONS[table] ?? []) {
    client.invalidateQueries({ queryKey: key });
  }
  client.invalidateQueries({ queryKey: trashKey(table) });
  client.invalidateQueries({ queryKey: TRASH_COUNT_KEY });
}

async function patchDeletedAt(
  table: SoftDeletableTable,
  ids: string[],
  deletedAt: string | null,
): Promise<void> {
  if (!auth.user) {
    throw new Error("Not authenticated");
  }
  const { error } = await getSupabase()
    .from(table)
    .update({ deleted_at: deletedAt })
    .in("id", ids)
    .eq("user_id", auth.user.id);
  if (error) {
    throw error;
  }
}

export async function softDelete(
  client: QueryClient,
  table: SoftDeletableTable,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const listKey = LIST_KEY[table];
  await client.cancelQueries({ queryKey: listKey });
  const previous = client.getQueryData<Row[]>(listKey) ?? [];
  const idSet = new Set(ids);
  client.setQueryData<Row[]>(
    listKey,
    previous.filter((r) => !idSet.has(r.id)),
  );
  try {
    await patchDeletedAt(table, ids, new Date().toISOString());
    toast.success(describe(table, ids.length, "deleted"), {
      duration: 5_000,
      action: {
        label: "Undo",
        onClick: () => {
          void restore(client, table, ids);
        },
      },
    });
    invalidateAll(client, table);
  } catch (e) {
    client.setQueryData(listKey, previous);
    toast.error((e as Error).message);
    throw e;
  }
}

export async function restore(
  client: QueryClient,
  table: SoftDeletableTable,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  try {
    await patchDeletedAt(table, ids, null);
    invalidateAll(client, table);
    toast.success(describe(table, ids.length, "restored"));
  } catch (e) {
    toast.error((e as Error).message);
    throw e;
  }
}

export async function purge(
  client: QueryClient,
  table: SoftDeletableTable,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  if (!auth.user) {
    throw new Error("Not authenticated");
  }
  const { error } = await getSupabase()
    .from(table)
    .delete()
    .in("id", ids)
    .eq("user_id", auth.user.id);
  if (error) {
    toast.error(error.message);
    throw error;
  }
  invalidateAll(client, table);
  toast.success(describe(table, ids.length, "permanently deleted"));
}
