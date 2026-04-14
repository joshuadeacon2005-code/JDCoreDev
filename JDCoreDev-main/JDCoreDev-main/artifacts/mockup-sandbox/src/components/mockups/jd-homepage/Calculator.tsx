import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  ArrowDown,
  Calculator as CalculatorIcon,
  ChefHat,
  Store,
  Scissors,
  Stethoscope,
  Briefcase,
  ShoppingCart,
  Calendar,
  Bell,
  BarChart3,
  Users,
  FileText,
  CreditCard,
  MapPin,
  Clock,
  ShieldCheck,
  Package,
  RefreshCw,
  Mail,
  MessageSquare,
  FileCheck,
  TrendingUp,
} from "lucide-react";

type BusinessType =
  | "Restaurant"
  | "Retail"
  | "Beauty"
  | "Healthcare"
  | "Professional"
  | "E-commerce";

interface BusinessConfig {
  id: BusinessType;
  icon: React.ReactNode;
  multiplier: number;
  volumeLabel: string;
  examples: Array<{
    title: string;
    description: string;
    icon: React.ReactNode;
  }>;
}

const BUSINESS_CONFIGS: Record<BusinessType, BusinessConfig> = {
  Restaurant: {
    id: "Restaurant",
    icon: <ChefHat className="w-4 h-4 mr-2" />,
    multiplier: 0.12,
    volumeLabel: "Monthly orders",
    examples: [
      {
        title: "Order routing automation",
        description: "Auto-routes orders to kitchen stations",
        icon: <RefreshCw className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Smart booking",
        description: "Fills your tables without phone calls",
        icon: <Calendar className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Supplier alerts",
        description: "Auto-reorder when stock is low",
        icon: <Bell className="w-6 h-6 text-[#008080]" />,
      },
    ],
  },
  Retail: {
    id: "Retail",
    icon: <Store className="w-4 h-4 mr-2" />,
    multiplier: 0.08,
    volumeLabel: "Monthly customers",
    examples: [
      {
        title: "Stock dashboard",
        description: "Live inventory across all channels",
        icon: <BarChart3 className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Customer loyalty bot",
        description: "Rewards regulars automatically",
        icon: <Users className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "POS sync",
        description: "One source of truth for sales + stock",
        icon: <RefreshCw className="w-6 h-6 text-[#008080]" />,
      },
    ],
  },
  Beauty: {
    id: "Beauty",
    icon: <Scissors className="w-4 h-4 mr-2" />,
    multiplier: 0.15,
    volumeLabel: "Monthly appointments",
    examples: [
      {
        title: "Booking system",
        description: "Zero manual scheduling, zero no-shows",
        icon: <Calendar className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Client rebooking bot",
        description: "Brings clients back before they drift away",
        icon: <MessageSquare className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Revenue tracker",
        description: "See your busiest hours and best clients",
        icon: <TrendingUp className="w-6 h-6 text-[#008080]" />,
      },
    ],
  },
  Healthcare: {
    id: "Healthcare",
    icon: <Stethoscope className="w-4 h-4 mr-2" />,
    multiplier: 0.2,
    volumeLabel: "Monthly patients",
    examples: [
      {
        title: "Patient intake",
        description: "Digital forms, pre-filled, no paper",
        icon: <FileText className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Appointment reminders",
        description: "Cuts no-shows by 60%",
        icon: <Bell className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Billing automation",
        description: "Auto-generate invoices from appointment records",
        icon: <CreditCard className="w-6 h-6 text-[#008080]" />,
      },
    ],
  },
  Professional: {
    id: "Professional",
    icon: <Briefcase className="w-4 h-4 mr-2" />,
    multiplier: 0.25,
    volumeLabel: "Monthly clients",
    examples: [
      {
        title: "Client portal",
        description: "Clients upload docs, check status, pay invoices",
        icon: <Users className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Proposal generator",
        description: "AI drafts scopes from your notes",
        icon: <FileCheck className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Invoice chaser",
        description: "Auto follow-up on overdue payments",
        icon: <Mail className="w-6 h-6 text-[#008080]" />,
      },
    ],
  },
  "E-commerce": {
    id: "E-commerce",
    icon: <ShoppingCart className="w-4 h-4 mr-2" />,
    multiplier: 0.06,
    volumeLabel: "Monthly orders",
    examples: [
      {
        title: "Inventory sync",
        description: "Stock levels update across all platforms",
        icon: <Package className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Return flow",
        description: "Auto-process returns without your team",
        icon: <RefreshCw className="w-6 h-6 text-[#008080]" />,
      },
      {
        title: "Cart recovery",
        description: "AI emails abandoned carts within 15 min",
        icon: <Mail className="w-6 h-6 text-[#008080]" />,
      },
    ],
  },
};

export function Calculator() {
  const [businessType, setBusinessType] = useState<BusinessType>("Restaurant");
  const [volume, setVolume] = useState<number>(150);

  const config = BUSINESS_CONFIGS[businessType];

  const hoursLostPerMonth = Math.round(volume * config.multiplier);
  const hoursLostPerYear = hoursLostPerMonth * 12;
  const costPerYear = hoursLostPerYear * 200;

  const monthlyCost = hoursLostPerMonth * 200;
  const paybackPeriod = monthlyCost > 0 ? Math.max(1, Math.ceil(7500 / monthlyCost)) : "∞";

  return (
    <div className="min-h-screen bg-[#080808] text-white font-sans selection:bg-[#008080]/30 selection:text-white pb-24">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#080808]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#008080] rounded flex items-center justify-center font-bold text-white">
              JD
            </div>
            <span className="font-semibold tracking-tight text-lg">JD CoreDev</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-[#888]">
            <a href="#" className="hover:text-white transition-colors">Services</a>
            <a href="#" className="hover:text-white transition-colors">Work</a>
            <a href="#" className="hover:text-white transition-colors">About</a>
          </div>
          <button className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-lg transition-colors border border-white/10">
            Talk to us
          </button>
        </div>
      </nav>

      <main className="pt-32">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-6 pt-12 pb-20">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 text-[#008080] font-mono text-sm mb-6 bg-[#008080]/10 px-4 py-2 rounded-full border border-[#008080]/20">
              <CalculatorIcon className="w-4 h-4" />
              <span>// How much is manual work costing you?</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-white">
              Find out in <span className="text-[#008080]">30 seconds.</span>
            </h1>
            <p className="text-xl text-[#888] max-w-2xl mx-auto">
              Pick your business type and tell us one number.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Calculator Widget */}
            <div className="bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="mb-8">
                <label className="block text-sm font-medium text-[#888] mb-4 uppercase tracking-wider">
                  1. Select your business type
                </label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(BUSINESS_CONFIGS) as BusinessType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setBusinessType(type)}
                      className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                        businessType === type
                          ? "bg-[#008080] text-white shadow-lg shadow-[#008080]/20"
                          : "bg-white/5 text-[#888] hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {BUSINESS_CONFIGS[type].icon}
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#888] mb-6 uppercase tracking-wider flex justify-between items-end">
                  <span>2. {config.volumeLabel}</span>
                  <span className="text-white font-mono text-lg bg-white/5 px-3 py-1 rounded">
                    {volume}
                  </span>
                </label>
                <div className="relative mb-8">
                  <input
                    type="number"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value) || 0)}
                    className="w-full bg-[#080808] border border-white/10 rounded-xl py-6 px-6 text-4xl font-mono text-center text-white focus:outline-none focus:ring-2 focus:ring-[#008080] focus:border-transparent transition-all"
                  />
                </div>
                <div className="px-2">
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="10"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full accent-[#008080] h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-[#888] mt-3 font-mono">
                    <span>10</span>
                    <span>1000+</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Output Panel */}
            <div className="bg-[#0a1a0a] border border-[#008080]/30 rounded-2xl p-8 lg:p-10 shadow-[0_0_40px_rgba(0,128,128,0.1)] h-full flex flex-col justify-center">
              <div className="mb-8">
                <p className="text-[#888] text-sm uppercase tracking-wider mb-2">
                  Your business loses approximately:
                </p>
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-5xl font-black text-[#008080] font-mono tracking-tight">
                    ~{hoursLostPerMonth} hrs
                  </span>
                  <span className="text-white/60 font-medium">/ month</span>
                </div>
                <p className="text-[#888] text-sm font-mono">
                  That's {hoursLostPerYear} hours/year
                </p>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-[#008080]/0 via-[#008080]/30 to-[#008080]/0 my-6"></div>

              <div className="mb-8">
                <p className="text-[#888] text-sm uppercase tracking-wider mb-2">
                  At HK$200/hour, that's:
                </p>
                <div className="text-4xl font-black text-amber-400 font-mono tracking-tight mb-2">
                  HK${costPerYear.toLocaleString()} <span className="text-xl text-amber-400/60 font-medium">/ year</span>
                </div>
                <p className="text-[#888] text-sm">
                  in productivity your team could spend on actual work.
                </p>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-[#008080]/0 via-[#008080]/30 to-[#008080]/0 my-6"></div>

              <div>
                <p className="text-[#888] text-sm uppercase tracking-wider mb-2">
                  A custom AI system starts at:
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-black text-[#008080] font-mono">
                    HK$7,500
                  </span>
                  <span className="text-[#888] text-sm bg-[#008080]/10 px-3 py-1.5 rounded-full border border-[#008080]/20">
                    Payback period: ~{paybackPeriod} month{paybackPeriod !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6">
            <button className="w-full sm:w-auto px-8 py-4 bg-[#008080] hover:bg-[#006666] text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(0,128,128,0.3)] hover:shadow-[0_0_30px_rgba(0,128,128,0.5)] hover:-translate-y-1">
              See what we'd build for {businessType.toLowerCase()}s
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                document.getElementById('examples')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="group text-[#888] hover:text-white flex items-center gap-2 text-sm font-medium transition-colors"
            >
              Or see example systems
              <ArrowDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
            </button>
          </div>
          <p className="text-center text-[#555] text-sm mt-6">
            No obligation. No jargon. 30-minute call.
          </p>
        </section>

        {/* Examples Section */}
        <section id="examples" className="py-24 bg-[#0c0c0c] border-y border-white/5">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                What we'd build for your <span className="text-[#008080]">{businessType.toLowerCase()}</span>
              </h2>
              <p className="text-[#888] max-w-2xl mx-auto text-lg">
                Stop paying humans to do robot work. Here's how we automate your specific workflows.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {config.examples.map((example, idx) => (
                <div
                  key={idx}
                  className="bg-[#111] border border-white/10 rounded-2xl p-8 hover:border-[#008080]/50 transition-all group"
                >
                  <div className="w-14 h-14 bg-[#008080]/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {example.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white group-hover:text-[#008080] transition-colors">
                    {example.title}
                  </h3>
                  <p className="text-[#888] leading-relaxed">
                    {example.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-32 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#008080]/10 blur-[120px] rounded-full pointer-events-none"></div>
          
          <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold mb-8">Still not sure? Talk to us.</h2>
            <p className="text-xl text-[#888] mb-10 max-w-2xl mx-auto">
              We'll look at your business and tell you exactly what you can automate. If we can't save you time, we'll tell you.
            </p>
            <button className="px-10 py-5 bg-white text-black hover:bg-gray-200 rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-xl mb-16">
              Book your 30-minute call
            </button>

            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 pt-12 border-t border-white/10">
              <div className="flex items-center gap-3 text-[#888]">
                <MapPin className="w-5 h-5 text-[#008080]" />
                <span className="font-medium">Based in Hong Kong</span>
              </div>
              <div className="flex items-center gap-3 text-[#888]">
                <ShieldCheck className="w-5 h-5 text-[#008080]" />
                <span className="font-medium">From HK$7,500</span>
              </div>
              <div className="flex items-center gap-3 text-[#888]">
                <Clock className="w-5 h-5 text-[#008080]" />
                <span className="font-medium">Built in ~30 days</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-6 text-center text-[#555] text-sm">
          <p>© {new Date().getFullYear()} JD CoreDev. Software that actually works for you.</p>
        </div>
      </footer>
    </div>
  );
}
