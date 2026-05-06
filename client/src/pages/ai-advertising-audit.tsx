import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import {
  Target, Sparkles, BarChart3, Rocket,
  Search, Wrench, RefreshCw, ArrowRight,
  Home, Settings, Briefcase, Mail,
} from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import logoImage from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151-BEa_X509_1776312718936.png";

const navItems = [
  { name: "Home",     url: "/",         icon: Home      },
  { name: "Services", url: "/services", icon: Settings  },
  { name: "Work",     url: "/work",     icon: Briefcase },
  { name: "Contact",  url: "/contact",  icon: Mail      },
];

function AnimatedContainer({ className, delay = 0.1, children }: { className?: string; delay?: number; children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ filter: "blur(4px)", translateY: -8, opacity: 0 }}
      whileInView={{ filter: "blur(0px)", translateY: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.8 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function AiAdvertisingAuditPage() {
  // SEO useEffect goes here in Task 3 — DO NOT add it now.

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <NavBar items={navItems} />
      <nav className="py-6 px-8 flex justify-between items-center sticky top-0 bg-background/80 backdrop-blur-sm z-40">
        <Link href="/" className="flex items-center gap-2">
          <img src={logoImage} alt="JD CoreDev" className="h-16 md:h-20 w-auto mix-blend-multiply dark:mix-blend-screen" />
        </Link>
        <div className="flex items-center gap-6">
          <ThemeToggle />
          <Link href="/auth">
            <Button variant="outline" className="font-black uppercase italic text-xs tracking-wider" data-testid="button-login">
              Sign In
            </Button>
          </Link>
        </div>
      </nav>

      {/* SECTION 1 — HERO */}
      <section className="py-20">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-16">
            {/* TODO Task 2: hero eyebrow + H1 + subhead + primary CTA */}
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 2 — BENEFIT BLOCKS */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-16">
            {/* TODO Task 2: eyebrow + H2 */}
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            {/* TODO Task 2: 4 numbered benefit cards in 2-col grid */}
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 3 — PRICING */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-16">
            {/* TODO Task 2: eyebrow "// Pricing" + H2 */}
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            {/* TODO Task 2: 2 pricing tier cards in md:grid-cols-2 gap-6 */}
          </AnimatedContainer>
          <AnimatedContainer delay={0.3} className="mt-8 border border-border/50 bg-muted/10 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* TODO Task 2: ongoing-management strip */}
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 4 — SOCIAL PROOF */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-12">
            {/* TODO Task 2: eyebrow + H2 */}
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            {/* TODO Task 2: 3-cell placeholder testimonial grid */}
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 5 — FAQ */}
      <section className="py-20 border-t">
        <div className="max-w-3xl mx-auto px-8">
          <AnimatedContainer className="text-center mb-12">
            {/* TODO Task 2: eyebrow + H2 */}
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            {/* TODO Task 2: Accordion with 7 items */}
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 6 — FINAL CTA */}
      <section className="py-20 border-t bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-8 text-center">
          <AnimatedContainer>
            {/* TODO Task 2: eyebrow + H2 + body + primary CTA */}
          </AnimatedContainer>
        </div>
      </section>

      <footer className="bg-card border-t py-12">
        <div className="max-w-[1400px] mx-auto px-8 text-center">
          <p className="text-sm text-muted-foreground uppercase tracking-wider">
            {new Date().getFullYear()} JD CoreDev. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
