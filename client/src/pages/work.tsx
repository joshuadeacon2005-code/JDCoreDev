import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import {
  Home, Settings, Briefcase, Mail, Palette, Type, Sparkles, Paintbrush,
  ShoppingCart, CreditCard, BarChart3, Package, Calendar, Bell, Users,
  TrendingUp, Database, Shield, Scan, Truck, Wand2, Layers, Box,
} from "lucide-react";
import logoImage from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151-BEa_X509_1776312718936.png";

const navItems = [
  { name: 'Home', url: '/', icon: Home },
  { name: 'Services', url: '/services', icon: Settings },
  { name: 'Work', url: '/work', icon: Briefcase },
  { name: 'Contact', url: '/contact', icon: Mail }
];

const creativeProjects = [
  {
    title: "CosmoPlushCraft3D",
    titleAccent: "AI Visualiser",
    label: "Creative AI",
    description: "A web app for plush toy designers and manufacturers that turns 2D character drawings into photorealistic 3D product renders. Upload a sketch → get a full front, back, and side-view spec sheet with accurate fabric textures from a 19-material library.",
    highlights: [
      { icon: Wand2,  title: "Sketch to 3D Render",    desc: "Photorealistic plush from a 2D drawing in seconds" },
      { icon: Layers, title: "19-Material Fabric Library", desc: "Bunny fur, corduroy, fleece — exact texture reproduction" },
      { icon: Box,    title: "Full Spec Sheet Output",  desc: "Front, back, and side views for manufacturing" },
    ],
    tags: ["Generative AI", "Image Pipeline", "Product Design", "B2B SaaS"],
    preview: {
      initials: "CP",
      name: "CosmoPlushCraft3D",
      subtitle: "AI Plush Visualiser",
      metrics: [
        { label: "Views Generated", value: "3",    color: "text-primary"    },
        { label: "Fabrics",         value: "19",   color: "text-accent"     },
        { label: "Turnaround",      value: "<60s", color: "text-foreground" },
      ],
    },
    cta: "View Project",
    href: "https://cosmoplushcraft3d.com",
    featured: true,
  },
];

const projects = [
  {
    title: "Therapist & Counselor",
    titleAccent: "Portal",
    label: "New Release",
    description: "A complete practice management solution designed for mental health professionals. Secure client portal, appointment scheduling, session notes, and billing—all in one place.",
    highlights: [
      { icon: Palette, title: "Complete Custom Styling", desc: "Your brand colors, your identity" },
      { icon: Type, title: "Custom Typography", desc: "Fonts that match your practice's tone" },
      { icon: Paintbrush, title: "Fully Tailored UI", desc: "Every element designed to your specs" },
    ],
    tags: ["HIPAA-Ready", "Secure Portal", "Appointment Booking", "Session Notes", "Invoicing"],
    preview: {
      initials: "TC",
      name: "Therapy Connect",
      subtitle: "Practice Dashboard",
      metrics: [
        { label: "Today's Sessions", value: "4", color: "text-primary" },
        { label: "New Inquiries", value: "2", color: "text-accent" },
        { label: "Pending Notes", value: "1", color: "text-foreground" },
      ]
    },
    cta: "Request a Demo",
  },
  {
    title: "E-Commerce",
    titleAccent: "Platform",
    label: "Full Stack",
    description: "A full-featured e-commerce platform with real-time inventory management, payment processing, and analytics dashboard for modern online retailers.",
    highlights: [
      { icon: ShoppingCart, title: "Product Management", desc: "Inventory, variants, and categories" },
      { icon: CreditCard, title: "Payment Processing", desc: "Stripe integration with subscriptions" },
      { icon: BarChart3, title: "Analytics Dashboard", desc: "Sales, traffic, and conversion metrics" },
    ],
    tags: ["React", "Node.js", "PostgreSQL", "Stripe", "Real-time"],
    preview: {
      initials: "EC",
      name: "ShopFlow",
      subtitle: "Store Dashboard",
      metrics: [
        { label: "Today's Orders", value: "23", color: "text-primary" },
        { label: "Revenue", value: "$1.2k", color: "text-accent" },
        { label: "Active Carts", value: "8", color: "text-foreground" },
      ]
    },
    cta: "View Details",
  },
  {
    title: "SaaS",
    titleAccent: "Dashboard",
    label: "B2B Solution",
    description: "Analytics and reporting dashboard for a B2B SaaS product with custom data visualizations, export capabilities, and team collaboration features.",
    highlights: [
      { icon: TrendingUp, title: "Custom Visualizations", desc: "Charts tailored to your data" },
      { icon: Users, title: "Team Collaboration", desc: "Multi-user access with roles" },
      { icon: Database, title: "Data Export", desc: "CSV, PDF, and API access" },
    ],
    tags: ["TypeScript", "Next.js", "Chart.js", "AWS", "REST API"],
    preview: {
      initials: "SD",
      name: "DataPulse",
      subtitle: "Analytics Hub",
      metrics: [
        { label: "Active Users", value: "142", color: "text-primary" },
        { label: "Reports Today", value: "28", color: "text-accent" },
        { label: "Uptime", value: "99.9%", color: "text-foreground" },
      ]
    },
    cta: "View Details",
  },
  {
    title: "Booking",
    titleAccent: "System",
    label: "Scheduling",
    description: "Appointment booking and scheduling system with calendar integrations, automated notifications, and customer management for service businesses.",
    highlights: [
      { icon: Calendar, title: "Smart Scheduling", desc: "Availability rules and buffer times" },
      { icon: Bell, title: "Automated Reminders", desc: "SMS and email notifications" },
      { icon: Users, title: "Client Management", desc: "History, preferences, and notes" },
    ],
    tags: ["React", "Express", "MongoDB", "Twilio", "Google Calendar"],
    preview: {
      initials: "BS",
      name: "BookEase",
      subtitle: "Scheduling Hub",
      metrics: [
        { label: "Today's Bookings", value: "12", color: "text-primary" },
        { label: "This Week", value: "47", color: "text-accent" },
        { label: "No-shows", value: "0", color: "text-foreground" },
      ]
    },
    cta: "View Details",
  },
  {
    title: "Inventory",
    titleAccent: "Management",
    label: "Enterprise",
    description: "Internal inventory tracking system with barcode scanning, stock alerts, supplier management, and comprehensive reporting for warehouse operations.",
    highlights: [
      { icon: Scan, title: "Barcode Scanning", desc: "Mobile and desktop support" },
      { icon: Shield, title: "Stock Alerts", desc: "Low inventory notifications" },
      { icon: Truck, title: "Supplier Portal", desc: "Order management and tracking" },
    ],
    tags: ["Vue.js", "FastAPI", "PostgreSQL", "WebSockets"],
    preview: {
      initials: "IM",
      name: "StockSync",
      subtitle: "Warehouse Hub",
      metrics: [
        { label: "Items Tracked", value: "2.4k", color: "text-primary" },
        { label: "Low Stock", value: "3", color: "text-accent" },
        { label: "Pending Orders", value: "7", color: "text-foreground" },
      ]
    },
    cta: "View Details",
  },
];

function FeaturedShowcase({ project }: { project: (typeof projects[0]) & { href?: string } }) {
  return (
    <div className="mb-12 relative rounded-lg overflow-visible">
      <GlowingEffect
        spread={60}
        glow={true}
        disabled={false}
        proximity={100}
        inactiveZone={0.01}
        borderWidth={2}
        variant="teal"
      />
      <div className="relative bg-gradient-to-br from-primary/5 via-background to-accent/5 border border-primary/20 rounded-lg p-6 md:p-10">
        <div className="absolute top-4 right-4">
          <Badge className="bg-primary/10 text-primary border-primary/20 uppercase tracking-widest text-[10px] font-bold">
            Featured
          </Badge>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary">{project.label}</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black mb-2 tracking-tight">
              {project.title} <span className="text-primary italic">{project.titleAccent}</span>
            </h2>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-xl font-black text-primary">From HK$7,500</span>
            </div>
            <p className="text-muted-foreground mb-5 leading-relaxed text-sm">
              {project.description}
            </p>
            
            <div className="space-y-2 mb-6">
              {project.highlights.map((highlight) => (
                <div key={highlight.title} className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <highlight.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span><strong>{highlight.title}</strong> — {highlight.desc}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 mb-5">
              {project.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
              ))}
            </div>

            {project.href ? (
              <a href={project.href} target="_blank" rel="noopener noreferrer">
                <Button className="border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-6 py-5 uppercase tracking-widest text-[10px] font-bold rounded-sm transition-all duration-300" data-testid="button-project-featured">
                  {project.cta}
                </Button>
              </a>
            ) : (
              <Link href="/contact">
                <Button className="border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-6 py-5 uppercase tracking-widest text-[10px] font-bold rounded-sm transition-all duration-300" data-testid="button-project-featured">
                  {project.cta}
                </Button>
              </Link>
            )}
          </div>
          
          <div className="relative hidden md:block">
            <div className="relative w-full h-72">
              <div className="absolute left-0 top-0 w-[55%] h-64 z-10 rounded-lg overflow-hidden shadow-2xl border border-primary/20 transform -rotate-2 hover:rotate-0 hover:scale-105 transition-all duration-300">
                <div className="w-full h-full bg-gradient-to-br from-teal-900/60 to-slate-800 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground text-center px-4">Therapist Website Design</span>
                </div>
              </div>
              <div className="absolute right-0 bottom-0 w-[55%] h-64 z-20 rounded-lg overflow-hidden shadow-2xl border border-primary/20 transform rotate-2 hover:rotate-0 hover:scale-105 transition-all duration-300">
                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-teal-900/60 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground text-center px-4">Full Page Preview</span>
                </div>
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-30">
                <Badge className="bg-primary text-primary-foreground uppercase tracking-widest text-[9px] font-bold shadow-lg">
                  100% Customizable
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project, index }: { project: typeof projects[0]; index: number }) {
  return (
    <div className="relative rounded-lg overflow-visible h-full">
      <GlowingEffect
        spread={40}
        glow={true}
        disabled={false}
        proximity={80}
        inactiveZone={0.01}
        borderWidth={2}
        variant="teal"
      />
      <div className="relative bg-gradient-to-br from-primary/5 via-background to-accent/5 border border-primary/20 rounded-lg p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-primary">{project.label}</span>
          </div>
          <Badge className="bg-primary/10 text-primary border-primary/20 uppercase tracking-widest text-[9px] font-bold">
            Template
          </Badge>
        </div>
        
        <h3 className="text-lg font-black mb-2 tracking-tight">
          {project.title} <span className="text-primary italic">{project.titleAccent}</span>
        </h3>
        <p className="text-muted-foreground mb-4 leading-relaxed text-xs flex-grow">
          {project.description}
        </p>
        
        <div className="space-y-1.5 mb-4">
          {project.highlights.slice(0, 2).map((highlight) => (
            <div key={highlight.title} className="flex items-center gap-2 text-xs">
              <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                <highlight.icon className="h-3 w-3 text-primary" />
              </div>
              <span className="font-medium">{highlight.title}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {project.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[9px]">{tag}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorkPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <NavBar items={navItems} />
      <nav className="py-6 px-8 flex justify-between items-center sticky top-0 bg-background/80 backdrop-blur-sm z-40">
        <Link href="/" className="flex items-center gap-2">
          <img 
            src={logoImage} 
            alt="JD CoreDev" 
            className="h-16 md:h-20 w-auto mix-blend-multiply dark:mix-blend-screen"
          />
        </Link>
        <div className="flex items-center gap-6">
          <ThemeToggle />
          <Link href="/auth">
            <Button 
              variant="outline" 
              className="font-black uppercase italic text-xs tracking-wider"
              data-testid="button-login"
            >
              Sign In
            </Button>
          </Link>
        </div>
      </nav>

      <main>
        <section className="py-16">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-accent font-black italic uppercase tracking-[0.3em] mb-4 text-sm block">// Portfolio</span>
              <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter uppercase italic">
                Our <span className="text-primary">Work</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Systems that run businesses and tools that people interact with — built across two tracks.
              </p>
            </div>

            {/* Creative AI track */}
            <div className="mb-10">
              <div className="flex items-center gap-3 mb-6">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-[0.25em] text-primary">Creative AI Tools</span>
                <div className="flex-1 h-px bg-primary/20" />
              </div>
              {creativeProjects.map((project) => (
                <FeaturedShowcase key={project.title} project={project} />
              ))}
            </div>

            {/* Systems & Platforms track */}
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-accent">Systems & Platforms</span>
              <div className="flex-1 h-px bg-accent/20" />
            </div>

            {/* Featured Therapist Template */}
            <FeaturedShowcase project={projects[0]} />

            {/* Other Projects Grid */}
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              {projects.slice(1).map((project, index) => (
                <ProjectCard key={project.title} project={project} index={index + 1} />
              ))}
            </div>

            <div className="relative rounded-lg overflow-visible">
              <GlowingEffect
                spread={60}
                glow={true}
                disabled={false}
                proximity={100}
                inactiveZone={0.01}
                borderWidth={2}
                variant="teal"
              />
              <div className="relative bg-gradient-to-br from-primary/5 via-background to-accent/5 border border-primary/20 rounded-lg p-8 md:p-12 text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary">Let's Build Together</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-black mb-4 tracking-tight">
                  Have a Project in <span className="text-primary italic">Mind?</span>
                </h2>
                <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                  We'd love to hear about it. Let's discuss how we can help bring your vision to life.
                </p>
                <Link href="/contact">
                  <Button 
                    className="border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground px-8 py-6 uppercase tracking-widest text-xs font-bold rounded-sm transition-all duration-300"
                    data-testid="button-start-conversation"
                  >
                    Start a Conversation
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-muted-foreground">
          {new Date().getFullYear()} JD CoreDev. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
