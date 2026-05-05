import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { traderTabs } from "@/components/AdminLayout";

/**
 * Sub-navigation tabs shown at the top of every Claude Trader page
 * (/admin/trader, /admin/trader/runs, /admin/trader/analytics, etc.).
 *
 * The trader feature has many sub-pages — instead of cluttering the
 * sidebar's More dropdown with one icon per sub-page, they're grouped
 * here as horizontal tabs.
 */
export function TraderTabs() {
  const [location] = useLocation();
  // Trader main page = exact "/admin/trader" only; sub-pages match by prefix
  const isActive = (href: string) =>
    href === "/admin/trader" ? location === "/admin/trader" : location.startsWith(href);

  return (
    <div className="border-b border-border/60 mb-5 -mx-6 px-6 overflow-x-auto">
      <nav className="flex items-center gap-1 min-w-max">
        {traderTabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link key={tab.href} href={tab.href}>
              <button
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-teal-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
                data-testid={`trader-tab-${tab.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.title}
              </button>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
