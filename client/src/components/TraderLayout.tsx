import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Activity,
  Brain,
  Scale,
  Bitcoin,
  MessageSquare,
  Star,
  Settings,
  FlaskConical,
  ArrowLeft,
  LogOut,
} from "lucide-react";

const traderNavItems = [
  { title: "Dashboard",   icon: LayoutDashboard, href: "/admin/trader" },
  { title: "Runs",        icon: TrendingUp,      href: "/admin/trader/runs" },
  { title: "Analytics",   icon: BarChart3,       href: "/admin/trader/analytics" },
  { title: "Performance", icon: Activity,        href: "/admin/trader/performance" },
  { title: "Predictions", icon: Brain,           href: "/admin/trader/predictions" },
  { title: "Chat",        icon: MessageSquare,   href: "/admin/trader/chat" },
  { title: "Watchlist",   icon: Star,            href: "/admin/trader/watchlist" },
  { title: "Settings",    icon: Settings,        href: "/admin/trader/settings" },
  { title: "Backtest",    icon: FlaskConical,    href: "/admin/trader/backtest" },
];

interface TraderLayoutProps {
  children: React.ReactNode;
}

export function TraderLayout({ children }: TraderLayoutProps) {
  const [location] = useLocation();
  const { logoutMutation } = useAuth();

  const isActive = (href: string) =>
    href === "/admin/trader" ? location === "/admin/trader" : location.startsWith(href);

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="fixed left-0 top-0 h-full w-16 bg-white/5 dark:bg-neutral-900/50 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-4 z-50">
        <div className="mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-none">
          {traderNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Tooltip key={item.title} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link href={item.href}>
                    <button
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        active
                          ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
                          : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                      }`}
                      data-testid={`trader-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <item.icon className="h-5 w-5" />
                    </button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-emerald-500/10 backdrop-blur-md border-emerald-500/20">
                  {item.title}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 items-center">
          <ThemeToggle />
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link href="/admin">
                <button
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-teal-400 hover:bg-teal-500/10 transition-all"
                  data-testid="trader-nav-back-to-admin"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Back to Admin</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => logoutMutation.mutate()}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                data-testid="trader-nav-logout"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      <div className="flex-1 ml-16">
        <main className="px-6 py-6 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
