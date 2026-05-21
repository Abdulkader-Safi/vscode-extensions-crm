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
