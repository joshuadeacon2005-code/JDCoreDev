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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  FileText,
  LogOut,
  Home,
} from "lucide-react";
import logoImage from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151.png";

const navItems = [
  { title: "Home", icon: Home, href: "/" },
  { title: "Dashboard", icon: LayoutDashboard, href: "/portal" },
  { title: "Projects", icon: Briefcase, href: "/portal/projects" },
  { title: "Availability", icon: Calendar, href: "/portal/availability" },
  { title: "Documents", icon: FileText, href: "/portal/documents" },
];

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="fixed left-0 top-0 h-full w-16 bg-white/5 dark:bg-neutral-900/50 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-4 z-50">
        <Link href="/" className="mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <span className="text-white font-bold text-sm">JD</span>
          </div>
        </Link>
        
        <nav className="flex-1 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = location === item.href || 
              (item.href !== "/portal" && item.href !== "/" && location.startsWith(item.href));
            return (
              <Tooltip key={item.title} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setLocation(item.href)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      isActive 
                        ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30' 
                        : 'text-muted-foreground hover:text-teal-400 hover:bg-teal-500/10'
                    }`}
                    data-testid={`nav-${item.title.toLowerCase()}`}
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
