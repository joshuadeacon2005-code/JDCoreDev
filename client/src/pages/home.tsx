import { useState, useEffect } from "react";
import jdLogo from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151-BEa_X509_1776312718936.png";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InfiniteGrid } from "@/components/ui/infinite-grid";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { FeatureCard } from "@/components/ui/grid-feature-cards";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { motion, useReducedMotion } from "framer-motion";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { useAbVariant } from "@/hooks/use-ab-variant";
import { 
  Home,
  Briefcase,
  Mail,
  Settings,
  Check,
  Globe,
  Shield,
  TrendingUp,
  DollarSign,
  Zap,
  Cpu,
  Fingerprint,
  Pencil,
  Sparkles,
  Bot,
  CalendarClock,
  MailOpen,
  Package,
  Users,
  FileText,
  ArrowRight,
  X,
  MessageCircle,
  XCircle,
  BarChart3,
  Utensils,
  Store,
  Stethoscope,
  HardHat,
  GraduationCap,
  ChevronRight,
  Target,
} from "lucide-react";

const navItems = [
  { name: 'Home', url: '/', icon: Home },
  { name: 'Services', url: '/services', icon: Settings },
  { name: 'Work', url: '/work', icon: Briefcase },
  { name: 'Contact', url: '/contact', icon: Mail }
];

const coreValues = [
  {
    icon: Settings,
    title: "Built for you",
    description: "Every system is built around how your business actually works — not a template.",
  },
  {
    icon: TrendingUp,
    title: "Grows with you",
    description: "Start small, scale up. The system won't need replacing when you do.",
  },
  {
    icon: DollarSign,
    title: "Actually affordable",
    description: "Custom software isn't just for big companies. Honest pricing, no surprises.",
  },
  {
    icon: Shield,
    title: "Secure",
    description: "Proper security baked in from day one. Your data stays yours.",
  },
];

const processSteps = [
  {
    number: "01",
    title: "We listen first",
    description: "Tell us how your business runs, what's painful, and what you wish you could automate. No tech jargon — just a normal conversation.",
  },
  {
    number: "02",
    title: "We design it with you",
    description: "You see exactly what we're building before we build it. No surprises, no guessing.",
  },
  {
    number: "03",
    title: "We build & test it",
    description: "Clean, modern code. You get updates throughout — not a big reveal at the end.",
  },
  {
    number: "04",
    title: "We launch & look after it",
    description: "Hosting, updates, and support included. We stay involved so things keep working.",
  },
];

const hostingFeatures = [
  "Professional cloud hosting with 99.9% uptime",
  "Automatic SSL and security updates",
  "Performance monitoring included",
  "Custom domain setup handled for you",
  "Infrastructure that scales as you grow",
];

const serviceFeatures = [
  {
    title: "Fast & Reliable",
    icon: Zap,
    description: "Systems that don't slow you down. Optimised for speed so your team (and customers) stay happy.",
  },
  {
    title: "AI Built In",
    icon: Sparkles,
    description: "Not bolted on as an afterthought. AI is woven into the system from the start — where it actually helps.",
  },
  {
    title: "Secure by Default",
    icon: Fingerprint,
    description: "Your data is locked down properly. No cutting corners on security.",
  },
  {
    title: "Looks the part",
    icon: Pencil,
    description: "Clean interfaces your team will actually want to use. No ugly off-the-shelf dashboards.",
  },
  {
    title: "Your data, your way",
    icon: Cpu,
    description: "Full control over your codebase and your data. No vendor lock-in.",
  },
  {
    title: "We stay involved",
    icon: Settings,
    description: "Not a one-and-done build. We maintain, update, and improve things as your business grows.",
  },
];

const aiExamples = [
  {
    icon: CalendarClock,
    title: "A booking system that fills itself",
    description: "Automatically chases no-shows, fills last-minute gaps, and suggests upsells at the right moment.",
  },
  {
    icon: MailOpen,
    title: "Email that routes itself",
    description: "AI reads incoming enquiries and sends them to the right person — no more forwarding chains.",
  },
  {
    icon: Package,
    title: "Stock that reorders itself",
    description: "Predicts when you're running low and triggers the reorder before you run out.",
  },
  {
    icon: Users,
    title: "A CRM that writes itself",
    description: "Drafts follow-up messages and scores your leads so you always know who to call first.",
  },
  {
    icon: Bot,
    title: "A chatbot that's actually you",
    description: "Trained on your business, not generic rubbish. Plugged straight into your site or WhatsApp.",
  },
  {
    icon: FileText,
    title: "Quotes in seconds",
    description: "Pulls in job details, calculates costs, and spits out a branded PDF — no spreadsheet required.",
  },
];

type BusinessType = 'Restaurant' | 'Retail' | 'Beauty' | 'Healthcare' | 'Services' | 'Ecommerce';

const businessTiles: { id: BusinessType; label: string; icon: typeof Utensils }[] = [
  { id: 'Restaurant', label: 'Restaurant / Café', icon: Utensils },
  { id: 'Retail', label: 'Retail Shop', icon: Store },
  { id: 'Beauty', label: 'Beauty & Wellness', icon: Sparkles },
  { id: 'Healthcare', label: 'Healthcare / Clinic', icon: Stethoscope },
  { id: 'Services', label: 'Professional Services', icon: Briefcase },
  { id: 'Ecommerce', label: 'E-commerce', icon: Package },
];

const dialogueExamples: Record<BusinessType, { icon: typeof CalendarClock; title: string; description: string; saves: string }[]> = {
  Restaurant: [
    { icon: CalendarClock, title: "Smart table booking", description: "Auto-fills tables, sends reminders, chases no-shows without a single phone call.", saves: "8 hrs/week" },
    { icon: MailOpen, title: "Supplier auto-reorder", description: "Monitors stock and drafts purchase orders before you run out.", saves: "5 hrs/week" },
    { icon: Bot, title: "Takeaway order router", description: "Routes incoming orders to the right kitchen section automatically.", saves: "12 hrs/week" },
  ],
  Retail: [
    { icon: Package, title: "Stock alert system", description: "Predicts stockouts before they happen based on live sales velocity.", saves: "10 hrs/week" },
    { icon: Users, title: "Customer loyalty bot", description: "Triggers personalised offers to customers who haven't visited recently.", saves: "6 hrs/week" },
    { icon: FileText, title: "POS reconciliation", description: "Consolidates multiple sales channels into one clear live view.", saves: "15 hrs/week" },
  ],
  Beauty: [
    { icon: CalendarClock, title: "AI appointment scheduler", description: "Zero manual booking, zero no-shows — fully automated with reminders.", saves: "10 hrs/week" },
    { icon: Bot, title: "Client rebooking bot", description: "Automatically nudges clients to rebook before they drift away.", saves: "4 hrs/week" },
    { icon: Users, title: "Revenue tracker", description: "See your busiest hours, best clients, and revenue trends in one dashboard.", saves: "3 hrs/week" },
  ],
  Healthcare: [
    { icon: FileText, title: "Digital patient intake", description: "Forms filled before they arrive — no clipboards, no re-entering data.", saves: "15 hrs/week" },
    { icon: CalendarClock, title: "Appointment reminders", description: "Automated SMS and email reminders that cut no-shows by up to 60%.", saves: "8 hrs/week" },
    { icon: MailOpen, title: "Billing automation", description: "Auto-generate invoices from appointment records — no manual entry.", saves: "10 hrs/week" },
  ],
  Services: [
    { icon: Users, title: "Client onboarding portal", description: "Clients upload docs, sign contracts, and check project status — all in one place.", saves: "8 hrs/week" },
    { icon: FileText, title: "Proposal generator", description: "AI drafts scopes and quotes from your notes in minutes, not hours.", saves: "6 hrs/week" },
    { icon: MailOpen, title: "Invoice chaser", description: "Automatically follows up on overdue payments so you don't have to.", saves: "4 hrs/week" },
  ],
  Ecommerce: [
    { icon: Package, title: "Inventory sync", description: "Stock levels update across every platform the moment something sells.", saves: "12 hrs/week" },
    { icon: Bot, title: "Abandoned cart recovery", description: "AI sends personalised follow-ups within 15 minutes of cart abandonment.", saves: "8 hrs/week" },
    { icon: FileText, title: "Return flow automation", description: "Auto-processes returns and refunds without your team lifting a finger.", saves: "6 hrs/week" },
  ],
};

const auditStats = [
  { stat: "81%", label: "No workflow automations" },
  { stat: "67%", label: "No online booking system" },
  { stat: "43%", label: "Instagram-only, no website" },
  { stat: "74%", label: "Manual quoting & invoicing" },
  { stat: "58%", label: "No CRM or client tracking" },
  { stat: "89%", label: "No AI tools yet" },
];

const auditGaps = [
  { label: "No online booking system", detail: "Est. 15+ lost bookings/month" },
  { label: "No Google Business profile", detail: "Invisible in local search" },
  { label: "Instagram-only presence", detail: "No website to capture leads" },
  { label: "No automated follow-up", detail: "Repeat customers not retained" },
];

function HeroEvidence({
  urlInput, setUrlInput, hookLoading, handleUrlSubmit
}: {
  urlInput: string;
  setUrlInput: (v: string) => void;
  hookLoading: boolean;
  handleUrlSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <InfiniteGrid className="min-h-[85vh]" gridSize={40} speedX={0.15} speedY={0.15}>
      <main className="relative z-10 max-w-[1400px] w-full mx-auto flex flex-col md:flex-row border-b">
        <div className="flex-grow flex flex-col justify-center p-8 md:p-16 md:border-r">
          <AnimatedContainer delay={0.1}>
            <div className="inline-block px-4 py-1 border border-primary text-primary text-[10px] uppercase tracking-[0.2em] mb-8 font-bold">
              Backed by data · 50+ HK businesses audited
            </div>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tighter max-w-2xl mb-6">
              We audited 50+ HK businesses. Here's what we{" "}
              <span className="text-primary italic">found.</span>
            </h1>
          </AnimatedContainer>
          <AnimatedContainer delay={0.3}>
            <p className="text-muted-foreground text-lg max-w-xl mb-6 leading-relaxed">
              Most are losing 10+ hours/week to tasks a system could handle. We build the system — fast, affordable, built for your business.
            </p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.35}>
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-widest">
              Drop your URL — we'll show you exactly where AI could save you time and money
            </p>
            <form onSubmit={handleUrlSubmit} className="flex w-full max-w-md gap-2 mb-8">
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="yoursite.com or your business name"
                disabled={hookLoading}
                className="flex-1 px-4 py-2 text-sm border border-border bg-background rounded-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                data-testid="input-url-hook-b"
              />
              <Button
                type="submit"
                disabled={hookLoading}
                className="border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-5 py-2 uppercase tracking-widest text-xs font-bold rounded-sm transition-all duration-300 disabled:opacity-60 min-w-[110px]"
                data-testid="button-free-check-b"
              >
                {hookLoading ? <span className="flex items-center gap-2"><Zap className="h-3 w-3 animate-pulse" />Checking…</span> : "Free AI check"}
              </Button>
            </form>
          </AnimatedContainer>
          <AnimatedContainer delay={0.4} className="flex flex-col sm:flex-row gap-4">
            <Link href="/contact" className="relative rounded-sm">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} variant="teal" />
              <Button className="relative border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-sm transition-all duration-300" data-testid="button-get-audit">
                Get your free audit
              </Button>
            </Link>
            <Link href="/work">
              <Button variant="ghost" className="bg-accent/10 text-accent hover:bg-accent/20 px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-none transition-all duration-300" data-testid="button-view-work-b">
                See what we've built
              </Button>
            </Link>
          </AnimatedContainer>
        </div>

        <aside className="w-full md:w-[420px] p-8 flex flex-col justify-center bg-white/60 dark:bg-white/10 backdrop-blur-sm gap-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-black text-base">BC Detailing HK</p>
              <p className="text-xs text-muted-foreground mt-0.5">Automotive Detailing Studio</p>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest border border-border px-2 py-1 text-muted-foreground font-mono">DEMO REPORT</span>
          </div>

          <div className="flex items-center gap-4 p-4 bg-background/60 border border-border rounded-sm">
            <div className="relative w-14 h-14 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path stroke="currentColor" className="text-border" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path stroke="currentColor" className="text-amber-500" strokeWidth="3" strokeDasharray="38, 100" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-black font-mono">38</span>
              </div>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Overall Digital Score</p>
              <p className="text-amber-500 font-bold text-xs">Below average — action required</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {([
              { label: "Website", score: "2/10", pct: 20, cls: "bg-destructive" },
              { label: "Social Media", score: "6/10", pct: 60, cls: "bg-amber-500" },
              { label: "Booking System", score: "0/10", pct: 3, cls: "bg-destructive" },
              { label: "Infrastructure", score: "3/10", pct: 30, cls: "bg-destructive" },
            ] as const).map((row) => (
              <div key={row.label} className="flex items-center gap-3 text-xs">
                <span className="w-28 text-muted-foreground shrink-0">{row.label}</span>
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div className={`h-full ${row.cls} rounded-full`} style={{ width: `${row.pct}%` }} />
                </div>
                <span className="font-mono text-muted-foreground w-8 text-right">{row.score}</span>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-2.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-destructive flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" /> 4 revenue gaps identified
            </p>
            {auditGaps.map((g) => (
              <div key={g.label} className="flex gap-2.5 text-xs">
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold leading-tight">{g.label}</p>
                  <p className="text-muted-foreground text-[10px]">{g.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <button className="text-primary font-bold text-xs flex items-center gap-1 hover:opacity-80 transition-opacity mt-1">
            Full audit report <ChevronRight className="h-3 w-3" />
          </button>
        </aside>
      </main>
    </InfiniteGrid>
  );
}

function HeroDialogue({
  urlInput, setUrlInput, hookLoading, handleUrlSubmit
}: {
  urlInput: string;
  setUrlInput: (v: string) => void;
  hookLoading: boolean;
  handleUrlSubmit: (e: React.FormEvent) => void;
}) {
  const [selected, setSelected] = useState<BusinessType>('Restaurant');
  const examples = dialogueExamples[selected];
  const tile = businessTiles.find(t => t.id === selected)!;

  return (
    <InfiniteGrid className="min-h-[85vh]" gridSize={40} speedX={0.15} speedY={0.15}>
      <main className="relative z-10 max-w-[1400px] w-full mx-auto border-b">
        <div className="p-8 md:p-16 text-center border-b">
          <AnimatedContainer delay={0.1}>
            <div className="inline-block px-4 py-1 border border-primary text-primary text-[10px] uppercase tracking-[0.2em] mb-8 font-bold">
              Custom Systems · AI Built In
            </div>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tighter max-w-3xl mx-auto mb-6">
              Software built for how <span className="text-primary italic">you</span> work
            </h1>
          </AnimatedContainer>
          <AnimatedContainer delay={0.3}>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8 leading-relaxed">
              Tell us what kind of business you run — we'll show you exactly what we'd build.
            </p>
          </AnimatedContainer>
        </div>

        <div className="border-b">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-px bg-border/40">
            {businessTiles.map((tile) => (
              <button
                key={tile.id}
                onClick={() => setSelected(tile.id)}
                className={`flex flex-col items-center gap-2 p-5 text-center transition-colors ${
                  selected === tile.id
                    ? "bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                }`}
                data-testid={`tile-business-${tile.id.toLowerCase()}`}
              >
                <tile.icon className={`h-5 w-5 ${selected === tile.id ? "text-primary" : ""}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider leading-tight">{tile.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-8 md:p-12">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
            <div>
              <p className="text-accent font-black italic uppercase tracking-[0.3em] text-[10px] mb-2">// What we'd build for you</p>
              <h2 className="text-2xl md:text-3xl font-black tracking-tighter uppercase italic">
                AI systems <span className="text-primary">{tile.label.toLowerCase()}s</span> actually use
              </h2>
            </div>
            <Link href={`/contact?type=${selected.toLowerCase()}`} className="relative rounded-sm shrink-0">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} variant="teal" />
              <Button className="relative border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-6 py-4 uppercase tracking-widest text-[10px] font-bold rounded-sm transition-all duration-300" data-testid="button-dialogue-cta">
                Book a free {tile.label} AI check
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border/40 border border-border mb-8">
            {examples.map((ex) => (
              <div key={ex.title} className="p-8 bg-background hover:bg-muted/30 transition-colors">
                <ex.icon className="h-6 w-6 text-primary mb-4" />
                <h3 className="font-black text-sm mb-2 uppercase italic tracking-tight">{ex.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">{ex.description}</p>
                <span className="inline-block text-[9px] font-black uppercase tracking-widest border border-primary/30 text-primary px-2 py-1">
                  saves ~{ex.saves}
                </span>
              </div>
            ))}
          </div>

          <form onSubmit={handleUrlSubmit} className="flex w-full max-w-md gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="yoursite.com or your business name"
              disabled={hookLoading}
              className="flex-1 px-4 py-2 text-sm border border-border bg-background rounded-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              data-testid="input-url-hook-c"
            />
            <Button
              type="submit"
              disabled={hookLoading}
              className="border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-5 py-2 uppercase tracking-widest text-xs font-bold rounded-sm transition-all duration-300 disabled:opacity-60 min-w-[110px]"
              data-testid="button-free-check-c"
            >
              {hookLoading ? <span className="flex items-center gap-2"><Zap className="h-3 w-3 animate-pulse" />Checking…</span> : "Free AI check"}
            </Button>
          </form>
        </div>
      </main>
    </InfiniteGrid>
  );
}

function AnimatedContainer({ className, delay = 0.1, children }: { className?: string; delay?: number; children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ filter: 'blur(2px)', opacity: 0, y: 20, scale: 0.98 }}
      whileInView={{ filter: 'blur(0px)', opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ delay: delay * 0.5, duration: 0.35, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function HomePage() {
  const [showExitIntent, setShowExitIntent] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [hookLoading, setHookLoading] = useState(false);
  const [, navigate] = useLocation();
  const homepageVariant = useAbVariant("homepage_v1", ["A", "B", "C"]);

  useEffect(() => {
    let fired = false;
    const handleMouseLeave = (e: MouseEvent) => {
      if (fired) return;
      if (e.clientY <= 0) {
        fired = true;
        setShowExitIntent(true);
      }
    };
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, []);

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hookLoading) return;
    const q = urlInput.trim();
    setHookLoading(true);
    setTimeout(() => {
      navigate(q ? `/contact?ref=${encodeURIComponent(q)}` : "/contact");
    }, 1400);
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar items={navItems} />
      <nav className="py-6 px-8 flex justify-between items-center sticky top-0 bg-background/80 backdrop-blur-sm z-40">
        <Link href="/" className="flex items-center gap-2">
          <img src={jdLogo} alt="JD CoreDev" className="h-16 md:h-20 w-auto mix-blend-multiply dark:mix-blend-screen" />
        </Link>
        <div className="flex items-center gap-6">
          <ThemeToggle />
          <Link href="/auth">
            <button className="text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors" data-testid="button-login">
              Sign in
            </button>
          </Link>
        </div>
      </nav>

      {homepageVariant === "A" && (
        <InfiniteGrid className="min-h-[85vh]" gridSize={40} speedX={0.15} speedY={0.15}>
          <main className="relative z-10 max-w-[1400px] w-full mx-auto flex flex-col md:flex-row border-b">
            <div className="flex-grow flex flex-col justify-center items-center text-center p-8 md:p-20 md:border-r">
              <AnimatedContainer delay={0.1}>
                <div className="inline-block px-4 py-1 border border-primary text-primary text-[10px] uppercase tracking-[0.2em] mb-8 font-bold">
                  Custom Systems · AI Built In
                </div>
              </AnimatedContainer>
              <AnimatedContainer delay={0.2}>
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-tight tracking-tighter max-w-3xl mb-6">
                  Software that actually <span className="text-primary italic">works for you</span>
                </h1>
              </AnimatedContainer>
              <AnimatedContainer delay={0.3}>
                <p className="text-muted-foreground text-lg max-w-xl mb-6 leading-relaxed">
                  We build custom systems for your business — automations, tools, dashboards, bots —
                  with AI woven right in. Not just for big companies. Built for businesses like yours.
                </p>
              </AnimatedContainer>
              <AnimatedContainer delay={0.35}>
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-widest">
                  Drop your URL — we'll show you exactly where AI could save you time and money
                </p>
                <form onSubmit={handleUrlSubmit} className="flex w-full max-w-md gap-2 mb-8">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder="yoursite.com or your business name"
                    disabled={hookLoading}
                    className="flex-1 px-4 py-2 text-sm border border-border bg-background rounded-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                    data-testid="input-url-hook"
                  />
                  <Button
                    type="submit"
                    disabled={hookLoading}
                    className="border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-5 py-2 uppercase tracking-widest text-xs font-bold rounded-sm transition-all duration-300 disabled:opacity-60 min-w-[110px]"
                    data-testid="button-free-check"
                  >
                    {hookLoading ? (
                      <span className="flex items-center gap-2"><Zap className="h-3 w-3 animate-pulse" />Checking…</span>
                    ) : "Free AI check"}
                  </Button>
                </form>
                {hookLoading && (
                  <p className="text-xs text-primary font-medium animate-pulse mb-4" data-testid="text-hook-loading">
                    Checking where AI could plug into your business…
                  </p>
                )}
              </AnimatedContainer>
              <AnimatedContainer delay={0.4} className="flex flex-col sm:flex-row gap-4">
                <Link href="/contact" className="relative rounded-sm">
                  <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} variant="teal" />
                  <Button className="relative border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-sm transition-all duration-300" data-testid="button-get-started">
                    Start a project
                  </Button>
                </Link>
                <Link href="/work">
                  <Button variant="ghost" className="bg-accent/10 text-accent hover:bg-accent/20 px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-none transition-all duration-300" data-testid="button-view-work">
                    See our work
                  </Button>
                </Link>
              </AnimatedContainer>
            </div>
            <aside className="w-full md:w-[350px] p-12 flex flex-col justify-center bg-white/60 dark:bg-white/10 backdrop-blur-sm">
              <div className="mb-8">
                <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-accent mb-4 italic">// Why it works</p>
              </div>
              {coreValues.map((value, index) => (
                <AnimatedContainer key={value.title} delay={0.2 + index * 0.1} className="py-6 border-b last:border-b-0">
                  <value.icon className="text-primary mb-3 h-6 w-6" />
                  <h3 className="font-black text-xl mb-1">{value.title}</h3>
                  <p className="text-sm text-muted-foreground">{value.description}</p>
                </AnimatedContainer>
              ))}
            </aside>
          </main>
        </InfiniteGrid>
      )}

      {homepageVariant === "B" && (
        <HeroEvidence
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          hookLoading={hookLoading}
          handleUrlSubmit={handleUrlSubmit}
        />
      )}

      {homepageVariant === "C" && (
        <HeroDialogue
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          hookLoading={hookLoading}
          handleUrlSubmit={handleUrlSubmit}
        />
      )}

      {homepageVariant !== "C" && (
      <section className="py-16 md:py-24 border-t bg-muted/20">
        <div className="mx-auto w-full max-w-[1400px] px-8">
          <AnimatedContainer className="text-center mb-14">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// What this looks like</span>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
              Real systems, <span className="text-primary">real results</span>
            </h2>
            <p className="text-muted-foreground mt-4 text-lg max-w-2xl mx-auto">
              Here's the kind of thing we build. Each one is custom to the business — not a SaaS subscription, not a template.
            </p>
          </AnimatedContainer>

          <AnimatedContainer delay={0.2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/40 border border-border">
              {aiExamples.map((ex) => (
                <div key={ex.title} className="p-8 bg-background hover:bg-muted/30 transition-colors">
                  <ex.icon className="h-7 w-7 text-primary mb-4" />
                  <h3 className="font-black text-base mb-2 uppercase italic tracking-tight">{ex.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{ex.description}</p>
                </div>
              ))}
            </div>
          </AnimatedContainer>

          <AnimatedContainer delay={0.3} className="text-center mt-10">
            <p className="text-muted-foreground text-sm mb-4">These are just examples — your system is built around your business specifically.</p>
            <Link href="/contact">
              <Button variant="outline" className="font-bold uppercase tracking-widest text-xs gap-2" data-testid="button-examples-cta">
                Tell us what you need <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </AnimatedContainer>
        </div>
      </section>
      )}

      <section className="py-20 relative overflow-hidden">
        <ContainerScroll
          titleComponent={
            <div className="flex flex-col items-center mb-20 px-8">
              <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm">// How it works</span>
              <h2 className="text-4xl md:text-7xl font-black text-foreground tracking-tighter uppercase italic text-center">
                Simple <span className="text-primary">Process</span>
              </h2>
              <p className="max-w-2xl text-muted-foreground mt-8 text-lg leading-relaxed text-center">
                No jargon, no confusion. Here's exactly how we go from "I have an idea" to "it's live and working."
              </p>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 md:gap-8 md:p-8 h-full">
            {processSteps.map((step) => (
              <div key={step.number} className="group p-4 md:p-8 rounded-xl border bg-background/50 backdrop-blur-sm hover:border-primary/50 transition-colors h-full flex flex-col min-w-0">
                <div className="text-accent font-black mb-2 md:mb-6 text-xl md:text-3xl">{step.number}.</div>
                <h4 className="font-black text-lg md:text-xl lg:text-2xl mb-2 md:mb-6 uppercase italic break-words leading-tight">{step.title}</h4>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed flex-grow">{step.description}</p>
              </div>
            ))}
          </div>
        </ContainerScroll>
      </section>

      <section className="py-16 md:py-24 border-t">
        <div className="mx-auto w-full max-w-[1400px] space-y-12 px-8">
          <AnimatedContainer className="mx-auto max-w-3xl text-center">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// What you get</span>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
              Fast. Smart. <span className="text-primary">Yours.</span>
            </h2>
            <p className="text-muted-foreground mt-6 text-lg tracking-wide">
              Built for real businesses — not demos, not MVPs that fall apart.
            </p>
          </AnimatedContainer>

          <AnimatedContainer
            delay={0.4}
            className="grid grid-cols-1 divide-x divide-y divide-dashed border border-dashed sm:grid-cols-2 md:grid-cols-3"
          >
            {serviceFeatures.map((feature, i) => (
              <FeatureCard key={i} feature={feature} data-testid={`feature-card-${i}`} />
            ))}
          </AnimatedContainer>
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 relative z-10">
        <div className="p-8 md:p-20 md:border-r bg-card/40 backdrop-blur-sm">
          <AnimatedContainer>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary text-[10px] uppercase font-bold mb-8">
              <Shield className="h-3 w-3" />
              Hosting Included
            </div>
          </AnimatedContainer>
          <AnimatedContainer delay={0.1}>
            <h2 className="text-4xl md:text-5xl font-black mb-8 leading-tight">
              We build it, <span className="text-accent">we host it</span>
            </h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <p className="text-muted-foreground mb-10 leading-relaxed">
              You don't need to manage servers or worry about deployment. We handle everything from launch to ongoing maintenance. You just use it.
            </p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.3}>
            <ul className="space-y-4 mb-10">
              {hostingFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm font-medium">
                  <Check className="text-primary h-4 w-4" />
                  {feature}
                </li>
              ))}
            </ul>
          </AnimatedContainer>
          <AnimatedContainer delay={0.4}>
            <Link href="/services" className="relative rounded-sm inline-block">
              <GlowingEffect
                spread={40}
                glow={true}
                disabled={false}
                proximity={64}
                inactiveZone={0.01}
                borderWidth={2}
                variant="teal"
              />
              <Button 
                className="relative border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-sm transition-all duration-300"
                data-testid="button-learn-more"
              >
                See all services
              </Button>
            </Link>
          </AnimatedContainer>
        </div>
        
        <div className="grid grid-cols-2 bg-background">
          <AnimatedContainer delay={0.1} className="p-8 border-b border-r flex flex-col justify-center items-center text-center">
            <Globe className="text-primary h-10 w-10 mb-4" />
            <h4 className="font-black uppercase tracking-widest text-xs mb-2">Global</h4>
            <p className="text-[10px] text-muted-foreground">CDN delivery</p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2} className="p-8 border-b flex flex-col justify-center items-center text-center">
            <Shield className="text-primary h-10 w-10 mb-4" />
            <h4 className="font-black uppercase tracking-widest text-xs mb-2">Secure</h4>
            <p className="text-[10px] text-muted-foreground">SSL & monitoring</p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.3} className="p-8 border-r flex flex-col justify-center items-center text-center">
            <div className="text-3xl font-black text-primary mb-2">99.9%</div>
            <h4 className="font-black uppercase tracking-widest text-xs mb-2">Uptime</h4>
            <p className="text-[10px] text-muted-foreground">Guaranteed</p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.4} className="p-8 flex flex-col justify-center items-center text-center">
            <Settings className="text-primary h-10 w-10 mb-4" />
            <h4 className="font-black uppercase tracking-widest text-xs mb-2">Managed</h4>
            <p className="text-[10px] text-muted-foreground">Full support</p>
          </AnimatedContainer>
        </div>
      </section>

      <section className="py-20 border-t bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-8 md:px-20">
          <div className="flex flex-col items-center text-center mb-16">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm">// Our work</span>
            <h2 className="text-4xl md:text-7xl font-black text-foreground tracking-tighter uppercase italic">
              Stuff we've <span className="text-primary">actually built</span>
            </h2>
          </div>
          
          <div className="relative rounded-2xl overflow-hidden border-4 border-border shadow-2xl">
            <img
              src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426"
              alt="Custom software dashboard"
              className="w-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
              <Link href="/work">
                <Button className="font-bold uppercase tracking-widest text-xs gap-2 shadow-lg" data-testid="button-see-work">
                  See all projects <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-12">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Targeted services</span>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
              Specific <span className="text-primary">audits & rebuilds</span>
            </h2>
            <p className="text-muted-foreground mt-4 text-lg max-w-2xl mx-auto">
              Standalone services for businesses who already know what they need fixed.
            </p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Link href="/services/ai-advertising-audit" className="block border border-border p-8 hover:bg-muted/20 transition-colors group" data-testid="card-home-aaa">
                <div className="flex items-center gap-3 mb-3">
                  <Target className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-black uppercase italic tracking-tight">AI Advertising Audit</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  A plain-English review of your Google and Meta ads. We find the wasted spend, fix the tracking, and sharpen the creative — so your budget actually pays back.
                </p>
                <span className="text-xs font-bold uppercase tracking-widest text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  See the audit <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
              {/* Phase 2 will add the SEO Audit sibling card here */}
            </div>
          </AnimatedContainer>
        </div>
      </section>

      <footer className="bg-card border-t pt-20">
        <div className="max-w-[1400px] mx-auto px-8 md:px-20 text-center mb-20">
          <AnimatedContainer>
            <h2 className="text-4xl md:text-6xl font-black mb-6 uppercase tracking-tighter">
              What would <span className="text-primary">your system</span> look like?
            </h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.1}>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-12">
              Tell us what's a pain in your business right now. We'll tell you what we'd build — no commitment, no sales pitch.
            </p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2} className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/contact" className="relative rounded-sm">
              <GlowingEffect
                spread={40}
                glow={true}
                disabled={false}
                proximity={64}
                inactiveZone={0.01}
                borderWidth={2}
                variant="teal"
              />
              <Button 
                className="relative border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-sm transition-all duration-300"
                data-testid="button-cta-contact"
              >
                Let's talk
              </Button>
            </Link>
            <Link href="/auth">
              <Button 
                variant="ghost"
                className="bg-accent/10 text-accent hover:bg-accent/20 px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-none transition-all duration-300"
              >
                Client portal
              </Button>
            </Link>
          </AnimatedContainer>
        </div>
        
        <div className="border-t py-12 px-8 md:px-20">
          <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
            <div className="max-w-xs">
              <Link href="/" className="flex items-center gap-2 mb-6">
                <img src={jdLogo} alt="JD CoreDev" className="h-12 w-auto mix-blend-multiply dark:mix-blend-screen" />
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Custom systems and AI-integrated tools for businesses that want to run smarter.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-16">
              <div>
                <h5 className="text-[10px] uppercase font-black tracking-widest mb-6 text-accent">Links</h5>
                <ul className="text-xs space-y-4 font-bold uppercase tracking-wider">
                  <li><Link href="/services" className="hover:text-primary transition-colors">Services</Link></li>
                  <li><Link href="/work" className="hover:text-primary transition-colors">Work</Link></li>
                  <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
                </ul>
              </div>
              <div>
                <h5 className="text-[10px] uppercase font-black tracking-widest mb-6 text-accent">Access</h5>
                <ul className="text-xs space-y-4 font-bold uppercase tracking-wider">
                  <li><Link href="/auth" className="hover:text-primary transition-colors">Sign In</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-t py-8 px-8 md:px-20 text-center text-sm text-muted-foreground">
          {new Date().getFullYear()} JD CoreDev. All rights reserved.
        </div>
      </footer>

      <Link
        href="/contact"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full shadow-lg font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        data-testid="button-sticky-cta"
      >
        <Sparkles className="h-4 w-4" />
        Free AI check
      </Link>

      {showExitIntent && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => setShowExitIntent(false)}
        >
          <div
            className="bg-background border border-border rounded-lg p-8 max-w-sm w-full relative shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowExitIntent(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-close-exit-intent"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="mb-2 text-[10px] uppercase tracking-widest font-bold text-primary">Before you go</div>
            <h3 className="text-xl font-black mb-3 leading-tight">
              Want a free look at how a custom AI system could slot into your business?
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              No obligation, no jargon. We'll show you exactly where AI saves time and money for a business like yours.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/contact" onClick={() => setShowExitIntent(false)}>
                <Button className="w-full font-bold uppercase tracking-widest text-xs gap-2" data-testid="button-exit-intent-cta">
                  Show me what AI could do <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
              <button
                onClick={() => setShowExitIntent(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                No thanks, I'm good
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
