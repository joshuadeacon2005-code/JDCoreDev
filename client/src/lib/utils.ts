import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toCents(dollars: number | string | null | undefined): number | null {
  if (dollars === null || dollars === undefined || dollars === "") return null;
  const amount = typeof dollars === "string" ? parseFloat(dollars) : dollars;
  if (isNaN(amount)) return null;
  return Math.round(amount * 100);
}

export function fromCents(cents: number | null | undefined): number {
  if (cents === null || cents === undefined) return 0;
  return cents / 100;
}

export function formatMoney(
  cents: number | null | undefined,
  options: { currency?: string; showCurrency?: boolean; minimumFractionDigits?: number } = {}
): string {
  const { currency = "USD", showCurrency = false, minimumFractionDigits = 2 } = options;
  
  if (cents === null || cents === undefined) {
    return "—";
  }
  
  const dollars = cents / 100;
  const formatted = dollars.toLocaleString(undefined, { 
    minimumFractionDigits, 
    maximumFractionDigits: 2 
  });
  
  return showCurrency ? `${currency} ${formatted}` : `$${formatted}`;
}

export function parseDate(value: string | null | undefined): string | null {
  if (!value || value.trim() === "") return null;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    throw new Error(`Invalid date format: ${value}. Expected YYYY-MM-DD`);
  }
  const parsed = new Date(value + "T00:00:00");
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  const [year, month, day] = value.split("-").map(Number);
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return value;
}

export function formatDateForInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}
