// Read-side queries for the Trash view: rows with `deleted_at IS NOT NULL`.
// Mutations live in src/webview/lib/softDelete.ts (restore / purge).

import { createQuery } from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import {
  TRASH_COUNT_KEY,
  trashKey,
  type SoftDeletableTable,
} from "../softDelete";

export type TrashRow = {
  id: string;
  // Loose typing — the trash list only renders a "label" + deleted_at; the
  // exact column set per table varies (name vs title vs invoice_number).
  [key: string]: unknown;
  deleted_at: string;
};

const SOFT_DELETABLE_TABLES: SoftDeletableTable[] = [
  "clients",
  "projects",
  "tasks",
  "invoices",
  "expenses",
  "leads",
];

const PRIMARY_LABEL: Record<SoftDeletableTable, string> = {
  clients: "name",
  projects: "name",
  tasks: "title",
  invoices: "invoice_number",
  expenses: "description",
  leads: "name",
};

export function rowLabel(table: SoftDeletableTable, row: TrashRow): string {
  const key = PRIMARY_LABEL[table];
  const v = row[key];
  if (typeof v === "string" && v.trim()) {
    return v;
  }
  return row.id.slice(0, 8);
}

async function fetchTrash(table: SoftDeletableTable): Promise<TrashRow[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from(table)
    .select("*")
    .eq("user_id", auth.user.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as TrashRow[]) ?? [];
}

export function useTrashQuery(table: SoftDeletableTable) {
  return createQuery<TrashRow[], Error>({
    queryKey: trashKey(table),
    queryFn: () => fetchTrash(table),
  });
}

export type TrashCounts = Record<SoftDeletableTable, number>;

async function fetchTrashCounts(): Promise<TrashCounts> {
  if (!auth.user) {
    return {
      clients: 0,
      projects: 0,
      tasks: 0,
      invoices: 0,
      expenses: 0,
      leads: 0,
    };
  }
  const supa = getSupabase();
  const userId = auth.user.id;
  const results = await Promise.all(
    SOFT_DELETABLE_TABLES.map((t) =>
      supa
        .from(t)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("deleted_at", "is", null),
    ),
  );
  const counts: TrashCounts = {
    clients: 0,
    projects: 0,
    tasks: 0,
    invoices: 0,
    expenses: 0,
    leads: 0,
  };
  SOFT_DELETABLE_TABLES.forEach((t, i) => {
    counts[t] = results[i].count ?? 0;
  });
  return counts;
}

export function useTrashCountsQuery() {
  return createQuery<TrashCounts, Error>({
    queryKey: TRASH_COUNT_KEY,
    queryFn: fetchTrashCounts,
  });
}
