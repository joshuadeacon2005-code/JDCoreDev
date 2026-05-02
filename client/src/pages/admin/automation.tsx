import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Brain, TrendingUp, ArrowLeftRight, Bitcoin,
  Power, Zap, Clock, AlertTriangle, CheckCircle2,
  ExternalLink, RefreshCw, Radar, Play, Square,
} from "lucide-react";
import { Link } from "wouter";

const ENGINE_SECRET = "jdcd-engine-ai72shfgexau";

type ServiceId = "predictor" | "trader" | "arbitrage" | "crypto_arb";

interface ServiceDef {
  id: ServiceId;
  label: string;
  description: string;
  cadence: string;
  costLevel: "high" | "medium" | "low" | "routine";
  costNote: string;
  href: string;
  icon: React.ElementType;
  color: string;
  borderColor: string;
  iconBg: string;
  routineUrl?: string;   // when set, the card replaces the cron toggle with a "Manage routine" link
}

const SERVICES: ServiceDef[] = [
  {
    id: "predictor",
    label: "AI Predictor",
    description: "Researches political + financial events on Kalshi and Polymarket, runs a 4-agent council debate (analyst / contrarian / risk / judge), and places live bets when it finds high-confidence edge above the configured floor.",
    cadence: "Every 6h — Anthropic-hosted Claude routine",
    costLevel: "routine",
    costNote: "Runs on your Claude subscription quota — no metered API spend",
    href: "/admin/trader/predictions",
    icon: Brain,
    color: "text-purple-500",
    borderColor: "border-purple-500/20",
    iconBg: "bg-purple-500/10",
    routineUrl: "https://claude.ai/code/routines/trig_01Y8JJDwmLXCBmfzaUjBF9jN",
  },
  {
    id: "trader",
    label: "Claude Trader",
    description: "Swing-mode equities agent on Alpaca. Reads world state, runs WebSearch + 4-agent council, submits decisions through hard server-side guardrails (max 10 positions, 15% per position, 4% stop / 8% take, 10% 7-day drawdown).",
    cadence: "Twice daily M–F (12:00 + 22:00 UTC) — Anthropic-hosted Claude routine",
    costLevel: "routine",
    costNote: "Runs on your Claude subscription quota — no metered API spend",
    href: "/admin/trader",
    icon: TrendingUp,
    color: "text-teal-500",
    borderColor: "border-teal-500/20",
    iconBg: "bg-teal-500/10",
    routineUrl: "https://claude.ai/code/routines/trig_01RdmE8PHaQyfruhHQeheDDb",
  },
  {
    id: "arbitrage",
    label: "Arbitrage Scanner",
    description: "Scans Kalshi and Polymarket for the same event priced differently and flags profitable cross-platform arbitrage opportunities.",
    cadence: "Every 5 minutes",
    costLevel: "medium",
    costNote: "Market API polling only — no AI per cycle",
    href: "/admin/trader/arbitrage",
    icon: ArrowLeftRight,
    color: "text-amber-500",
    borderColor: "border-amber-500/20",
    iconBg: "bg-amber-500/10",
  },
  {
    id: "crypto_arb",
    label: "Crypto Arb",
    description: "Monitors crypto spot prices across exchanges for price discrepancies and calculates real-time arbitrage opportunities.",
    cadence: "Every 3 minutes",
    costLevel: "medium",
    costNote: "Exchange API polling — no AI per cycle",
    href: "/admin/trader/crypto-arb",
    icon: Bitcoin,
    color: "text-orange-500",
    borderColor: "border-orange-500/20",
    iconBg: "bg-orange-500/10",
  },
];

const costLevelConfig = {
  high:    { label: "High API cost",        cls: "border-red-500/30 text-red-500 bg-red-500/5" },
  medium:  { label: "Medium API cost",      cls: "border-amber-500/30 text-amber-500 bg-amber-500/5" },
  low:     { label: "Low API cost",         cls: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" },
  routine: { label: "Subscription quota",   cls: "border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/5" },
};

interface LeadEngineStatus {
  running: boolean;
  percent: number;
  stage: string;
}

export default function AutomationPage() {
  const [states, setStates]     = useState<Record<ServiceId, boolean>>({
    predictor: false, trader: false, arbitrage: false, crypto_arb: false,
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [leStatus, setLeStatus] = useState<LeadEngineStatus>({ running: false, percent: 0, stage: "" });
  const [leActing, setLeActing] = useState(false);
  const lePoller = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/automation");
      const d = await r.json();
      setStates({
        predictor:  d.predictor  === "true",
        trader:     d.trader     === "true",
        arbitrage:  d.arbitrage  === "true",
        crypto_arb: d.crypto_arb === "true",
      });
    } catch { toast({ title: "Could not load automation status", variant: "destructive" }); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const pollLeadEngine = useCallback(async () => {
    try {
      const r = await fetch("/api/lead-engine/progress", { headers: { "x-engine-secret": ENGINE_SECRET } });
      const d = await r.json();
      setLeStatus({ running: !!d.running, percent: d.percent ?? 0, stage: d.stage ?? "" });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    pollLeadEngine();
    lePoller.current = setInterval(pollLeadEngine, 5000);
    return () => { if (lePoller.current) clearInterval(lePoller.current); };
  }, [pollLeadEngine]);

  const runLeadEngine = async () => {
    setLeActing(true);
    try {
      await fetch("/api/lead-engine/run", { method: "POST", headers: { "x-engine-secret": ENGINE_SECRET, "Content-Type": "application/json" }, body: "{}" });
      toast({ title: "Lead Engine started", description: "Processing leads in the background." });
      setTimeout(pollLeadEngine, 1000);
    } catch { toast({ title: "Failed to start Lead Engine", variant: "destructive" }); }
    setLeActing(false);
  };

  const stopLeadEngine = async () => {
    setLeActing(true);
    try {
      await fetch("/api/lead-engine/stop", { method: "POST", headers: { "x-engine-secret": ENGINE_SECRET, "Content-Type": "application/json" }, body: "{}" });
      toast({ title: "Lead Engine stopped" });
      setTimeout(pollLeadEngine, 500);
    } catch { toast({ title: "Failed to stop Lead Engine", variant: "destructive" }); }
    setLeActing(false);
  };

  const toggle = async (id: ServiceId, val: boolean) => {
    setSaving(id);
    try {
      await fetch(`/api/automation/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: val }),
      });
      setStates(prev => ({ ...prev, [id]: val }));
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
    setSaving(null);
  };

  // Routine-driven services are scheduled at claude.ai and ignore cron_enabled
  // flags entirely — they're effectively always-on from this page's perspective.
  // Toggle/Kill operations only affect cron-driven services.
  const cronServices    = SERVICES.filter(s => !s.routineUrl);
  const routineServices = SERVICES.filter(s =>  s.routineUrl);

  const toggleAllCrons = async (val: boolean) => {
    setSaving("all");
    try {
      // Per-service PATCH so we don't flip cron flags for routine-driven services
      // (which would be silently ignored but is misleading state to write).
      await Promise.all(cronServices.map(s =>
        fetch(`/api/automation/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: val }),
        })
      ));
      setStates(prev => {
        const next = { ...prev };
        for (const s of cronServices) next[s.id] = val;
        return next;
      });
      toast({
        title: val ? "All cron services enabled" : "All cron services stopped",
        description: val
          ? "Routine-driven services (Trader, Predictor) are managed separately at claude.ai."
          : "Routine-driven services are still scheduled at claude.ai — pause them there if needed.",
      });
    } catch { toast({ title: "Failed to update all", variant: "destructive" }); }
    setSaving(null);
  };

  const cronStates    = cronServices.map(s => states[s.id]);
  const cronAnyOn     = cronStates.some(Boolean);
  const cronAllOff    = cronStates.every(v => !v);
  const cronAllOn     = cronStates.every(Boolean);

  const anyOn  = cronAnyOn || leStatus.running || routineServices.length > 0;
  const allOn  = cronAllOn && leStatus.running;
  const allOff = cronAllOff && !leStatus.running && routineServices.length === 0;

  // Routines count as always-active in the visual summary (their scheduling
  // lives at claude.ai; pausing here is impossible).
  const activeCount =
    cronStates.filter(Boolean).length +
    (leStatus.running ? 1 : 0) +
    routineServices.length;
  const totalCount = SERVICES.length + 1;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Zap className="h-6 w-6 text-teal-500" />
              Automation Control
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              All scheduled background processes — pause or resume them here
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 text-xs">
              <RefreshCw className={cn("h-3 w-3 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant={cronAllOff ? "default" : "destructive"}
              onClick={() => toggleAllCrons(cronAllOff ? true : false)}
              disabled={saving === "all" || cronServices.length === 0}
              className={cn("h-8 text-xs font-medium", cronAllOff && "bg-emerald-600 hover:bg-emerald-700")}
              data-testid="button-toggle-all"
              title="Affects cron-driven services only. Routine-driven services (Trader, Predictor) are scheduled at claude.ai."
            >
              <Power className="h-3.5 w-3.5 mr-1.5" />
              {saving === "all" ? "Updating…" : cronAllOff ? "Enable cron services" : "Stop cron services"}
            </Button>
          </div>
        </div>

        {/* Status summary strip */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg border text-sm",
          allOff  ? "border-muted bg-muted/30 text-muted-foreground"
          : anyOn ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
          : ""
        )}>
          {allOff ? (
            <><AlertTriangle className="h-4 w-4 shrink-0" /><span>All automations are currently <strong>paused</strong> — no background processes are running.</span></>
          ) : allOn ? (
            <><CheckCircle2 className="h-4 w-4 shrink-0" /><span>All {totalCount} automations are <strong>active</strong> and running.</span></>
          ) : (
            <><CheckCircle2 className="h-4 w-4 shrink-0 text-amber-500" /><span className="text-amber-600 dark:text-amber-400">
              <strong>{activeCount}</strong> of {totalCount} automations are currently active
              {routineServices.length > 0 && (
                <> — including <strong>{routineServices.length}</strong> Claude {routineServices.length === 1 ? "routine" : "routines"} (managed at claude.ai)</>
              )}.
            </span></>
          )}
        </div>

        {/* Cost warning if any high-cost are on */}
        {(SERVICES.filter(s => s.costLevel === "high" && states[s.id]).length > 0 || leStatus.running) && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>High-cost processes running:</strong>{" "}
              {[
                ...SERVICES.filter(s => s.costLevel === "high" && states[s.id]).map(s => s.label),
                ...(leStatus.running ? ["Lead Engine"] : []),
              ].join(", ")}.
              These make multiple AI API calls per cycle and can add up quickly.
            </span>
          </div>
        )}

        {/* Lead Engine card — manual run, no cron toggle */}
        <Card className="border border-teal-500/20">
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-500/10">
                  <Radar className="h-5 w-5 text-teal-500" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold leading-tight">Lead Engine</CardTitle>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Manual run</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 bg-amber-500/5">
                  High API cost
                </Badge>
                <Badge variant="outline" className={cn("text-[10px]", leStatus.running
                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                  : "border-muted text-muted-foreground"
                )}>
                  {leStatus.running ? "Running" : "Idle"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Researches target companies, generates personalised audit pages, and writes AI-powered outreach emails and DMs. Run manually when you want to process new leads.
            </p>
            {leStatus.running && (
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{leStatus.stage || "Processing…"}</span>
                  <span>{leStatus.percent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-teal-500 transition-all duration-500 rounded-full" style={{ width: `${leStatus.percent}%` }} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/70 italic">Claude API + web research per lead</span>
              <div className="flex items-center gap-2">
                {leStatus.running ? (
                  <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" onClick={stopLeadEngine} disabled={leActing}>
                    <Square className="h-2.5 w-2.5 mr-1" />Stop
                  </Button>
                ) : (
                  <Button size="sm" className="h-6 text-[10px] px-2 bg-teal-600 hover:bg-teal-700" onClick={runLeadEngine} disabled={leActing}>
                    <Play className="h-2.5 w-2.5 mr-1" />Run
                  </Button>
                )}
                <Link href="/admin/lead-engine">
                  <button className="flex items-center gap-1 text-[10px] text-teal-500 transition-colors hover:underline" data-testid="link-lead_engine">
                    Open page <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cron-scheduled service cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {SERVICES.map(svc => {
            const on = states[svc.id];
            const busy = saving === svc.id;
            const isRoutine = !!svc.routineUrl;
            return (
              <Card key={svc.id} className={cn("border transition-all", svc.borderColor, !on && !isRoutine && "opacity-70")}>
                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg", svc.iconBg)}>
                        <svc.icon className={cn("h-5 w-5", svc.color)} />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold leading-tight">{svc.label}</CardTitle>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{svc.cadence}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={cn("text-[10px]", costLevelConfig[svc.costLevel].cls)}>
                        {costLevelConfig[svc.costLevel].label}
                      </Badge>
                      {svc.routineUrl ? (
                        <a
                          href={svc.routineUrl}
                          target="_blank"
                          rel="noreferrer"
                          data-testid={`manage-routine-${svc.id}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-muted",
                            "border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/5"
                          )}
                        >
                          Manage routine <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <button
                          onClick={() => toggle(svc.id, !on)}
                          disabled={busy}
                          data-testid={`toggle-${svc.id}`}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none",
                            on ? "bg-emerald-500" : "bg-muted-foreground/30",
                            busy && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                            on ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4 pt-0">
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{svc.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/70 italic">{svc.costNote}</span>
                    <Link href={svc.href}>
                      <button className={cn("flex items-center gap-1 text-[10px] transition-colors hover:underline", svc.color)}
                        data-testid={`link-${svc.id}`}>
                        Open page <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground text-center pb-2">
          Changes take effect immediately. The next scheduled run will respect the new state.
        </p>
      </div>
    </AdminLayout>
  );
}
