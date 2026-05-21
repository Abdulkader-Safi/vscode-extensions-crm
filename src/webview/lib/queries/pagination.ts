import type { Readable } from "svelte/store";

// Shared pagination constants for the list-page `createInfiniteQuery` hooks.
// 50 rows / page is the sweet spot — fast first paint, few "Load more" clicks
// for typical CRM sizes (most users have <500 of any one entity).
export const PAGE_SIZE = 50;

// Helper: getNextPageParam for our cursor-style range pagination. Each page
// returns up to PAGE_SIZE rows; the next pageParam is the running row count.
// Returning `undefined` tells TanStack there are no more pages.
export function getNextPageParam<T>(
  lastPage: T[],
  allPages: T[][],
): number | undefined {
  if (lastPage.length < PAGE_SIZE) {
    return undefined;
  }
  return allPages.length * PAGE_SIZE;
}

// TanStack `createInfiniteQuery` accepts a `Readable<options>` so the queryKey
// can update reactively as filters/sort change. Each list-query hook builds
// such a store by projecting the route's `{ filters, sort }` store into a
// full options object. Inlined here to avoid pulling in svelte/store's
// `derived` (it has extra multi-store semantics we don't need).
export function derivedStore<S, T>(
  source: Readable<S>,
  project: (s: S) => T,
): Readable<T> {
  return {
    subscribe: (run, invalidate) =>
      source.subscribe((s) => run(project(s)), invalidate),
  };
}

// Shape-aware cache helpers — every list-query hook supports two cache shapes
// under its prefix key:
//   - plain `T[]` for the legacy `useXQuery()` fetch-all hooks (still used by
//     detail pages and pickers)
//   - `InfiniteData<T[]>` (i.e. `{ pages: T[][]; pageParams: unknown[] }`) for
//     the new `useXListQuery()` paginated hooks
// Mutations update both via `setQueriesData({ queryKey: qk.xs() }, ...)`.

type InfiniteData<T> = { pages: T[][]; pageParams: unknown[] };

function isInfiniteData<T>(x: unknown): x is InfiniteData<T> {
  return typeof x === "object" && x !== null && "pages" in x;
}

// Prepend a newly-created row to every cache variant (page 0 only for
// InfiniteData since rows are ordered created_at DESC).
export function prependToCaches<T>(old: unknown, row: T): unknown {
  if (!old) return old;
  if (Array.isArray(old)) return [row, ...(old as T[])];
  if (isInfiniteData<T>(old)) {
    return {
      ...old,
      pages: old.pages.map((page, i) => (i === 0 ? [row, ...page] : page)),
    };
  }
  return old;
}

// Replace a single row by id (e.g. swap optimistic for server-returned).
export function replaceInCaches<T extends { id: string }>(
  old: unknown,
  id: string,
  next: T,
): unknown {
  if (!old) return old;
  if (Array.isArray(old)) {
    return (old as T[]).map((r) => (r.id === id ? next : r));
  }
  if (isInfiniteData<T>(old)) {
    return {
      ...old,
      pages: old.pages.map((page) => page.map((r) => (r.id === id ? next : r))),
    };
  }
  return old;
}

// Apply a partial patch to a single row by id.
export function patchInCaches<T extends { id: string }>(
  old: unknown,
  id: string,
  patch: Partial<T>,
): unknown {
  if (!old) return old;
  if (Array.isArray(old)) {
    return (old as T[]).map((r) =>
      r.id === id ? ({ ...r, ...patch } as T) : r,
    );
  }
  if (isInfiniteData<T>(old)) {
    return {
      ...old,
      pages: old.pages.map((page) =>
        page.map((r) => (r.id === id ? ({ ...r, ...patch } as T) : r)),
      ),
    };
  }
  return old;
}
