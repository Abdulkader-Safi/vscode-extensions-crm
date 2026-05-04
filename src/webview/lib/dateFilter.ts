// String comparison is correct for both `YYYY-MM-DD` and full ISO timestamps,
// so we don't need to allocate a Date per row when filtering large lists.
export function inDateRange(
  iso: string | null | undefined,
  from: string,
  to: string,
): boolean {
  if (!iso) {
    return !from && !to;
  }
  if (from && iso < from) {
    return false;
  }
  if (to && iso > to) {
    return false;
  }
  return true;
}
