import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import {
  Code, Layers, Rocket, MessageSquare, ArrowRight, Server, Shield, Zap,
  Globe, Home, Settings, Briefcase, Mail, Sparkles, Bot, Wrench,
  GraduationCap, Users, CalendarDays, MessageCircle, Palette, RefreshCw,
  Target, Languages,
} from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { ThemeToggle } from "@/components/ThemeToggle";
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

const buildServices = [
  {
    icon: Code,
    title: "Custom Systems",
    description: "Tools and applications built around how your business actually runs — not around a template. Internal dashboards, client portals, full workflow systems.",
    features: [
      "Internal tools and dashboards",
      "Client and staff portals",
      "API connections and integrations",
      "Database design and management",
    ],
  },
  {
    icon: Palette,
    title: "Creative AI Tools",
    description: "AI-powered products with a visual or generative output — tools your customers interact with directly. From image generation pipelines to product visualisers.",
    features: [
      "AI image and render pipelines",
      "Product visualisation tools",
      "Generative content systems",
      "Custom AI-powered apps",
    ],
  },
  {
    icon: Rocket,
    title: "Fast Builds & MVPs",
    description: "Got an idea you want to test quickly? We get something real in front of your customers fast — then iterate once you know it works.",
    features: [
      "Rapid prototyping",
      "Functional MVP in weeks, not months",
      "User feedback built into the process",
      "Easy to scale when ready",
    ],
  },
  {
    icon: Sparkles,
    title: "AI Integration",
    description: "We add AI where it genuinely helps — automating admin, surfacing the right info at the right time, and making your system smarter without complicating it.",
    features: [
      "Automated email routing and responses",
      "Lead scoring and follow-up drafts",
      "Document and invoice processing",
      "Custom chatbots trained on your business",
    ],
  },
  {
    icon: Target,
    title: "Automation Builds",
    description: "Custom workflow automation that replaces repetitive manual processes. Lead generation pipelines, WhatsApp business bots, multilingual content systems.",
    features: [
      "Lead generation and outreach pipelines",
      "WhatsApp business bots",
      "Billing and invoice automation",
      "Bilingual (English / Cantonese) workflows",
    ],
  },
  {
    icon: Wrench,
    title: "Ongoing Support",
    description: "We don't disappear after launch. Your system stays maintained, updated, and improved as your business grows. You have someone to call.",
    features: [
      "Bug fixes and updates",
      "New features added over time",
      "Performance monitoring",
      "Direct access — no ticket queue",
    ],
  },
];

const consultingServices = [
  {
    icon: GraduationCap,
    title: "AI Setup Day",
    subtitle: "Half-day or Full-day",
    description: "We come to you, audit your current workflow, identify the highest-leverage tasks to automate, and set everything up in a single session. You leave with a working system and a cheat sheet — not a list of homework.",
    tiers: [
      { label: "Half-day (3–4h)", price: "HK$8,000", note: "3–5 workflows set up" },
      { label: "Full day (6–8h)",  price: "HK$15,000", note: "Full workflow overhaul + automations" },
    ],
  },
  {
    icon: CalendarDays,
    title: "AI Audit",
    subtitle: "1-hour session",
    description: "A focused review of your current tools and processes. We identify where AI can save you the most time and deliver a written action plan you can act on immediately — or hand to us to build.",
    tiers: [
      { label: "1-hour audit + written report", price: "HK$2,000", note: "Full recommendations included" },
    ],
  },
  {
    icon: Users,
    title: "Staff AI Training Workshop",
    subtitle: "Half-day group session",
    description: "Train your whole team at once. We run a hands-on session tailored to your industry, showing staff how to use AI tools to cut admin time in their specific roles.",
    tiers: [
      { label: "Up to 10 staff",  price: "HK$12,000", note: "Full-day available" },
      { label: "Up to 25 staff",  price: "HK$20,000", note: "Includes printed guides" },
    ],
  },
  {
    icon: RefreshCw,
    title: "AI Retainer",
    subtitle: "Monthly",
    description: "Ongoing access to expand and maintain your AI setup as your business evolves. New use cases added each month, prompts kept sharp, and new tools integrated as they become useful.",
    tiers: [
      { label: "Starter",     price: "HK$3,500/mo", note: "2 updates per month" },
      { label: "Growth",      price: "HK$6,000/mo", note: "Unlimited updates + priority support" },
    ],
  },
];

export default function ServicesPage() {
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

      {/* Build services */}
      <section className="py-20">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-16">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// What we build</span>
            <h1 className="text-5xl md:text-7xl font-black text-foreground tracking-tighter uppercase italic mb-6">
              Services
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Custom systems, AI tools, and automation for businesses that want to run smoother and stop wasting time on things that should be automated.
            </p>
          </AnimatedContainer>

          <AnimatedContainer delay={0.2}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border border-border">
              {buildServices.map((service, index) => {
                const col = index % 3;
                const row = Math.floor(index / 3);
                const totalRows = Math.ceil(buildServices.length / 3);
                const borderRight = col < 2 ? "lg:border-r" : "";
                const borderBottom = row < totalRows - 1 ? "border-b" : "";
                const mdBorderRight = index % 2 === 0 ? "md:border-r lg:border-r-0" : "";
                const mdBorderBottom = index < buildServices.length - 2 ? "md:border-b" : "md:border-b-0";
                return (
                  <div key={service.title} className={`p-8 md:p-10 ${borderRight} ${borderBottom} ${mdBorderRight} ${mdBorderBottom} border-border group hover:bg-muted/30 transition-colors`}>
                    <div className="flex items-start gap-4">
                      <span className="text-5xl font-black text-primary/15 italic leading-none">0{index + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <service.icon className="h-5 w-5 text-primary" />
                          <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tight">{service.title}</h3>
                        </div>
                        <p className="text-muted-foreground mb-5 leading-relaxed text-sm">{service.description}</p>
                        <ul className="space-y-2">
                          {service.features.map((feature) => (
                            <li key={feature} className="flex items-center gap-3 text-xs uppercase tracking-wide">
                              <span className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
                              <span>{feature}</span>
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

      {/* Hosting & Maintenance */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8 md:px-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border">
            <AnimatedContainer className="p-8 md:p-16 md:border-r border-border flex flex-col justify-center">
              <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Included</span>
              <h2 className="text-4xl md:text-5xl font-black text-foreground tracking-tighter uppercase italic mb-6">
                Hosting & <span className="text-primary">Maintenance</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed text-lg">
                We handle everything after launch. Your system stays live, fast, and updated — without you having to touch a server.
              </p>
            </AnimatedContainer>
            <AnimatedContainer delay={0.2} className="p-8 md:p-16 bg-muted/30">
              <div className="flex items-center gap-4 mb-8">
                <Server className="h-10 w-10 text-primary" />
                <span className="text-2xl font-black uppercase italic">All taken care of</span>
              </div>
              <ul className="space-y-4">
                {["99.9% uptime guarantee","SSL certificates included","Custom domain setup","Scalable infrastructure","Performance monitoring","Security updates"].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm uppercase tracking-wide">
                    <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </AnimatedContainer>
          </div>
        </div>
      </section>

      {/* Advisory & Training */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-16">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Advisory & Training</span>
            <h2 className="text-4xl md:text-5xl font-black text-foreground tracking-tighter uppercase italic mb-4">
              Work smarter with <span className="text-primary">AI</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Not every business needs a custom build. Sometimes you just need someone to show you what's possible and set it up right. All prices in HKD.
            </p>
          </AnimatedContainer>

          <AnimatedContainer delay={0.2}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {consultingServices.map((svc) => (
                <div key={svc.title} className="border border-border p-8 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <svc.icon className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-black uppercase italic tracking-tight">{svc.title}</h3>
                  </div>
                  <p className="text-xs text-accent uppercase tracking-widest font-bold mb-4">{svc.subtitle}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">{svc.description}</p>
                  <div className="space-y-3">
                    {svc.tiers.map((tier) => (
                      <div key={tier.label} className="flex items-center justify-between border border-border/50 px-4 py-3 bg-muted/20">
                        <div>
                          <p className="text-sm font-semibold">{tier.label}</p>
                          <p className="text-[11px] text-muted-foreground">{tier.note}</p>
                        </div>
                        <span className="text-lg font-black text-primary">{tier.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AnimatedContainer>

          <AnimatedContainer delay={0.3} className="mt-8 border border-border/50 bg-muted/10 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Languages className="h-8 w-8 text-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="font-black uppercase italic text-sm mb-1">Bilingual by default</p>
              <p className="text-sm text-muted-foreground">All consultations and training delivered in English and Cantonese. We set up workflows that handle both languages — something overseas consultants simply can't match in the HK market.</p>
            </div>
            <Link href="/contact">
              <Button variant="outline" className="font-black uppercase italic text-xs tracking-wider whitespace-nowrap" data-testid="button-enquire">
                Enquire <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </AnimatedContainer>
        </div>
      </section>

      {/* Why us */}
      <section className="py-20 border-t">
        <div className="max-w-[1400px] mx-auto px-8">
          <AnimatedContainer className="text-center mb-12">
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Why us</span>
            <h2 className="text-4xl md:text-5xl font-black text-foreground tracking-tighter uppercase italic">
              The <span className="text-primary">JD CoreDev</span> difference
            </h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border/50 border rounded-md overflow-hidden">
              {[
                { icon: Zap,            title: "Fast turnaround",     description: "No long waits. We move quickly and keep you in the loop throughout." },
                { icon: Shield,         title: "Secure by default",   description: "Security is baked in from day one — not an afterthought." },
                { icon: Layers,         title: "Built to last",       description: "Clean code that won't need rewriting in six months when your needs change." },
                { icon: Bot,            title: "AI where it helps",   description: "We only add AI where it genuinely saves you time — not just to sound modern." },
                { icon: Globe,          title: "Fast everywhere",     description: "Optimised for speed so your system feels snappy, wherever your team is." },
                { icon: MessageSquare,  title: "Direct access",       description: "You deal with the developer directly. No account managers, no guessing games." },
              ].map((feature) => (
                <div key={feature.title} className="p-8 bg-background hover:bg-muted/30 transition-colors">
                  <feature.icon className="h-8 w-8 text-primary mb-4" />
                  <h3 className="font-black uppercase italic text-lg mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </AnimatedContainer>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-8 text-center">
          <AnimatedContainer>
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Ready?</span>
            <h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tighter uppercase italic mb-6">
              Tell us what you <span className="text-primary">need</span>
            </h2>
            <p className="text-muted-foreground mb-10 max-w-xl mx-auto">
              No jargon, no commitment. Just tell us what's a pain in your business and we'll tell you what we'd build.
            </p>
            <Link href="/contact">
              <Button size="lg" className="font-black uppercase italic tracking-wider gap-2" data-testid="button-contact">
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
