const TZ = "Asia/Hong_Kong";

export function fmtHKT(
  date: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions
): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { ...opts, timeZone: TZ });
}

export function fmtHKTDate(
  date: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions
): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { ...opts, timeZone: TZ });
}

export function fmtHKTTime(
  date: Date | string | null | undefined
): string {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
}

export function getHKTHour(date: Date | string): number {
  const s = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: TZ }).format(new Date(date));
  return parseInt(s);
}
