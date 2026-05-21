import {
  createQuery,
  createInfiniteQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import type { Readable } from "svelte/store";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";
import {
  PAGE_SIZE,
  derivedStore,
  prependToCaches,
  replaceInCaches,
} from "./pagination";

export type Expense = {
  id: string;
  category: string;
  amount: number;
  vendor: string | null;
  description: string | null;
  expense_date: string;
  currency: string;
  project_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseInsert = Omit<Expense, "id" | "created_at" | "updated_at">;

async function fetchExpenses(): Promise<Expense[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("expenses")
    .select("*")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .order("expense_date", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as Expense[]) ?? [];
}

export function useExpensesQuery() {
  return createQuery<Expense[], Error>({
    queryKey: qk.expenses(),
    queryFn: fetchExpenses,
  });
}

// Filter + sort shape for the paginated list. The route precomputes
// `projectIds` for the selected client (since expenses join client through
// `expenses.project_id → projects.client_id`) and passes it here.
export type ExpenseListFilters = {
  category?: string;
  from?: string;
  to?: string;
  projectIds?: string[]; // when set, .in("project_id", projectIds)
};
export type ExpenseListSortField = "expense_date" | "category" | "amount";
export type ExpenseListSort = {
  field: ExpenseListSortField;
  direction: "asc" | "desc";
};

export function useExpensesListQuery(
  argsStore: Readable<{
    filters: ExpenseListFilters;
    sort: ExpenseListSort;
  }>,
) {
  return createInfiniteQuery(
    derivedStore(argsStore, ({ filters, sort }) => ({
      queryKey: ["expenses", "list", filters, sort] as readonly unknown[],
      initialPageParam: 0,
      getNextPageParam: (last: Expense[], all: Expense[][]) => {
        if (last.length < PAGE_SIZE) return undefined;
        return all.length * PAGE_SIZE;
      },
      queryFn: async ({ pageParam }: { pageParam: number }) => {
        if (!auth.user) return [];
        let q = getSupabase()
          .from("expenses")
          .select("*")
          .eq("user_id", auth.user.id)
          .is("deleted_at", null)
          .order(sort.field, { ascending: sort.direction === "asc" })
          .range(pageParam, pageParam + PAGE_SIZE - 1);
        if (filters.category) q = q.eq("category", filters.category);
        if (filters.from) q = q.gte("expense_date", filters.from);
        if (filters.to) q = q.lte("expense_date", filters.to);
        if (filters.projectIds && filters.projectIds.length > 0) {
          q = q.in("project_id", filters.projectIds);
        }
        const { data, error } = await q;
        if (error) throw error;
        return (data as Expense[]) ?? [];
      },
    })),
  );
}

// Aggregates query — runs server-side over ALL the user's non-deleted
// expenses (no filters applied) so the StatCards reflect total spend, not
// only the currently-loaded pages. The route applies filters separately for
// the table view.
export type ExpenseTotals = {
  total: number;
  thisMonth: number;
  count: number;
};

async function fetchExpenseTotals(): Promise<ExpenseTotals> {
  if (!auth.user) return { total: 0, thisMonth: 0, count: 0 };
  // Two cheap queries: SUM(amount) overall + SUM(amount) where current month.
  // We could use a single RPC, but two select-amount queries are fine at our
  // scale (each touches one index).
  const ym = new Date().toISOString().slice(0, 7);
  const monthStart = `${ym}-01`;
  // Compute next-month start for an exclusive upper bound.
  const next = new Date(`${monthStart}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const monthEnd = next.toISOString().slice(0, 10);
  const [allRes, monthRes] = await Promise.all([
    getSupabase()
      .from("expenses")
      .select("amount", { count: "exact" })
      .eq("user_id", auth.user.id)
      .is("deleted_at", null),
    getSupabase()
      .from("expenses")
      .select("amount")
      .eq("user_id", auth.user.id)
      .is("deleted_at", null)
      .gte("expense_date", monthStart)
      .lt("expense_date", monthEnd),
  ]);
  if (allRes.error) throw allRes.error;
  if (monthRes.error) throw monthRes.error;
  const total = (allRes.data as { amount: number }[]).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );
  const thisMonth = (monthRes.data as { amount: number }[]).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );
  return { total, thisMonth, count: allRes.count ?? 0 };
}

export function useExpenseTotalsQuery() {
  return createQuery<ExpenseTotals, Error>({
    queryKey: ["expenses", "totals"] as const,
    queryFn: fetchExpenseTotals,
  });
}

type CreateCtx = {
  snapshots: [readonly unknown[], unknown][];
  optimisticId: string;
};

export function useCreateExpenseMutation() {
  const client = useQueryClient();
  return createMutation<
    Expense,
    Error,
    Omit<ExpenseInsert, "user_id">,
    CreateCtx
  >({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("expenses")
        .insert({ ...payload, user_id: auth.user.id })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Expense;
    },
    onMutate: async (payload) => {
      await client.cancelQueries({ queryKey: qk.expenses() });
      const snapshots = client.getQueriesData({ queryKey: qk.expenses() }) as [
        readonly unknown[],
        unknown,
      ][];
      const optimistic = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...payload,
        created_at: new Date().toISOString(),
      } as Expense;
      client.setQueriesData({ queryKey: qk.expenses() }, (old) =>
        prependToCaches(old, optimistic),
      );
      return { snapshots, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        for (const [key, data] of ctx.snapshots) {
          client.setQueryData(key, data);
        }
      }
    },
    onSuccess: (real, _vars, ctx) => {
      if (!ctx) return;
      client.setQueriesData({ queryKey: qk.expenses() }, (old) =>
        replaceInCaches(old, ctx.optimisticId, real),
      );
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.expenses() });
      client.invalidateQueries({ queryKey: ["expenses", "totals"] });
    },
  });
}

// Delete uses the centralized softDelete() helper in src/webview/lib/softDelete.ts.
