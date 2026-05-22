import { createInfiniteQuery } from "@tanstack/svelte-query";
import type { Readable } from "svelte/store";
import { auth } from "../stores/auth.svelte";
import { getSupabase } from "../supabase";
import type { InvoiceListFilters, InvoiceListSort, Invoice } from "./invoices";
import { derivedStore, PAGE_SIZE } from "./pagination";

// Paginated list query for the /invoices route. The caller passes a Svelte
// store of `{ filters, sort }` (typically derived from $state inside the
// route). When that store changes, TanStack sees a new queryKey and refetches
// from page 0. Returns rows in pages of PAGE_SIZE; `result.data.pages.flat()`
// gives the running list.

export function useInvoicesListQuery(
  argsStore: Readable<{ filters: InvoiceListFilters; sort: InvoiceListSort }>,
) {
  return createInfiniteQuery(
    derivedStore(argsStore, ({ filters, sort }) => ({
      queryKey: ["invoices", "list", filters, sort] as readonly unknown[],
      initialPageParam: 0,
      getNextPageParam: (last: Invoice[], all: Invoice[][]) => {
        if (last.length < PAGE_SIZE) {
          return undefined;
        }
        return all.length * PAGE_SIZE;
      },
      queryFn: async ({ pageParam }: { pageParam: number }) => {
        if (!auth.user) {
          return [];
        }
        let q = getSupabase()
          .from("invoices")
          .select("*")
          .eq("user_id", auth.user.id)
          .is("deleted_at", null)
          .order(sort.field, { ascending: sort.direction === "asc" })
          .range(pageParam, pageParam + PAGE_SIZE - 1);
        if (filters.status) {
          q = q.eq("status", filters.status);
        }
        if (filters.clientId) {
          q = q.eq("client_id", filters.clientId);
        }
        if (filters.from) {
          q = q.gte("issue_date", filters.from);
        }
        if (filters.to) {
          q = q.lte("issue_date", filters.to);
        }
        const { data, error } = await q;
        if (error) {
          throw error;
        }
        return (data as Invoice[]) ?? [];
      },
    })),
  );
}
