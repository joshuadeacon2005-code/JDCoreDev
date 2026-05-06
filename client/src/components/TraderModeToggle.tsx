import { cn } from "@/lib/utils";

export type TraderMode = "paper" | "live" | "all";

/**
 * Paper / Live / All toggle for trader admin pages.
 * Pages pass current value + setter; query the API with `?mode=${mode}`.
 *
 * The default mode comes from the active Alpaca account (paper unless
 * live is configured). Pages should initialise from /api/trader/health
 * and let users override.
 */
export function TraderModeToggle({
  value,
  onChange,
  showAll = false,
  className,
}: {
  value: TraderMode;
  onChange: (m: TraderMode) => void;
  showAll?: boolean;
  className?: string;
}) {
  const options: { k: TraderMode; label: string; cls: string }[] = [
    { k: "paper", label: "Paper", cls: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400" },
    { k: "live",  label: "Live",  cls: "border-orange-500/30 bg-orange-500/10 text-orange-500" },
  ];
  if (showAll) options.push({ k: "all", label: "All", cls: "border-border bg-muted/40 text-foreground" });

  return (
    <div className={cn("inline-flex rounded-md border border-border overflow-hidden", className)}>
      {options.map(({ k, label, cls }) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={cn(
            "text-xs font-medium px-3 py-1.5 transition-colors",
            value === k
              ? cls
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
