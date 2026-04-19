import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  LogOut,
  Settings,
  BarChart3,
  Home,
  RefreshCw,
  Mail,
  Receipt,
  Target,
  DollarSign,
  Bitcoin,
  FileText,
  Radar,
  TrendingUp,
  Scale,
  ArrowLeftRight,
  MoreHorizontal,
  Activity,
  Brain,
  MessageSquare,
  Star,
  FlaskConical,
} from "lucide-react";
import logoImage from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151-BEa_X509_1776312718936.png";

const mainNavItems = [
  { title: "Home",          icon: Home,            href: "/" },
  { title: "Dashboard",     icon: LayoutDashboard, href: "/admin" },
  { title: "Analytics",     icon: BarChart3,       href: "/admin/analytics" },
  { title: "Clients",       icon: Users,           href: "/admin/clients" },
  { title: "Projects",      icon: Briefcase,       href: "/admin/projects" },
  { title: "Invoice Reminders", icon: Mail,        href: "/admin/invoice-reminders" },
  { title: "Crypto Tracker", icon: Bitcoin,        href: "/admin/crypto" },
  { title: "Lead Engine",   icon: Radar,           href: "/admin/lead-engine" },
  { title: "Claude Trader", icon: TrendingUp,      href: "/admin/trader" },
  { title: "Predictions",   icon: Scale,           href: "/admin/trader/predictions" },
  { title: "Arbitrage",     icon: ArrowLeftRight,  href: "/admin/trader/arbitrage" },
  { title: "Crypto Arb",    icon: Bitcoin,         href: "/admin/trader/crypto-arb" },
];

const moreNavItems = [
  { title: "Milestones",        icon: Target,       href: "/admin/milestones" },
  { title: "Invoices",          icon: Receipt,      href: "/admin/invoices" },
  { title: "Scheduling",        icon: Calendar,     href: "/admin/scheduling" },
  { title: "Documents",         icon: FileText,     href: "/admin/documents" },
  { title: "Recurring Payments", icon: RefreshCw,   href: "/admin/recurring-payments" },
  { title: "Payment Settings",  icon: DollarSign,   href: "/admin/payment-settings" },
];

const traderMoreItems = [
  { title: "Trader Runs",       icon: TrendingUp,   href: "/admin/trader/runs" },
  { title: "Trader Analytics",  icon: BarChart3,    href: "/admin/trader/analytics" },
  { title: "Performance",       icon: Activity,     href: "/admin/trader/performance" },
  { title: "Trader Chat",       icon: MessageSquare, href: "/admin/trader/chat" },
  { title: "Watchlist",         icon: Star,         href: "/admin/trader/watchlist" },
  { title: "Trader Settings",   icon: Settings,     href: "/admin/trader/settings" },
  { title: "Backtest",          icon: FlaskConical, href: "/admin/trader/backtest" },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const isActive = (href: string) =>
    href === "/" ? location === "/" :
    href === "/admin" ? location === "/admin" :
    location.startsWith(href);

  const anyMoreActive = [...moreNavItems, ...traderMoreItems].some(item => isActive(item.href));

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="fixed left-0 top-0 h-full w-16 bg-white/5 dark:bg-neutral-900/50 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-4 z-50">
        <Link href="/" className="mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <span className="text-white font-bold text-sm">JD</span>
          </div>
        </Link>

        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-none">
          {mainNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Tooltip key={item.title} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setLocation(item.href)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      active
                        ? "bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30"
                        : "text-muted-foreground hover:text-teal-400 hover:bg-teal-500/10"
                    }`}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <item.icon className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-teal-500/10 backdrop-blur-md border-teal-500/20">
                  {item.title}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* More submenu */}
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      anyMoreActive
                        ? "bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30"
                        : moreOpen
                        ? "bg-teal-500/10 text-teal-400"
                        : "text-muted-foreground hover:text-teal-400 hover:bg-teal-500/10"
                    }`}
                    data-testid="nav-more"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-teal-500/10 backdrop-blur-md border-teal-500/20">
                More
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={8}
              className="w-52 p-2 bg-neutral-900/95 backdrop-blur-xl border border-white/10"
            >
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 pb-1.5">
                More
              </p>
              {moreNavItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <button
                    key={item.title}
                    onClick={() => { setLocation(item.href); setMoreOpen(false); }}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all ${
                      active
                        ? "bg-teal-500/15 text-teal-400"
                        : "text-muted-foreground hover:text-teal-400 hover:bg-teal-500/10"
                    }`}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.title}
                  </button>
                );
              })}
              <div className="my-1.5 border-t border-white/10" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 pb-1.5">
                Trader
              </p>
              {traderMoreItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <button
                    key={item.title}
                    onClick={() => { setLocation(item.href); setMoreOpen(false); }}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all ${
                      active
                        ? "bg-teal-500/15 text-teal-400"
                        : "text-muted-foreground hover:text-teal-400 hover:bg-teal-500/10"
                    }`}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.title}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                data-testid="button-logout"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      <div className="flex-1 ml-16">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-4 px-6 py-3 border-b bg-background/80 backdrop-blur-xl">
          <Link href="/">
            <img
              src={logoImage}
              alt="JD CoreDev"
              className="h-10 w-auto mix-blend-multiply dark:mix-blend-screen"
            />
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-teal-500/20 text-teal-600 dark:text-teal-400">
                      {user?.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm text-muted-foreground truncate">
                  {user?.email}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="px-6 py-6 min-h-[calc(100vh-64px)]">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
