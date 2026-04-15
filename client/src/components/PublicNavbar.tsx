import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Menu, MenuItem, HoveredLink } from "@/components/ui/navbar-menu";
import { Code, Layers, Rocket, Server, Menu as MenuIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import logoImage from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151.png";

const services = [
  { href: "/services", label: "Custom Development", icon: Code },
  { href: "/services", label: "Technical Consulting", icon: Layers },
  { href: "/services", label: "MVP Development", icon: Rocket },
  { href: "/services", label: "Managed Hosting", icon: Server },
];

export function PublicNavbar() {
  const [active, setActive] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="max-w-6xl mx-auto px-6 pt-4">
        <div className="backdrop-blur-md bg-background/80 rounded-full border shadow-lg px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center shrink-0">
              <img 
                src={logoImage} 
                alt="JD CoreDev" 
                className="h-14 sm:h-16 w-auto object-contain mix-blend-multiply dark:mix-blend-screen"
              />
            </Link>
            
            <nav className="hidden md:block" onMouseLeave={() => setActive(null)}>
              <Menu setActive={setActive}>
                <MenuItem setActive={setActive} active={active} item="Services">
                  <div className="flex flex-col space-y-4 text-sm">
                    {services.map((service) => (
                      <HoveredLink key={service.label} href={service.href}>
                        <div className="flex items-center gap-2">
                          <service.icon className="h-4 w-4" />
                          <span>{service.label}</span>
                        </div>
                      </HoveredLink>
                    ))}
                  </div>
                </MenuItem>
                <Link href="/work">
                  <motion.p
                    className={cn(
                      "cursor-pointer hover:opacity-[0.9]",
                      isActive("/work") ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    Work
                  </motion.p>
                </Link>
                <Link href="/contact">
                  <motion.p
                    className={cn(
                      "cursor-pointer hover:opacity-[0.9]",
                      isActive("/contact") ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    Contact
                  </motion.p>
                </Link>
              </Menu>
            </nav>
            
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/auth" className="hidden sm:block">
                <Button data-testid="button-login">Sign In</Button>
              </Link>
              <Button 
                size="icon" 
                variant="ghost" 
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                data-testid="button-mobile-menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
        
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="md:hidden mt-2 backdrop-blur-md bg-background/95 rounded-2xl border shadow-lg p-4"
            >
              <nav className="flex flex-col space-y-3">
                <Link href="/services" onClick={() => setMobileMenuOpen(false)}>
                  <div className={cn(
                    "px-4 py-2 rounded-lg transition-colors",
                    isActive("/services") ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:bg-muted"
                  )}>
                    Services
                  </div>
                </Link>
                <Link href="/work" onClick={() => setMobileMenuOpen(false)}>
                  <div className={cn(
                    "px-4 py-2 rounded-lg transition-colors",
                    isActive("/work") ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:bg-muted"
                  )}>
                    Work
                  </div>
                </Link>
                <Link href="/contact" onClick={() => setMobileMenuOpen(false)}>
                  <div className={cn(
                    "px-4 py-2 rounded-lg transition-colors",
                    isActive("/contact") ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:bg-muted"
                  )}>
                    Contact
                  </div>
                </Link>
                <div className="pt-2 border-t">
                  <Link href="/auth" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full" data-testid="button-mobile-login">Sign In</Button>
                  </Link>
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
