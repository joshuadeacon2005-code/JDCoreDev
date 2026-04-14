import React, { useState } from 'react';
import { InfiniteGrid } from '@/components/InfiniteGrid';
import jdLogo from '@/assets/jd-logo.png';
import {
  Utensils, Store, Sparkles, Stethoscope, Scale, Package,
  ArrowRight, Zap,
  ChefHat, CalendarCheck, ShoppingCart, Bell, TrendingUp,
  DollarSign, FileText, Wrench, Inbox,
} from 'lucide-react';

type BizType = 'Restaurant' | 'Retail' | 'Beauty' | 'Healthcare' | 'Services' | 'Ecommerce';

const TEAL = '#008080';

const bizTiles: { id: BizType; label: string; Icon: React.ElementType }[] = [
  { id: 'Restaurant',  label: 'Restaurant / Café',      Icon: Utensils },
  { id: 'Retail',      label: 'Retail Shop',            Icon: Store },
  { id: 'Beauty',      label: 'Beauty & Wellness',      Icon: Sparkles },
  { id: 'Healthcare',  label: 'Clinic / Healthcare',    Icon: Stethoscope },
  { id: 'Services',    label: 'Professional Services',  Icon: Scale },
  { id: 'Ecommerce',   label: 'E-commerce',             Icon: Package },
];

const examples: Record<BizType, { title: string; desc: string; saves: string; Icon: React.ElementType }[]> = {
  Restaurant: [
    { title: 'AI Order Routing',      desc: 'Routes takeout orders to the right kitchen section automatically.',        saves: '12 hrs/wk', Icon: ChefHat },
    { title: 'Smart Table Booking',   desc: 'Auto-allocates tables to maximise covers and reduce gaps.',                saves: '8 hrs/wk',  Icon: CalendarCheck },
    { title: 'Supplier Auto-reorder', desc: 'Monitors inventory and drafts purchase orders when stock is low.',         saves: '5 hrs/wk',  Icon: ShoppingCart },
  ],
  Retail: [
    { title: 'Stock Alert System',         desc: 'Predicts stockouts before they happen based on sales velocity.',                 saves: '10 hrs/wk', Icon: Bell },
    { title: 'Smart POS Dashboard',        desc: 'Consolidates multiple sales channels into one live view.',                       saves: '15 hrs/wk', Icon: TrendingUp },
    { title: 'Loyalty Automation',         desc: "Triggers personalised SMS offers to customers who haven't visited recently.",    saves: '6 hrs/wk',  Icon: Sparkles },
  ],
  Beauty: [
    { title: 'AI Appointment Scheduler', desc: 'Fills gaps in your calendar by messaging waitlisted clients automatically.',  saves: '14 hrs/wk', Icon: CalendarCheck },
    { title: 'No-show Prediction',       desc: 'Flags high-risk appointments and requests deposits automatically.',            saves: '8 hrs/wk',  Icon: Bell },
    { title: 'Client Rebooking Bot',     desc: 'Follows up with clients when they are due for their next treatment.',          saves: '7 hrs/wk',  Icon: Inbox },
  ],
  Healthcare: [
    { title: 'Patient Intake Form',        desc: 'Digitises onboarding and automatically updates patient records.',                      saves: '20 hrs/wk', Icon: FileText },
    { title: 'Appointment Reminders',      desc: 'Smart multi-channel reminders to drastically reduce missed appointments.',             saves: '10 hrs/wk', Icon: Bell },
    { title: 'Billing Automation',         desc: 'Generates and sends invoices instantly after consultations.',                           saves: '15 hrs/wk', Icon: DollarSign },
  ],
  Services: [
    { title: 'Client Onboarding Portal', desc: 'Automates data collection and document signing for new clients.', saves: '18 hrs/wk', Icon: Inbox },
    { title: 'Document Automation',      desc: 'Generates contracts and proposals from templates instantly.',      saves: '12 hrs/wk', Icon: FileText },
    { title: 'Invoice Tracker',          desc: 'Automatically chases late payments with polite, escalated reminders.', saves: '6 hrs/wk', Icon: DollarSign },
  ],
  Ecommerce: [
    { title: 'Inventory Sync',           desc: 'Keeps stock aligned across Shopify, Amazon, and warehouse.',                 saves: '15 hrs/wk', Icon: Package },
    { title: 'Return Flow Automation',   desc: 'Handles return requests, generates labels, and updates inventory.',           saves: '12 hrs/wk', Icon: Wrench },
    { title: 'Abandoned Cart Recovery',  desc: 'Sends personalised recovery sequences based on cart value.',                  saves: '8 hrs/wk',  Icon: ShoppingCart },
  ],
};

export function Dialogue() {
  const [selected, setSelected] = useState<BizType>('Restaurant');
  const exs = examples[selected];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }} className="min-h-screen bg-white text-black">

      {/* Nav */}
      <nav className="py-6 px-8 flex justify-between items-center sticky top-0 bg-white/80 backdrop-blur-sm z-40 border-b border-gray-200">
        <a href="#" className="flex items-center gap-2">
          <img src={jdLogo} alt="JD CoreDev" className="h-16 w-auto" style={{ mixBlendMode: 'multiply' }} />
        </a>
        <a href="#" className="text-[10px] font-bold uppercase tracking-[0.2em] border px-4 py-1.5 transition-colors" style={{ borderColor: TEAL, color: TEAL }}>
          Sign in
        </a>
      </nav>

      {/* Hero: two-column split inside InfiniteGrid */}
      <InfiniteGrid className="min-h-[85vh] bg-white" gridSize={40} speedX={0.15} speedY={0.15}>
      <div className="relative z-10 max-w-[1400px] mx-auto w-full flex flex-col md:flex-row border-b border-gray-200">

        {/* Left: selector */}
        <div className="flex-grow p-8 md:p-16 border-r border-gray-200">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-6 italic" style={{ color: TEAL }}>
            // Tell us about your business
          </p>
          <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tighter uppercase italic mb-4">
            Software built for<br />
            <span style={{ color: TEAL }}>how YOU work</span>
          </h1>
          <p className="text-gray-500 text-base max-w-lg mb-10 leading-relaxed">
            Pick your business type — see the exact AI systems we'd build for you. Every system is custom, not a template.
          </p>

          {/* Tile grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-200 border border-gray-200 mb-10">
            {bizTiles.map(({ id, label, Icon }) => {
              const active = selected === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className="flex flex-col items-center justify-center gap-2 py-6 px-4 text-center transition-colors"
                  style={{
                    background: active ? '#008080' : 'white',
                    color: active ? 'white' : '#666',
                  }}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-bold uppercase tracking-widest leading-tight">{label}</span>
                </button>
              );
            })}
          </div>

          {/* CTA */}
          <div className="flex gap-3 flex-wrap">
            <a
              href="#"
              className="inline-flex items-center gap-2 px-7 py-3 text-[11px] font-bold uppercase tracking-widest transition-colors"
              style={{ border: `1px solid ${TEAL}`, color: TEAL }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = TEAL; (e.currentTarget as HTMLAnchorElement).style.color = 'white'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.color = TEAL; }}
            >
              <Zap size={12} /> Get a free AI check
            </a>
            <a href="#" className="inline-flex items-center gap-2 px-7 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-black transition-colors">
              See our work <ArrowRight size={12} />
            </a>
          </div>
        </div>

        {/* Right: dynamic examples */}
        <aside className="w-full md:w-[480px] shrink-0 bg-gray-50">
          <div className="p-8 border-b border-gray-200">
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold italic mb-1" style={{ color: TEAL }}>
              // {bizTiles.find(b => b.id === selected)?.label}
            </p>
            <h2 className="text-xl font-black uppercase italic tracking-tighter">
              What we'd build for you
            </h2>
          </div>

          <div className="divide-y divide-gray-200">
            {exs.map(({ title, desc, saves, Icon }) => (
              <div key={title} className="p-8 bg-white hover:bg-gray-50 transition-colors">
                <Icon size={20} style={{ color: TEAL }} className="mb-3" />
                <h3 className="font-black text-sm uppercase italic tracking-tight mb-1">{title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed mb-3">{desc}</p>
                <span
                  className="inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5"
                  style={{ border: `1px solid ${TEAL}`, color: TEAL, fontFamily: 'JetBrains Mono, monospace' }}
                >
                  saves {saves}
                </span>
              </div>
            ))}
          </div>

          <div className="p-8 border-t border-gray-200">
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              These are examples — your system is built specifically around your business.
            </p>
            <a
              href="#"
              className="inline-flex items-center gap-2 w-full justify-center py-3 text-[11px] font-bold uppercase tracking-widest transition-colors text-white"
              style={{ background: TEAL }}
            >
              Book a free {selected} AI check <ArrowRight size={12} />
            </a>
          </div>
        </aside>
      </div>
      </InfiniteGrid>

      {/* Stats bar */}
      <div className="border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200">
          {[
            { stat: '10+ hrs', label: 'saved per week on average' },
            { stat: 'HK$7,500', label: 'entry price for custom systems' },
            { stat: '30 days', label: 'kickoff to live deployment' },
            { stat: '100%', label: 'custom-built, never a template' },
          ].map(({ stat, label }) => (
            <div key={label} className="p-8 bg-white text-center md:text-left">
              <p className="text-3xl md:text-4xl font-black italic tracking-tighter mb-1" style={{ fontFamily: 'JetBrains Mono, monospace', color: TEAL }}>
                {stat}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium leading-snug">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Why us */}
      <div className="border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-8 py-20">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold italic mb-4" style={{ color: TEAL }}>// Why it works</p>
          <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter mb-12">
            Not a SaaS. <span style={{ color: TEAL }}>Yours.</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200 border border-gray-200">
            {[
              { title: 'Built for you', desc: 'No forcing your process into rigid SaaS boxes. We build around how you already work.' },
              { title: 'Grows with you', desc: 'Own your data and platform. As your business scales, your system scales with it.' },
              { title: 'Actually affordable', desc: 'By leveraging modern AI coding tools we build enterprise-grade systems at a fraction of agency costs.' },
              { title: 'Local & reliable', desc: 'Hong Kong-based support. Your data is isolated, secure, and backed up automatically.' },
            ].map(({ title, desc }) => (
              <div key={title} className="p-10 bg-white">
                <h3 className="font-black text-lg uppercase italic tracking-tight mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA strip */}
      <div className="max-w-[1400px] mx-auto px-8 py-20 text-center">
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold italic mb-4" style={{ color: TEAL }}>// Ready when you are</p>
        <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-6">
          Let's build <span style={{ color: TEAL }}>yours.</span>
        </h2>
        <p className="text-gray-500 mb-8 max-w-lg mx-auto text-base leading-relaxed">
          Stop fighting software that doesn't fit. Tell us what you need — we'll show you exactly what we'd build.
        </p>
        <a
          href="#"
          className="inline-flex items-center gap-2 px-10 py-4 text-[11px] font-bold uppercase tracking-widest transition-colors text-white"
          style={{ background: TEAL }}
        >
          Start a project <ArrowRight size={12} />
        </a>
      </div>
    </div>
  );
}
