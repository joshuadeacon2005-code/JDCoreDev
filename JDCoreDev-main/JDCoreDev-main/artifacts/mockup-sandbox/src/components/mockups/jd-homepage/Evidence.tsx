import { useState } from "react";
import { InfiniteGrid } from '@/components/InfiniteGrid';
import jdLogo from '@/assets/jd-logo.png';
import {
  ArrowRight,
  XCircle,
  BarChart3,
  CalendarClock,
  MailOpen,
  Package,
  Users,
  FileText,
  Bot,
  Zap,
  Sparkles,
  Fingerprint,
  Pencil,
  Cpu,
  Settings,
  Shield,
  Check,
  Globe,
} from "lucide-react";

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

const aiExamples = [
  { icon: CalendarClock, title: "A booking system that fills itself", description: "Automatically chases no-shows, fills last-minute gaps, and suggests upsells at the right moment." },
  { icon: MailOpen, title: "Email that routes itself", description: "AI reads incoming enquiries and sends them to the right person — no more forwarding chains." },
  { icon: Package, title: "Stock that reorders itself", description: "Predicts when you're running low and triggers the reorder before you run out." },
  { icon: Users, title: "A CRM that writes itself", description: "Drafts follow-up messages and scores your leads so you always know who to call first." },
  { icon: Bot, title: "A chatbot that's actually you", description: "Trained on your business, not generic rubbish. Plugged straight into your site or WhatsApp." },
  { icon: FileText, title: "Quotes in seconds", description: "Pulls in job details, calculates costs, and spits out a branded PDF — no spreadsheet required." },
];

const serviceFeatures = [
  { title: "Fast & Reliable", icon: Zap, description: "Systems that don't slow you down. Optimised for speed so your team (and customers) stay happy." },
  { title: "AI Built In", icon: Sparkles, description: "Not bolted on as an afterthought. AI is woven into the system from the start — where it actually helps." },
  { title: "Secure by Default", icon: Fingerprint, description: "Your data is locked down properly. No cutting corners on security." },
  { title: "Looks the part", icon: Pencil, description: "Clean interfaces your team will actually want to use. No ugly off-the-shelf dashboards." },
  { title: "Your data, your way", icon: Cpu, description: "Full control over your codebase and your data. No vendor lock-in." },
  { title: "We stay involved", icon: Settings, description: "Not a one-and-done build. We maintain, update, and improve things as your business grows." },
];

const hostingFeatures = [
  "Professional cloud hosting with 99.9% uptime",
  "Automatic SSL and security updates",
  "Performance monitoring included",
  "Custom domain setup handled for you",
  "Infrastructure that scales as you grow",
];

export function Evidence() {
  const [urlInput, setUrlInput] = useState("");

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "#ffffff", color: "#0a0a0a", fontFamily: "Inter, sans-serif" }}
    >
      {/* Nav */}
      <nav
        className="py-6 px-8 flex justify-between items-center sticky top-0 z-40 border-b"
        style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)", borderColor: "rgba(0,0,0,0.07)" }}
      >
        <a href="#" className="flex items-center gap-2">
          <img src={jdLogo} alt="JD CoreDev" className="h-16 w-auto" style={{ mixBlendMode: 'multiply' }} />
        </a>
        <div className="flex items-center gap-6">
          <button
            style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(0,0,0,0.45)" }}
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* Hero — InfiniteGrid with white background */}
      <InfiniteGrid
        className="min-h-[85vh]"
        gridSize={40}
        speedX={0.15}
        speedY={0.15}
        style={{ background: "#ffffff" } as React.CSSProperties}
      >
        <div className="relative z-10 max-w-[1400px] w-full mx-auto flex flex-col md:flex-row border-b" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
          <div className="flex-grow flex flex-col justify-center items-center text-center p-8 md:p-20 md:border-r" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
            {/* Pill label */}
            <div
              className="inline-block px-4 py-1 mb-8"
              style={{ border: "1px solid #008080", color: "#008080", fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}
            >
              Backed by data · 50+ HK businesses audited
            </div>

            <h1
              className="max-w-3xl mb-6"
              style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.04em", textTransform: "uppercase", fontStyle: "italic" }}
            >
              We audited 50+ HK businesses.{" "}
              <span style={{ color: "#008080" }}>Here's the verdict.</span>
            </h1>

            <p style={{ color: "rgba(0,0,0,0.55)", fontSize: "1.1rem", maxWidth: "36rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              Most are losing 10+ hours a week to tasks a system could handle. We build the system — fast, affordable, built for your business.
            </p>

            {/* URL hook */}
            <p style={{ fontSize: "0.65rem", color: "rgba(0,0,0,0.45)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 500 }}>
              Drop your URL — we'll show you exactly where AI could save you time and money
            </p>
            <form className="flex w-full max-w-md gap-2 mb-8">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="yoursite.com or your business name"
                className="flex-1 px-4 py-2 text-sm rounded-none outline-none"
                style={{ border: "1px solid rgba(0,0,0,0.15)", background: "rgba(0,0,0,0.03)", color: "#0a0a0a", fontSize: "0.875rem" }}
              />
              <button
                type="submit"
                style={{
                  border: "1px solid #008080", color: "#008080", background: "transparent",
                  padding: "0 1.25rem", fontSize: "0.65rem", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                Free AI check
              </button>
            </form>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                style={{
                  border: "1px solid #008080", color: "#008080", background: "transparent",
                  padding: "1rem 2rem", fontSize: "0.65rem", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = "#008080"; (e.target as HTMLButtonElement).style.color = "#fff"; }}
                onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = "transparent"; (e.target as HTMLButtonElement).style.color = "#008080"; }}
              >
                Start a project
              </button>
              <button
                style={{
                  background: "rgba(0,128,128,0.08)", color: "#008080",
                  padding: "1rem 2rem", fontSize: "0.65rem", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer",
                  border: "none", transition: "all 0.2s",
                }}
              >
                See our work
              </button>
            </div>
          </div>

          {/* Sidebar — demo audit card in the hero */}
          <aside className="w-full md:w-[420px] shrink-0 p-8 flex flex-col justify-center" style={{ background: "rgba(0,0,0,0.02)", borderLeft: "1px solid rgba(0,0,0,0.07)" }}>

            <div style={{ border: "1px solid rgba(0,128,128,0.25)", background: "rgba(0,128,128,0.03)", padding: "1.5rem" }}>
              {/* Card header */}
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h3 style={{ fontWeight: 900, fontSize: "1rem" }}>BC Detailing HK</h3>
                  <p style={{ fontSize: "0.65rem", color: "rgba(0,0,0,0.45)", marginTop: 2 }}>Automotive Detailing Studio</p>
                </div>
                <span style={{ fontSize: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", border: "1px solid rgba(0,0,0,0.12)", padding: "0.2rem 0.5rem", color: "rgba(0,0,0,0.35)", fontFamily: "monospace" }}>
                  DEMO REPORT
                </span>
              </div>

              {/* Score ring */}
              <div className="flex items-center gap-4 mb-5 p-3" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.07)" }}>
                <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                  <svg style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }} viewBox="0 0 36 36">
                    <path stroke="rgba(0,0,0,0.1)" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path stroke="#f59e0b" strokeWidth="3" strokeDasharray="38, 100" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.9rem", fontWeight: 900, fontFamily: "monospace" }}>38</span>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 3 }}>Overall Digital Score</p>
                  <p style={{ color: "#f59e0b", fontWeight: 700, fontSize: "0.75rem" }}>Below average — action required</p>
                </div>
              </div>

              {/* Score bars */}
              <div className="mb-5" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Website", score: "2/10", pct: 20, color: "#ef4444" },
                  { label: "Social Media", score: "6/10", pct: 60, color: "#f59e0b" },
                  { label: "Booking System", score: "0/10", pct: 3, color: "#ef4444" },
                  { label: "Infrastructure", score: "3/10", pct: 30, color: "#ef4444" },
                ].map((row) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.65rem" }}>
                    <span style={{ width: 100, color: "rgba(0,0,0,0.45)", flexShrink: 0 }}>{row.label}</span>
                    <div style={{ flex: 1, height: 5, background: "rgba(0,0,0,0.08)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${row.pct}%`, background: row.color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontFamily: "monospace", color: "rgba(0,0,0,0.4)", width: 28, textAlign: "right" }}>{row.score}</span>
                  </div>
                ))}
              </div>

              {/* Revenue gaps */}
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "1rem" }}>
                <p style={{ fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 900, color: "#ef4444", display: "flex", alignItems: "center", gap: 5, marginBottom: "0.6rem" }}>
                  <BarChart3 style={{ width: 10, height: 10 }} /> 4 revenue gaps identified
                </p>
                {auditGaps.map((g) => (
                  <div key={g.label} style={{ display: "flex", gap: 8, fontSize: "0.65rem", marginBottom: "0.5rem" }}>
                    <XCircle style={{ width: 12, height: 12, color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p style={{ fontWeight: 700 }}>{g.label}</p>
                      <p style={{ color: "rgba(0,0,0,0.45)" }}>{g.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              style={{
                marginTop: "1rem", width: "100%",
                border: "1px solid #008080", color: "#008080", background: "transparent",
                padding: "0.75rem", fontSize: "0.6rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s",
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.background = "#008080"; b.style.color = "#fff"; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = "transparent"; b.style.color = "#008080"; }}
            >
              Get your free audit <ArrowRight style={{ width: 11, height: 11 }} />
            </button>
          </aside>
        </div>
      </InfiniteGrid>

      {/* EVIDENCE SECTION */}
      <section className="py-20 border-t" style={{ borderColor: "rgba(0,0,0,0.07)", background: "#fafafa" }}>
        <div className="max-w-[1400px] mx-auto px-8">
          <div className="mb-14">
            <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.3em", fontWeight: 900, color: "#008080", marginBottom: "1rem", fontStyle: "italic" }}>
              // What we found
            </p>
            <h2
              style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", fontStyle: "italic", lineHeight: 1.1, maxWidth: "42rem" }}
            >
              We audited 50+ HK businesses.{" "}
              <span style={{ color: "#008080" }}>Here's the verdict.</span>
            </h2>
            <p style={{ color: "rgba(0,0,0,0.55)", fontSize: "1.05rem", marginTop: "1rem", maxWidth: "38rem", lineHeight: 1.6 }}>
              Most are losing 10+ hours/week to tasks a system could handle. We build the system.
            </p>
          </div>

          {/* Stats grid — 3 columns, full width */}
          <div
            className="grid grid-cols-2 md:grid-cols-3"
            style={{ border: "1px solid rgba(0,0,0,0.1)", gap: "1px", background: "rgba(0,0,0,0.1)" }}
          >
            {auditStats.map((s) => (
              <div key={s.label} className="p-8" style={{ background: "#ffffff" }}>
                <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "#008080", marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>{s.stat}</div>
                <p style={{ fontSize: "0.7rem", color: "rgba(0,0,0,0.5)", fontWeight: 500, lineHeight: 1.5 }}>{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-6">
            <button
              style={{
                border: "1px solid #008080", color: "#008080", background: "transparent",
                padding: "0.85rem 2rem", fontSize: "0.65rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 8, transition: "all 0.2s",
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.background = "#008080"; b.style.color = "#fff"; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = "transparent"; b.style.color = "#008080"; }}
            >
              Get your free audit <ArrowRight style={{ width: 12, height: 12 }} />
            </button>
            <p style={{ fontSize: "0.7rem", color: "rgba(0,0,0,0.4)", fontWeight: 500 }}>
              Takes 5 minutes · No obligation
            </p>
          </div>
        </div>
      </section>

      {/* Real systems, real results */}
      <section className="py-16 md:py-24 border-t" style={{ borderColor: "rgba(0,0,0,0.07)", background: "#ffffff" }}>
        <div className="max-w-[1400px] mx-auto px-8">
          <div className="text-center mb-14">
            <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.3em", fontWeight: 900, color: "#008080", marginBottom: "1rem", fontStyle: "italic" }}>// What this looks like</p>
            <h2 style={{ fontSize: "clamp(2rem, 5vw, 3.75rem)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", fontStyle: "italic", lineHeight: 1.1 }}>
              Real systems, <span style={{ color: "#008080" }}>real results</span>
            </h2>
            <p style={{ color: "rgba(0,0,0,0.5)", marginTop: "1rem", fontSize: "1rem", maxWidth: "36rem", margin: "1rem auto 0" }}>
              Here's the kind of thing we build. Each one is custom to the business — not a SaaS subscription, not a template.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1px", border: "1px solid rgba(0,0,0,0.1)", background: "rgba(0,0,0,0.1)" }}>
            {aiExamples.map((ex) => (
              <div key={ex.title} className="p-8" style={{ background: "#ffffff", transition: "background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f5f5f5"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#ffffff"; }}
              >
                <ex.icon style={{ width: 26, height: 26, color: "#008080", marginBottom: 16 }} />
                <h3 style={{ fontWeight: 900, fontSize: "0.8rem", textTransform: "uppercase", fontStyle: "italic", letterSpacing: "-0.01em", marginBottom: 8 }}>{ex.title}</h3>
                <p style={{ fontSize: "0.8rem", color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}>{ex.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <button
              style={{
                border: "1px solid rgba(0,0,0,0.2)", color: "rgba(0,0,0,0.6)", background: "transparent",
                padding: "0.65rem 1.5rem", fontSize: "0.65rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 8, transition: "all 0.2s",
              }}
            >
              Tell us what you need <ArrowRight style={{ width: 11, height: 11 }} />
            </button>
          </div>
        </div>
      </section>

      {/* Fast. Smart. Yours — feature cards */}
      <section className="py-16 md:py-24 border-t" style={{ borderColor: "rgba(0,0,0,0.07)", background: "#fafafa" }}>
        <div className="max-w-[1400px] mx-auto px-8">
          <div className="text-center mb-14">
            <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.3em", fontWeight: 900, color: "#008080", marginBottom: "1rem", fontStyle: "italic" }}>// What you get</p>
            <h2 style={{ fontSize: "clamp(2rem, 5vw, 3.75rem)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", fontStyle: "italic", lineHeight: 1.1 }}>
              Fast. Smart. <span style={{ color: "#008080" }}>Yours.</span>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1px", border: "1px solid rgba(0,0,0,0.1)", background: "rgba(0,0,0,0.1)" }}>
            {serviceFeatures.map((f) => (
              <div key={f.title} className="p-8" style={{ background: "#ffffff" }}>
                <f.icon style={{ width: 22, height: 22, color: "#008080", marginBottom: 14 }} />
                <h3 style={{ fontWeight: 900, fontSize: "0.85rem", marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: "0.78rem", color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hosting */}
      <section className="border-t" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2">
          <div className="p-8 md:p-20 md:border-r" style={{ borderColor: "rgba(0,0,0,0.07)", background: "#ffffff" }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-8" style={{ background: "rgba(0,128,128,0.08)", color: "#008080", fontSize: "0.6rem", textTransform: "uppercase", fontWeight: 700 }}>
              <Shield style={{ width: 12, height: 12 }} /> Hosting Included
            </div>
            <h2 style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", fontWeight: 900, marginBottom: "1.5rem", lineHeight: 1.2 }}>
              We build it, <span style={{ color: "#008080" }}>we host it</span>
            </h2>
            <p style={{ color: "rgba(0,0,0,0.5)", marginBottom: "2rem", lineHeight: 1.7, fontSize: "0.9rem" }}>
              You don't need to manage servers or worry about deployment. We handle everything from launch to ongoing maintenance.
            </p>
            <ul style={{ marginBottom: "2rem" }}>
              {hostingFeatures.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem", fontWeight: 500, marginBottom: "0.85rem" }}>
                  <Check style={{ width: 14, height: 14, color: "#008080", flexShrink: 0 }} /> {f}
                </li>
              ))}
            </ul>
            <button
              style={{
                border: "1px solid #008080", color: "#008080", background: "transparent",
                padding: "0.85rem 2rem", fontSize: "0.65rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer", transition: "all 0.2s",
              }}
            >
              See all services
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#f5f5f5" }}>
            {[
              { icon: Globe, title: "Global", sub: "CDN delivery" },
              { icon: Shield, title: "Secure", sub: "SSL & monitoring" },
              { stat: "99.9%", title: "Uptime", sub: "Guaranteed" },
              { icon: Settings, title: "Managed", sub: "Full support" },
            ].map((item, i) => (
              <div key={i} className="p-8 flex flex-col justify-center items-center text-center"
                style={{
                  borderBottom: i < 2 ? "1px solid rgba(0,0,0,0.07)" : "none",
                  borderRight: i % 2 === 0 ? "1px solid rgba(0,0,0,0.07)" : "none",
                }}
              >
                {"stat" in item
                  ? <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#008080", marginBottom: 6 }}>{item.stat}</div>
                  : item.icon && <item.icon style={{ width: 32, height: 32, color: "#008080", marginBottom: 12 }} />
                }
                <p style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 900, marginBottom: 4 }}>{item.title}</p>
                <p style={{ fontSize: "0.6rem", color: "rgba(0,0,0,0.4)" }}>{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="border-t pt-20" style={{ borderColor: "rgba(0,0,0,0.07)", background: "#fafafa" }}>
        <div className="max-w-[1400px] mx-auto px-8 md:px-20 text-center mb-20">
          <h2 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 900, marginBottom: "1.5rem", textTransform: "uppercase", letterSpacing: "-0.04em" }}>
            What would <span style={{ color: "#008080" }}>your system</span> look like?
          </h2>
          <p style={{ color: "rgba(0,0,0,0.5)", maxWidth: "36rem", margin: "0 auto 3rem", fontSize: "0.95rem", lineHeight: 1.7 }}>
            Tell us what's a pain in your business right now. We'll tell you what we'd build — no commitment, no sales pitch.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              style={{
                border: "1px solid #008080", color: "#008080", background: "transparent",
                padding: "1rem 2rem", fontSize: "0.65rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer", transition: "all 0.2s",
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.background = "#008080"; b.style.color = "#fff"; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = "transparent"; b.style.color = "#008080"; }}
            >
              Let's talk
            </button>
            <button
              style={{
                background: "rgba(0,128,128,0.08)", color: "#008080",
                padding: "1rem 2rem", fontSize: "0.65rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer", border: "none",
              }}
            >
              Client portal
            </button>
          </div>
        </div>

        <div className="border-t py-8 px-8 md:px-20 text-center" style={{ borderColor: "rgba(0,0,0,0.07)", fontSize: "0.8rem", color: "rgba(0,0,0,0.4)" }}>
          {new Date().getFullYear()} JD CoreDev. All rights reserved.
        </div>
      </footer>

      {/* Sticky CTA */}
      <a
        href="/contact"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full shadow-lg"
        style={{ background: "#008080", color: "#fff", padding: "0.75rem 1.25rem", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", textDecoration: "none" }}
      >
        <Sparkles style={{ width: 14, height: 14 }} /> Free AI check
      </a>
    </div>
  );
}
