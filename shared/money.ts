// Money helpers (Wave 4.1).
//
// Storage: integer cents in *_cents columns (bigint in Postgres,
// `number` in JS — safe up to 2^53 = ~$90 trillion).
//
// Why a shared module: client + server both need to format / parse the
// same way, so the helpers live under shared/ and import nothing from
// either side.
//
// Edge cases handled:
//   - "$19.99" / "19.99" / "19" / "  19.99 " — all parse to 1999.
//   - "19.999" — rounds to nearest cent (1999/2000) per banker's-style
//     half-to-even via Math.round (which is half-away-from-zero, but
//     that's the more intuitive behavior for money).
//   - "" / "abc" / null / undefined — returns null, never NaN.

const NON_NUMERIC = /[^0-9.\-]/g;

// Parse a user/external string like "19.99", "$1,234.50", "USD 19.99"
// into integer cents. Returns null when the input doesn't contain a
// real number (so the caller can decide between "default to 0" and
// "reject the row").
export function dollarsToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  const stripped = input.replace(NON_NUMERIC, "");
  if (stripped === "" || stripped === "-" || stripped === ".") return null;
  const n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// Format integer cents back to a money string for display. Uses
// Intl.NumberFormat where available (server + browser). Currency
// defaults to USD.
export function centsToDisplay(
  cents: number | null | undefined,
  currency = "USD",
  locale = "en-US",
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(0);
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

// Cents → JS Number dollars (no formatting). Useful for chart libs that
// want a raw numeric value with decimal cents preserved.
export function centsToDollars(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return 0;
  return cents / 100;
}
