import jdLogo from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151.png";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InfiniteGrid } from "@/components/ui/infinite-grid";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { FeatureCard } from "@/components/ui/grid-feature-cards";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { motion, useReducedMotion } from "framer-motion";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { 
  Home,
  Briefcase,
  Mail,
  User,
  Check,
  Globe,
  Shield,
  Settings,
  TrendingUp,
  DollarSign,
  Verified,
  Zap,
  Cpu,
  Fingerprint,
  Pencil,
  Sparkles
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
    title: "Tailored",
    description: "Built for your specific enterprise needs.",
  },
  {
    icon: TrendingUp,
    title: "Scalable",
    description: "Grows with you as your traffic expands.",
  },
  {
    icon: DollarSign,
    title: "Affordable",
    description: "Competitive pricing without compromise.",
  },
  {
    icon: Verified,
    title: "Secure",
    description: "Advanced protection built-in by design.",
  },
];

const processSteps = [
  {
    number: "01",
    title: "Discovery & Strategy",
    description: "Understanding your business goals and technical requirements to create a tailored roadmap built from the ground up.",
  },
  {
    number: "02",
    title: "Design & Prototyping",
    description: "Creating intuitive interfaces and validating concepts with clear communication throughout the process.",
  },
  {
    number: "03",
    title: "Development & Testing",
    description: "Building modern, maintainable code designed to scale with rigorous testing at every stage.",
  },
  {
    number: "04",
    title: "Deployment & Support",
    description: "Managed hosting and deployment included with ongoing maintenance and support.",
  },
];

const hostingFeatures = [
  "Professional cloud hosting with 99.9% uptime",
  "Automatic SSL certificates and security updates",
  "Performance monitoring and optimization",
  "Custom domain setup and configuration",
  "Scalable infrastructure that grows with you",
];

const serviceFeatures = [
  {
    title: "Lightning Fast",
    icon: Zap,
    description: "Optimized performance that keeps your users engaged and your business running smoothly.",
  },
  {
    title: "Powerful Backend",
    icon: Cpu,
    description: "Robust server architecture designed to handle complex business logic at scale.",
  },
  {
    title: "Enterprise Security",
    icon: Fingerprint,
    description: "Bank-level security protocols protecting your data and your customers.",
  },
  {
    title: "Custom Design",
    icon: Pencil,
    description: "Bespoke interfaces tailored to your brand and user experience goals.",
  },
  {
    title: "Full Control",
    icon: Settings,
    description: "Complete ownership of your codebase with transparent development practices.",
  },
  {
    title: "AI-Ready",
    icon: Sparkles,
    description: "Modern architecture prepared for AI integrations and future innovations.",
  },
];

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

      <InfiniteGrid className="min-h-[80vh]" gridSize={40} speedX={0.15} speedY={0.15}>
        <main className="relative z-10 max-w-[1400px] w-full mx-auto flex flex-col md:flex-row border-b">
          <div className="flex-grow flex flex-col justify-center items-center text-center p-8 md:p-20 md:border-r">
          <AnimatedContainer delay={0.1}>
            <div className="inline-block px-4 py-1 border border-primary text-primary text-[10px] uppercase tracking-[0.2em] mb-8 font-bold">
              Custom Software Development
            </div>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-tight tracking-tighter max-w-3xl mb-10">
              Software Development <span className="text-primary italic">Done Right</span>
            </h1>
          </AnimatedContainer>
          <AnimatedContainer delay={0.3}>
            <p className="text-muted-foreground text-lg max-w-xl mb-12 leading-relaxed">
              I build custom software solutions for businesses that need reliable, scalable systems. 
              From web applications to backend APIs, I help turn your ideas into production-ready products.
            </p>
          </AnimatedContainer>
          <AnimatedContainer delay={0.4} className="flex flex-col sm:flex-row gap-4">
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
                data-testid="button-get-started"
              >
                Launch Project
              </Button>
            </Link>
            <Link href="/work">
              <Button 
                variant="ghost"
                className="bg-accent/10 text-accent hover:bg-accent/20 px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-none transition-all duration-300"
                data-testid="button-view-work"
              >
                View Work
              </Button>
            </Link>
          </AnimatedContainer>
          </div>
        
          <aside className="w-full md:w-[350px] p-12 flex flex-col justify-center bg-white/60 dark:bg-white/10 backdrop-blur-sm">
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-accent mb-4 italic">// Core Values</p>
          </div>
          {coreValues.map((value, index) => (
            <AnimatedContainer 
              key={value.title} 
              delay={0.2 + index * 0.1}
              className="py-6 border-b last:border-b-0"
            >
              <value.icon className="text-primary mb-3 h-6 w-6" />
              <h3 className="font-black text-xl mb-1">{value.title}</h3>
              <p className="text-sm text-muted-foreground">{value.description}</p>
            </AnimatedContainer>
          ))}
          </aside>
        </main>
      </InfiniteGrid>

      <section className="py-20 relative overflow-hidden">
        <ContainerScroll
          titleComponent={
            <div className="flex flex-col items-center mb-20 px-8">
              <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm">// How We Work</span>
              <h2 className="text-4xl md:text-7xl font-black text-foreground tracking-tighter uppercase italic text-center">
                Our <span className="text-primary">Process</span>
              </h2>
              <p className="max-w-2xl text-muted-foreground mt-8 text-lg leading-relaxed text-center">
                Every solution is crafted specifically for your unique requirements. No templates, no compromises—just software designed around your business.
              </p>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 md:gap-8 md:p-8 h-full">
            {processSteps.map((step, index) => (
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
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// What We Deliver</span>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
              Power. Speed. <span className="text-primary">Control.</span>
            </h2>
            <p className="text-muted-foreground mt-6 text-lg tracking-wide">
              Everything you need to build fast, secure, scalable applications.
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
              Don't Just Build It, <span className="text-accent">Launch It</span>
            </h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.2}>
            <p className="text-muted-foreground mb-10 leading-relaxed">
              Your project deserves more than just code. I provide complete deployment and hosting solutions so your application goes live without the hassle of managing servers.
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
                Learn More
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
            <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm">// Our Work</span>
            <h2 className="text-4xl md:text-7xl font-black text-foreground tracking-tighter uppercase italic">
              Crafting <span className="text-primary">Digital Masterpieces</span>
            </h2>
          </div>
          
          <div className="relative rounded-2xl overflow-hidden border-4 border-border shadow-2xl">
            <img
              src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426"
              alt="Software Development Dashboard"
              className="w-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      <footer className="bg-card border-t pt-20">
        <div className="max-w-[1400px] mx-auto px-8 md:px-20 text-center mb-20">
          <AnimatedContainer>
            <h2 className="text-4xl md:text-6xl font-black mb-10 uppercase tracking-tighter">Ready to Start Your Project?</h2>
          </AnimatedContainer>
          <AnimatedContainer delay={0.1}>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-12">
              Let's discuss your project requirements and find the right solution for your business.
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
                Get in Touch
              </Button>
            </Link>
            <Link href="/auth">
              <Button 
                variant="ghost"
                className="bg-accent/10 text-accent hover:bg-accent/20 px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-none transition-all duration-300"
              >
                Client Portal
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
                Custom software development for modern businesses.
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
    </div>
  );
}
