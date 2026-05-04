import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number | null | undefined,
  currency = "USD",
) {
  const v = amount ?? 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function formatMinutes(mins: number | null | undefined): string {
  const m = mins ?? 0;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function ymd(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// Format a date/time using the user's configured IANA timezone + locale.
// Accepts string or Date; returns localised "Mar 15, 2026, 2:30 PM" style by
// default. Falls back to the raw string if Intl rejects the timezone (which
// happens on stale legacy values from the DB).
export function formatDateTime(
  value: string | Date | null | undefined,
  timezone: string = "UTC",
  locale?: string,
): string {
  if (!value) {
    return "";
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    return String(value);
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function formatDate(
  value: string | Date | null | undefined,
  timezone: string = "UTC",
  locale?: string,
): string {
  if (!value) {
    return "";
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    return String(value);
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      dateStyle: "medium",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// Curated IANA timezone list. Keeping this short rather than importing the
// full IANA tzdata; the user can pick "UTC" if they don't see their region.
export const TIMEZONES: readonly string[] = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Riyadh",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Pacific/Auckland",
];
