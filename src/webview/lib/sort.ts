export type SortDir = "asc" | "desc";

export function compareBy<T>(
  field: keyof T | ((x: T) => unknown),
  dir: SortDir,
): (a: T, b: T) => number {
  const get =
    typeof field === "function"
      ? (field as (x: T) => unknown)
      : (x: T) => x[field as keyof T];
  const sign = dir === "asc" ? 1 : -1;
  return (a, b) => {
    const av = get(a) as unknown;
    const bv = get(b) as unknown;
    // Nulls always sort last regardless of direction so an "asc" by
    // due-date doesn't bury everything that has a date under everything
    // that doesn't.
    if (av == null && bv == null) {
      return 0;
    }
    if (av == null) {
      return 1;
    }
    if (bv == null) {
      return -1;
    }
    if ((av as never) < (bv as never)) {
      return -1 * sign;
    }
    if ((av as never) > (bv as never)) {
      return 1 * sign;
    }
    return 0;
  };
}
