// Tiny FX helper. Rates are user-entered (stored in `profiles.fx_rates`)
// and expressed in "1 unit of currency X = N units of base currency".
// The base currency is the user's profile.currency.
//
// Why user-entered: live FX requires either a free API (rate-limited and
// blocked by CSP) or a Supabase Edge Function (deployment + cost). User-
// entered rates ship with zero infra and let the user pick whatever rate
// matches their accounting (mid-market vs invoice rate vs bank's actual fee).
//
// `convertToBase` returns the converted amount. If the source currency
// equals base, the rate is implicitly 1. If a non-base currency has no
// rate set, we fall back to 1 — the Reports footnote calls this out so the
// user knows to populate rates for accurate totals.

export function convertToBase(
  amount: number,
  fromCurrency: string,
  base: string,
  rates: Record<string, number>,
): number {
  if (!fromCurrency || fromCurrency === base) {
    return amount;
  }
  const r = rates[fromCurrency];
  if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) {
    return amount;
  }
  return amount * r;
}
