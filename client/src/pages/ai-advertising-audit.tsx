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

const benefits = [
  {
    icon: Target,
    title: "Spot the wasted spend",
    description: "We find the campaigns, ad sets, and keywords burning your budget without bringing customers — across both Google and Meta — and tell you exactly what to cut.",
    features: [
      "Wasted-spend audit",
      "Google + Meta in one review",
      "Keyword and audience cleanup",
      "Plain-English action list",
    ],
  },
  {
    icon: Sparkles,
    title: "Sharper creative & messaging",
    description: "Most ads underperform because the creative isn't talking to the right person. We review what's running, identify what's flat, and rewrite the angles that need a lift.",
    features: [
      "Creative review (image + copy)",
      "Hook and headline rewrites",
      "Audience-message fit",
      "Tested suggestions, not opinions",
    ],
  },
  {
    icon: BarChart3,
    title: "Tracking that actually works",
    description: "Half of small business ad accounts have broken or partial conversion tracking — so you can't tell what's working. We check the plumbing, fix the gaps, and make sure every conversion gets credited.",
    features: [
      "Conversion-tracking audit",
      "Pixel + tag check",
      "Source attribution sanity check",
      "So you can finally trust the numbers",
    ],
  },
  {
    icon: Rocket,
    title: "Landing pages that convert",
    description: "Great ads sending traffic to a weak page is money down the drain. We review where your traffic lands, flag the friction, and tighten the path from click to enquiry.",
    features: [
      "Landing-page review",
      "Friction + drop-off audit",
      "Mobile load-speed check",
      "Aligned to the ad's promise",
    ],
  },
];

const pricingTiers = [
  {
    icon: Search,
    title: "The Audit",
    subtitle: "One-off engagement",
    description: "A full review of your Google and Meta ad accounts. You get a written report with exactly what to keep, cut, and change — written so you can act on it whether you run the ads yourself or pay someone else to.",
    tiers: [
      { label: "Single-channel audit", price: "From HK$X,XXX", note: "Google OR Meta" }, // TBD
      { label: "Both channels",        price: "From HK$X,XXX", note: "Google + Meta together" }, // TBD
    ],
  },
  {
    icon: Wrench,
    title: "Audit + Improvements",
    subtitle: "One-off engagement",
    description: "Everything in The Audit, plus we go in and make the changes. New campaign structure, fixed tracking, sharper creative — handed back to you running better than when we started.",
    tiers: [
      { label: "Audit + execution",       price: "From HK$X,XXX", note: "We make the changes for you" }, // TBD
      { label: "Includes 30-day check-in", price: "Included",     note: "We watch how it lands" },
    ],
  },
];

const faqs = [
  {
    q: "What's actually included in the audit?",
    a: "A full review of your live Google Ads and Meta Ads accounts — campaign structure, ad sets, audiences, creative, conversion tracking, and the landing pages your ads send traffic to. You get a written report with a prioritised action list, not a 40-page PDF nobody reads.",
  },
  {
    q: "How long does the audit take?",
    a: "Usually 5-7 working days from getting account access to handing back the report. The \"Audit + Improvements\" track adds another 1-2 weeks while we make the changes.",
  },
  {
    q: "Do I need to give you access to my ad accounts?",
    a: "Yes — read-only access for the audit, full access if you want us to make changes. We walk you through it; it takes 5 minutes and you can revoke it any time.",
  },
  {
    q: "Do I need an existing Google or Meta account?",
    a: "Yes — this service is for businesses already running ads who want to know what's working. If you're starting from zero, get in touch and we'll point you the right way.",
  },
  {
    q: "What happens after I get in touch?",
    a: "We have a quick call (or email back-and-forth — your call) to confirm scope and pricing, you grant access, we run the audit, you get the report. No surprise invoices, no slow proposals.",
  },
  {
    q: "What format is the report?",
    a: "A written document — sections you can read in order, action items you can hand to a developer or marketer, screenshots where they help. No jargon, no vague suggestions.",
  },
  {
    q: "Who actually does the audit?",
    a: "Josh, with AI built into the workflow to surface patterns and double-check the numbers. You're not getting an off-shore template; you're getting a real human review with the AI doing the boring parts.",
  },
];

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
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// AI Advertising Audit</span>
            <h1 className="text-5xl md:text-7xl font-black text-foreground tracking-tighter uppercase italic mb-6">
              Make your ad spend <span className="text-primary">actually pay back</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
              A clear, plain-English review of your Google and Meta ads — what's working, what's wasting money, and exactly what to change. Done by a real human, with AI built into the process so nothing gets missed.
            </p>
            <Link href="/contact">
              <Button size="lg" className="font-black uppercase italic tracking-wider gap-2" data-testid="button-hero-contact">
                Get in touch <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 2 — BENEFIT BLOCKS */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-16">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// What you get</span>
            <h2 className="text-4xl md:text-5xl font-black text-foreground tracking-tighter uppercase italic mb-4">
              Outcomes, not <span className="text-primary">jargon</span>
            </h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <div className="grid grid-cols-1 md:grid-cols-2 border border-border">
              {benefits.map((b, index) => {
                const isLeftCol = index % 2 === 0;
                const isTopRow  = index < 2;
                const borderRight  = isLeftCol ? "md:border-r" : "";
                const borderBottom = isTopRow  ? "border-b"    : "";
                return (
                  <div key={b.title} className={`p-8 md:p-10 ${borderRight} ${borderBottom} border-border group hover:bg-muted/30 transition-colors`}>
                    <div className="flex items-start gap-4">
                      <span className="text-5xl font-black text-primary/15 italic leading-none">0{index + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <b.icon className="h-5 w-5 text-primary" />
                          <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tight">{b.title}</h3>
                        </div>
                        <p className="text-muted-foreground mb-5 leading-relaxed text-sm">{b.description}</p>
                        <ul className="space-y-2">
                          {b.features.map((f) => (
                            <li key={f} className="flex items-center gap-3 text-xs uppercase tracking-wide">
                              <span className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 3 — PRICING */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-16">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Pricing</span>
            <h2 className="text-4xl md:text-5xl font-black text-foreground tracking-tighter uppercase italic mb-4">
              Two ways to <span className="text-primary">work with us</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Pick the audit if you want to know what's wrong. Pick audit + improvements if you want us to fix it. All prices in HKD; final numbers depend on account scope.
            </p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pricingTiers.map((tier) => (
                <div key={tier.title} className="border border-border p-8 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <tier.icon className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-black uppercase italic tracking-tight">{tier.title}</h3>
                  </div>
                  <p className="text-xs text-accent uppercase tracking-widest font-bold mb-4">{tier.subtitle}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">{tier.description}</p>
                  <div className="space-y-3">
                    {tier.tiers.map((row) => (
                      <div key={row.label} className="flex items-center justify-between border border-border/50 px-4 py-3 bg-muted/20">
                        <div>
                          <p className="text-sm font-semibold">{row.label}</p>
                          <p className="text-[11px] text-muted-foreground">{row.note}</p>
                        </div>
                        <span className="text-lg font-black text-primary">{row.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AnimatedContainer>
          <AnimatedContainer delay={0.3} className="mt-8 border border-border/50 bg-muted/10 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <RefreshCw className="h-8 w-8 text-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="font-black uppercase italic text-sm mb-1">Or run it for you, monthly</p>
              <p className="text-sm text-muted-foreground">Once the audit's done, some businesses want us to keep running the ads — testing creative, watching spend, scaling what works. Pricing depends on your monthly ad budget.</p>
            </div>
            <Link href="/contact">
              <Button variant="outline" className="font-black uppercase italic text-xs tracking-wider whitespace-nowrap" data-testid="button-ongoing-contact">
                Talk to us about ongoing management <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 4 — SOCIAL PROOF */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-12">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// What clients say</span>
            <h2 className="text-4xl md:text-5xl font-black text-foreground tracking-tighter uppercase italic">
              Quietly making ads <span className="text-primary">work harder</span>
            </h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            {/* TODO: replace with real testimonials when available */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border/40 border border-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-8 bg-background flex items-center justify-center min-h-[140px]">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">[Testimonial · placeholder]</p>
                </div>
              ))}
            </div>
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 5 — FAQ */}
      <section className="py-20 border-t">
        <div className="max-w-3xl mx-auto px-8">
          <AnimatedContainer className="text-center mb-12">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Common questions</span>
            <h2 className="text-4xl md:text-5xl font-black text-foreground tracking-tighter uppercase italic">
              Things people ask <span className="text-primary">before getting in touch</span>
            </h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((item, idx) => (
                <AccordionItem key={`q${idx + 1}`} value={`q${idx + 1}`}>
                  <AccordionTrigger className="text-left font-black uppercase italic tracking-tight text-base">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </AnimatedContainer>
        </div>
      </section>

      {/* SECTION 6 — FINAL CTA */}
      <section className="py-20 border-t bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-8 text-center">
          <AnimatedContainer>
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Ready?</span>
            <h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tighter uppercase italic mb-6">
              Let's see where your <span className="text-primary">spend's leaking</span>
            </h2>
            <p className="text-muted-foreground mb-10 max-w-xl mx-auto">
              No commitment, no jargon. Tell us what you're running and we'll tell you what we'd look at first.
            </p>
            <Link href="/contact">
              <Button size="lg" className="font-black uppercase italic tracking-wider gap-2" data-testid="button-final-contact">
                Get in touch <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
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
