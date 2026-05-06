import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import {
  Globe, Wrench, Zap, FileText,
  Search, RefreshCw, ArrowRight,
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
    icon: Globe,
    title: "Show up where it counts",
    description: "Half of Hong Kong small business sites can't be found because Google doesn't understand them. We audit your meta tags, structured data, and schema markup so search engines know what you're selling — and show you to the right people.",
    features: [
      "Meta tag audit",
      "Schema + structured data",
      "Google understands what you sell",
      "Show up for the right searches",
    ],
  },
  {
    icon: Wrench,
    title: "Fix the plumbing",
    description: "Broken links, crawl errors, redirect loops, missing sitemaps — invisible problems that quietly cost you traffic. We find every technical issue and tell you exactly what's costing you ranks.",
    features: [
      "Crawl + indexability check",
      "Broken link sweep",
      "Redirect + sitemap audit",
      "robots.txt + canonical review",
    ],
  },
  {
    icon: Zap,
    title: "Pages that load before customers leave",
    description: "Slow pages don't rank, and slow pages don't convert. We measure your Core Web Vitals on real devices, find what's dragging load time, and give you a quick-win list.",
    features: [
      "Core Web Vitals audit",
      "Image + asset optimisation",
      "Render-blocking script check",
      "Mobile-first speed test",
    ],
  },
  {
    icon: FileText,
    title: "Words your customers actually search",
    description: "Most small business sites talk about themselves, not what their customers are looking for. We map your content against real search demand, flag the gaps, and rewrite the pages that need a sharper angle.",
    features: [
      "Keyword + content gap audit",
      "On-page optimisation",
      "Title + heading rewrites",
      "Aligned to actual search intent",
    ],
  },
];

const pricingTiers = [
  {
    icon: Search,
    title: "The Audit",
    subtitle: "One-off engagement",
    description: "A full SEO review of your live site — visibility, technical health, page speed, and content. You get a written report with exactly what to fix first, written so you can act on it whether you do the work yourself or pay someone else to.",
    tiers: [
      { label: "Single-domain audit", price: "From HK$X,XXX", note: "Up to 100 indexed pages" }, // TBD
      { label: "Larger sites",        price: "From HK$X,XXX", note: "100+ pages or multi-region" }, // TBD
    ],
  },
  {
    icon: Wrench,
    title: "Audit + Improvements",
    subtitle: "One-off engagement",
    description: "Everything in The Audit, plus we go in and make the changes. Schema markup added, broken links fixed, page speed cleaned up, on-page content rewritten — handed back to you ranking better than when we started.",
    tiers: [
      { label: "Audit + execution",       price: "From HK$X,XXX", note: "We make the changes for you" }, // TBD
      { label: "Includes 30-day check-in", price: "Included",     note: "We watch how the rankings shift" },
    ],
  },
];

const faqs = [
  {
    q: "What's actually included in the SEO audit?",
    a: "A full review of your site's search visibility — meta tags, schema, technical health, page speed, broken links, content gaps, and on-page optimisation. You get a written report with a prioritised action list, not a 40-page PDF nobody reads.",
  },
  {
    q: "How long does the SEO audit take?",
    a: "Usually 5-7 working days from getting access to handing back the report. The \"Audit + Improvements\" track adds another 1-2 weeks while we make the changes.",
  },
  {
    q: "Do I need to give you access to my site, Search Console, or Google Analytics?",
    a: "Yes — read-only access to your site (or staging), and Search Console + GA helps a lot. We walk you through it; takes 10 minutes and you can revoke any time.",
  },
  {
    q: "Will my Google rankings actually improve?",
    a: "We don't promise rankings — anyone who does is selling. We promise you'll know exactly what's holding you back, and on the Improvements track we fix it. Rankings follow when the technical and content groundwork is right.",
  },
  {
    q: "What happens after I get in touch?",
    a: "We have a quick call (or email back-and-forth — your call) to confirm scope and pricing, you grant access, we run the audit, you get the report. No surprise invoices, no slow proposals.",
  },
  {
    q: "What format is the report?",
    a: "A written document — sections you can read in order, action items you can hand to a developer, screenshots where they help. No jargon, no vague suggestions like \"improve content quality.\"",
  },
  {
    q: "Who actually does the audit?",
    a: "Josh, with AI built into the workflow to surface patterns and double-check the technical findings. You're not getting an off-shore template; you're getting a real human review with the AI doing the boring parts.",
  },
];

export default function SeoAuditAndImprovementPage() {
  useEffect(() => {
    const PAGE_TAG = "seo-audit-and-improvement";
    const TITLE = "SEO Audit + Improvement | JD CoreDev";
    const DESC = "Plain-English SEO audit for Hong Kong small business sites. Find why Google isn't finding you, fix the technical problems, sharpen the content — written report you can act on, or we make the changes for you.";
    const URL = "https://www.jdcoredev.com/services/seo-audit-and-improvement";

    const prevTitle = document.title;
    document.title = TITLE;

    const tag = (el: HTMLElement) => {
      el.setAttribute("data-page", PAGE_TAG);
      return el;
    };

    const meta = (attr: "name" | "property", value: string, content: string) => {
      const m = document.createElement("meta");
      m.setAttribute(attr, value);
      m.setAttribute("content", content);
      document.head.appendChild(tag(m));
    };

    meta("name",     "description",        DESC);
    meta("property", "og:type",            "website");
    meta("property", "og:title",           TITLE);
    meta("property", "og:description",     DESC);
    meta("property", "og:url",             URL);
    meta("name",     "twitter:card",       "summary_large_image");
    meta("name",     "twitter:title",      TITLE);
    meta("name",     "twitter:description", DESC);

    const canonical = document.createElement("link");
    canonical.setAttribute("rel",  "canonical");
    canonical.setAttribute("href", URL);
    document.head.appendChild(tag(canonical));

    const ld = document.createElement("script");
    ld.setAttribute("type", "application/ld+json");
    ld.textContent = JSON.stringify({
      "@context":    "https://schema.org",
      "@type":       "Service",
      "@id":         URL + "#service",
      "serviceType": "SEO Audit",
      "name":        "SEO Audit + Improvement",
      "description": DESC,
      "provider":    { "@id": "https://www.jdcoredev.com/#org" },
      "areaServed":  { "@type": "Country",          "name": "Hong Kong" },
      "audience":    { "@type": "BusinessAudience", "audienceType": "Small business" },
      "url":         URL,
    });
    document.head.appendChild(tag(ld));

    return () => {
      document.title = prevTitle;
      document.head.querySelectorAll(`[data-page="${PAGE_TAG}"]`).forEach((n) => n.remove());
    };
  }, []);

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

      {/* BREADCRUMB */}
      <div className="border-b border-border/40 py-3">
        <div className="max-w-[1400px] mx-auto px-8 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground/70">
          <Link href="/services" className="hover:text-foreground transition-colors" data-testid="breadcrumb-services">Services</Link>
          <span>/</span>
          <span className="text-foreground">SEO Audit</span>
        </div>
      </div>

      {/* SECTION 1 — HERO */}
      <section className="py-20">
        <div className="max-w-[1400px] mx-auto px-8">
          <div className="text-center mb-16">
            <AnimatedContainer delay={0}>
              <span className="text-muted-foreground/60 font-mono text-[10px] uppercase tracking-[0.4em] mb-3 block">[ HK BUSINESSES · 2026 ]</span>
              <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// SEO Audit</span>
              <h1 className="text-5xl md:text-7xl font-black text-foreground tracking-tighter uppercase italic mb-6">
                Make Google <span className="text-primary">actually find you</span>
              </h1>
            </AnimatedContainer>
            <AnimatedContainer delay={0.25}>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
                A clear, plain-English review of your site's SEO — what's broken, what's invisible to Google, and exactly what to fix. Done by a real human, with AI built into the process so nothing gets missed.
              </p>
            </AnimatedContainer>
            <AnimatedContainer delay={0.45}>
              <Link href="/contact">
                <Button size="lg" className="font-black uppercase italic tracking-wider gap-2" data-testid="button-hero-contact">
                  Get in touch <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </AnimatedContainer>
          </div>
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
                  <div key={b.title} className={`relative p-8 md:p-10 ${borderRight} ${borderBottom} border-border hover:bg-muted/30 transition-colors before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-primary before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300`}>
                    <div className="flex items-start gap-4">
                      <span className="text-7xl md:text-8xl font-mono font-black text-primary/10 italic leading-none tabular-nums">0{index + 1}</span>
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
              Pick the audit if you want to know what's wrong. Pick audit + improvements if you want us to fix it. All prices in HKD; final numbers depend on site size.
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
                        <span className="text-xl md:text-2xl font-black text-primary font-mono tabular-nums">{row.price}</span>
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
              <p className="font-black uppercase italic text-sm mb-1">Or stay on top of it, monthly</p>
              <p className="text-sm text-muted-foreground">SEO isn't one-and-done — Google's algorithm shifts, content gets stale, competitors move. Some businesses want us to keep watching, keep tuning, keep ranking. Pricing depends on your site size.</p>
            </div>
            <Link href="/contact">
              <Button variant="outline" className="font-black uppercase italic text-xs tracking-wider whitespace-nowrap" data-testid="button-ongoing-contact">
                Talk to us about ongoing SEO <ArrowRight className="h-3 w-3 ml-1" />
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
              Quietly making search <span className="text-primary">work harder</span>
            </h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            {/* TODO: replace with real testimonials when available */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border/40 border border-border">
              {[
                { stat: "[stat]", quote: "[Quote · placeholder]", attribution: "[Name · Company]" },
                { stat: "[stat]", quote: "[Quote · placeholder]", attribution: "[Name · Company]" },
                { stat: "[stat]", quote: "[Quote · placeholder]", attribution: "[Name · Company]" },
              ].map((t, i) => (
                <div key={i} className="p-8 bg-background flex flex-col justify-between gap-5 min-h-[200px]">
                  <p className="font-mono text-2xl font-black text-primary/30 italic tabular-nums leading-none">{t.stat}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t.quote}</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 font-mono">{t.attribution}</p>
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
                  <AccordionTrigger className="text-left font-black uppercase italic tracking-tight text-base">
                    <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground/70 mr-3 not-italic font-normal">Q-{String(idx + 1).padStart(2, "0")}</span>
                    {item.q}
                  </AccordionTrigger>
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
              Let's see where you're <span className="text-primary">invisible to search</span>
            </h2>
            <p className="text-muted-foreground mb-10 max-w-xl mx-auto">
              No commitment, no jargon. Tell us about your site and we'll tell you what we'd look at first.
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
