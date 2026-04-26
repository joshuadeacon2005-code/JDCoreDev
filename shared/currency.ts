// Centralised currency formatting for invoice rendering. Currency codes
// are free-form text on the DB side (clients.invoiceCurrency) — this map
// just gives us a symbol per code. Extend as new codes appear.

const SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  HKD: "HK$",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  NZD: "NZ$",
  JPY: "¥",
  CNY: "¥",
  CHF: "CHF",
  THB: "฿",
};

export const SUPPORTED_INVOICE_CURRENCIES: Array<{ code: string; label: string }> = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "GBP", label: "GBP — Pound Sterling" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "CNY", label: "CNY — Chinese Yuan" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "THB", label: "THB — Thai Baht" },
];

export function currencySymbol(code: string | null | undefined): string {
  const c = (code || "USD").toUpperCase();
  return SYMBOLS[c] ?? c + " ";
}

// Cents → "$1,234.56" (or "USD $1,234.56" with includeCode).
// JPY/CNY have no fractional unit but we still pass cents (×100) so the
// caller doesn't have to special-case — fraction digits drop to 0 here.
export function formatCurrency(
  cents: number,
  code: string | null | undefined = "USD",
  opts: { includeCode?: boolean; minimumFractionDigits?: number } = {},
): string {
  const c = (code || "USD").toUpperCase();
  const isYen = c === "JPY" || c === "CNY";
  const minFrac = opts.minimumFractionDigits ?? (isYen ? 0 : 2);
  const value = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: 2,
  });
  const sym = currencySymbol(c);
  return opts.includeCode ? `${c} ${sym}${value}` : `${sym}${value}`;
}
