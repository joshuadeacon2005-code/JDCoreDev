// Centralised currency formatting for invoice rendering. All amounts are
// stored in USD on the database side; clients.invoiceCurrency and
// partners.payoutCurrency are *secondary display* currencies. PDFs and
// dashboards print the USD primary and an "≈ {sym}{converted}" line when
// the local currency differs from USD.

// Approximate USD → local rates. Set high so converted amounts read
// reasonably; user can tune in payment_settings if precision matters.
// (paymentSettings.usdToHkdRate is already configurable; other rates can
// be moved off this static map into the same table later if needed.)
export const DEFAULT_USD_FX_RATES: Record<string, number> = {
  USD: 1,
  GBP: 0.79,
  EUR: 0.92,
  HKD: 7.8,
  AUD: 1.51,
  CAD: 1.36,
  SGD: 1.34,
  NZD: 1.65,
  JPY: 152,
  CNY: 7.2,
  CHF: 0.88,
  THB: 35.5,
};

export function convertUSDCents(
  usdCents: number,
  targetCurrency: string | null | undefined,
  rateOverrides?: Record<string, number>,
): { value: number; symbol: string; code: string } {
  const code = (targetCurrency || "USD").toUpperCase();
  const rate = rateOverrides?.[code] ?? DEFAULT_USD_FX_RATES[code] ?? 1;
  return { value: (usdCents / 100) * rate, symbol: currencySymbol(code), code };
}

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
