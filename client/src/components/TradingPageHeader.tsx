import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface BalanceTile {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "amber" | "blue" | "red" | "purple" | "default";
}

interface StatTile {
  label: string;
  value: string;
  color?: "green" | "red" | "amber" | "blue" | "default";
}

interface TradingPageHeaderProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentClass?: string;
  balance?: BalanceTile[];
  stats?: StatTile[];
  badges?: React.ReactNode;
  loading?: boolean;
}

const colorMap: Record<string, string> = {
  green:   "text-emerald-600 dark:text-emerald-400",
  amber:   "text-amber-500",
  blue:    "text-blue-500",
  red:     "text-red-500",
  purple:  "text-purple-500",
  default: "text-foreground",
};

const tileBorder: Record<string, string> = {
  green:   "border-emerald-500/20 bg-emerald-500/5",
  amber:   "border-amber-500/20 bg-amber-500/5",
  blue:    "border-blue-500/20 bg-blue-500/5",
  red:     "border-red-500/20 bg-red-500/5",
  purple:  "border-purple-500/20 bg-purple-500/5",
  default: "border-border bg-muted/30",
};

export function TradingPageHeader({
  title,
  subtitle,
  icon,
  accentClass = "text-teal-500",
  balance = [],
  stats = [],
  badges,
  loading = false,
}: TradingPageHeaderProps) {
  return (
    <div className="mb-6 space-y-4">
      {/* Title row */}
      <div>
        <h1 className={cn("text-2xl font-bold tracking-tight mb-0.5 flex items-center gap-2", accentClass)}>
          {icon}
          {title}
        </h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
        {badges && <div className="flex items-center gap-2 mt-2 flex-wrap">{badges}</div>}
      </div>

      {/* Balance tiles */}
      {balance.length > 0 && (
        <div className={cn("grid gap-2", balance.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
          {balance.map((tile) => (
            <div
              key={tile.label}
              className={cn(
                "rounded-lg border p-3",
                tileBorder[tile.color || "default"]
              )}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{tile.label}</p>
              {loading ? (
                <div className="h-5 w-20 bg-muted/50 animate-pulse rounded" />
              ) : (
                <p className={cn("text-base font-bold font-mono", colorMap[tile.color || "default"])}>
                  {tile.value}
                </p>
              )}
              {tile.sub && !loading && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{tile.sub}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Analytics stats bar */}
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-4 px-1 py-2 border-t border-border/50">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
              {loading ? (
                <div className="h-3.5 w-10 bg-muted/50 animate-pulse rounded" />
              ) : (
                <span className={cn("text-xs font-semibold font-mono", colorMap[s.color || "default"])}>
                  {s.value}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function pnlColor(val: number): "green" | "red" | "default" {
  if (val > 0) return "green";
  if (val < 0) return "red";
  return "default";
}

export function fmtUSD(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
