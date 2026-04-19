import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { TradingPageHeader, pnlColor } from "@/components/TradingPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeftRight, Search, Users, Shield, Zap, Play, RefreshCw,
  AlertTriangle, CheckCircle2, Clock, DollarSign, ChevronDown,
  ChevronRight, Eye, TrendingUp, Lock, Scale, BookOpen, Flame,
  Activity, Link2, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtHKT } from "@/lib/hkt";

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtUSD = (n: any) => typeof n === "number" ? "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtPct = (n: any) => typeof n !== "number" ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const clrPnl = (n: any) => n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-500" : "text-muted-foreground";

const COUNCIL_AGENTS = [
  { key: "validator",    label: "Market Validator",    Icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { key: "liquidity",    label: "Liquidity Analyst",   Icon: Activity,     color: "text-blue-500",                         bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
  { key: "settlement",   label: "Settlement Risk",     Icon: Lock,         color: "text-amber-500",                        bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
  { key: "execution",    label: "Execution Strategist", Icon: Zap,         color: "text-purple-500",                       bg: "bg-purple-500/10",  border: "border-purple-500/20"  },
  { key: "risk_manager", label: "Risk Manager",         Icon: Shield,      color: "text-red-500",                          bg: "bg-red-500/10",     border: "border-red-500/20"     },
];

const STAGES = [
  { id: 1, name: "Fetch Markets",     icon: Search },
  { id: 2, name: "AI Market Matching", icon: Link2 },
  { id: 3, name: "Arb Detection",     icon: ArrowLeftRight },
  { id: 4, name: "Risk Council",      icon: Users },
  { id: 5, name: "Execution",         icon: Zap },
];

const STRATEGY_LABELS: Record<string, string> = {
  kalshi_yes_poly_no: "Kalshi YES + Poly NO",
  kalshi_no_poly_yes: "Kalshi NO + Poly YES",
  kalshi_internal: "Kalshi YES + NO",
  poly_internal: "Poly YES + NO",
};

// ── Sub-nav ─────────────────────────────────────────────────────────────────

function StagePill({ status }: { status?: string }) {
  if (!status) return <span className="text-[10px] text-muted-foreground/40 font-mono">WAIT</span>;
  const cls: any = { done: "text-emerald-600 dark:text-emerald-400", running: "text-amber-500", error: "text-red-500" };
  return <span className={cn("text-[10px] font-mono font-bold uppercase", cls[status] || "text-muted-foreground")}>{status}</span>;
}

// ── Council Viewer ──────────────────────────────────────────────────────────

function ArbCouncilViewer({ transcript }: { transcript: any }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!transcript) return null;

  return (
    <div className="space-y-2">
      {COUNCIL_AGENTS.map((agent) => {
        const data = transcript[agent.key];
        if (!data) return null;
        const isOpen = expanded === agent.key;
        const verdictColor = data.verdict?.includes("MATCH") || data.verdict?.includes("LIQUID") || data.verdict?.includes("LOW")
          ? "text-emerald-600 dark:text-emerald-400"
          : data.verdict?.includes("UNCERTAIN") || data.verdict?.includes("THIN") || data.verdict?.includes("MEDIUM")
          ? "text-amber-500"
          : "text-red-500";

        return (
          <div key={agent.key} className={cn("rounded-lg border p-3", agent.border, agent.bg)}>
            <button onClick={() => setExpanded(isOpen ? null : agent.key)} className="w-full flex items-center justify-between text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <agent.Icon className={cn("h-4 w-4", agent.color)} />
                <span className={cn("text-sm font-semibold", agent.color)}>{agent.label}</span>
                {data.verdict && (
                  <Badge variant="outline" className={cn("text-[10px]", agent.border, verdictColor)}>{data.verdict}</Badge>
                )}
                {data.confidence && (
                  <span className="text-[10px] text-muted-foreground">{data.confidence}</span>
                )}
              </div>
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {isOpen && (
              <div className="mt-3 space-y-2 text-xs">
                {data.reasoning && <p className="text-foreground/80 leading-relaxed">{data.reasoning}</p>}
                {data.resolution_analysis && <p className="text-foreground/80 leading-relaxed">{data.resolution_analysis}</p>}
                {data.recommendation && (
                  <p className="text-muted-foreground"><span className="font-medium text-foreground">Recommendation:</span> {data.recommendation}</p>
                )}
                {data.execution_plan && <p className="text-foreground/80 leading-relaxed">{data.execution_plan}</p>}
                {data.risks && (
                  <div className="space-y-0.5">
                    {data.risks.map((r: string, i: number) => (
                      <p key={i} className="text-amber-500 flex items-start gap-1.5">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" /> {r}
                      </p>
                    ))}
                  </div>
                )}
                {data.platform_risks && (
                  <div className="space-y-0.5">
                    {data.platform_risks.map((r: string, i: number) => (
                      <p key={i} className="text-amber-500 flex items-start gap-1.5">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" /> {r}
                      </p>
                    ))}
                  </div>
                )}
                {data.warnings && (
                  <div className="space-y-0.5">
                    {data.warnings.map((w: string, i: number) => (
                      <p key={i} className="text-red-500 flex items-start gap-1.5">
                        <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" /> {w}
                      </p>
                    ))}
                  </div>
                )}
                {data.kill_conditions && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Kill Conditions</p>
                    {data.kill_conditions.map((k: string, i: number) => (
                      <p key={i} className="text-red-500 text-[11px]">⚠ {k}</p>
                    ))}
                  </div>
                )}
                {/* Numeric stats */}
                <div className="flex gap-4 flex-wrap pt-1">
                  {data.max_safe_contracts != null && (
                    <div><p className="text-[10px] text-muted-foreground">Max Safe Size</p><p className="font-mono font-bold">{data.max_safe_contracts} contracts</p></div>
                  )}
                  {data.optimal_contracts != null && (
                    <div><p className="text-[10px] text-muted-foreground">Optimal Size</p><p className="font-mono font-bold">{data.optimal_contracts} contracts</p></div>
                  )}
                  {data.optimal_size != null && (
                    <div><p className="text-[10px] text-muted-foreground">Optimal Size</p><p className="font-mono font-bold">{data.optimal_size} contracts</p></div>
                  )}
                  {data.expected_slippage_pct != null && (
                    <div><p className="text-[10px] text-muted-foreground">Expected Slippage</p><p className="font-mono font-bold">{data.expected_slippage_pct}%</p></div>
                  )}
                  {data.days_to_settlement != null && (
                    <div><p className="text-[10px] text-muted-foreground">Settlement</p><p className="font-mono font-bold">{data.days_to_settlement}d</p></div>
                  )}
                  {data.final_roi_pct != null && (
                    <div><p className="text-[10px] text-muted-foreground">True ROI</p><p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{data.final_roi_pct.toFixed(2)}%</p></div>
                  )}
                  {data.true_roi_pct != null && (
                    <div><p className="text-[10px] text-muted-foreground">True ROI</p><p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{data.true_roi_pct.toFixed(2)}%</p></div>
                  )}
                  {data.max_position_usd != null && (
                    <div><p className="text-[10px] text-muted-foreground">Max Position</p><p className="font-mono font-bold">${data.max_position_usd.toFixed(2)}</p></div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Opportunity Card ────────────────────────────────────────────────────────

function OppCard({ opp, showCouncil = true }: { opp: any; showCouncil?: boolean }) {
  const [councilOpen, setCouncilOpen] = useState(false);
  const transcript = opp.council_json
    ? typeof opp.council_json === "string" ? JSON.parse(opp.council_json) : opp.council_json
    : null;

  const statusColor = opp.status === "approved" ? "border-emerald-500/30"
    : opp.status === "monitoring" ? "border-amber-500/30"
    : opp.status === "rejected" ? "border-red-500/30"
    : "border-border";

  return (
    <Card className={cn("border", statusColor)}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start gap-4">
          {/* ROI badge */}
          <div className="flex-shrink-0 w-14 h-14 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 flex flex-col items-center justify-center">
            <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{parseFloat(opp.roi_pct).toFixed(1)}</span>
            <span className="text-[8px] text-muted-foreground uppercase">% ROI</span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Strategy + status */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-500">
                <ArrowLeftRight className="h-2.5 w-2.5 mr-1" />
                {STRATEGY_LABELS[opp.best_strategy] || opp.best_strategy}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px]",
                opp.status === "approved" ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : opp.status === "monitoring" ? "border-amber-500/20 text-amber-500"
                : opp.status === "rejected" ? "border-red-500/20 text-red-500"
                : "border-muted text-muted-foreground")}>
                {opp.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                Match: {(parseFloat(opp.match_confidence) * 100).toFixed(0)}%
              </span>
            </div>

            {/* Market titles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
              <div className="p-2 rounded-md bg-muted/30 border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Kalshi</p>
                <p className="text-xs font-medium text-foreground leading-tight">{opp.kalshi_title}</p>
                <div className="flex gap-3 mt-1 text-[10px] font-mono text-muted-foreground">
                  <span>YES: <span className="text-emerald-600 dark:text-emerald-400">${parseFloat(opp.kalshi_yes_ask).toFixed(2)}</span></span>
                  <span>NO: <span className="text-red-500">${parseFloat(opp.kalshi_no_ask).toFixed(2)}</span></span>
                </div>
              </div>
              <div className="p-2 rounded-md bg-muted/30 border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Polymarket</p>
                <p className="text-xs font-medium text-foreground leading-tight">{opp.poly_title}</p>
                <div className="flex gap-3 mt-1 text-[10px] font-mono text-muted-foreground">
                  <span>YES: <span className="text-emerald-600 dark:text-emerald-400">${parseFloat(opp.poly_yes_ask).toFixed(2)}</span></span>
                  <span>NO: <span className="text-red-500">${parseFloat(opp.poly_no_ask).toFixed(2)}</span></span>
                </div>
              </div>
            </div>

            {/* Numbers */}
            <div className="flex gap-4 text-[10px] text-muted-foreground flex-wrap">
              <span>Combined: <span className="font-mono text-foreground">${parseFloat(opp.combined_cost).toFixed(4)}</span></span>
              <span>Gross: <span className="font-mono text-emerald-600 dark:text-emerald-400">${parseFloat(opp.gross_profit).toFixed(4)}</span></span>
              <span>Net: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">${parseFloat(opp.net_profit).toFixed(4)}</span>/contract</span>
              <span>{fmtHKT(new Date(opp.logged_at), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} HKT</span>
            </div>
          </div>
        </div>

        {/* Council */}
        {showCouncil && transcript && (
          <div className="mt-3">
            <button onClick={() => setCouncilOpen(!councilOpen)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <Users className="h-3 w-3" />
              {councilOpen ? "Hide" : "View"} Risk Council
              {councilOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {councilOpen && (
              <div className="mt-3 pt-3 border-t">
                <ArbCouncilViewer transcript={transcript} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function ArbitragePage() {
  const [stats, setStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stageStatus, setStageStatus] = useState<any>({});
  const [scanResults, setScanResults] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "opportunities" | "executions" | "matched" | "settings">("overview");
  const [kalshiPortfolio, setKalshiPortfolio] = useState<any>(null);
  const [polyBalance, setPolyBalance] = useState<any>(null);

  const loadStats = useCallback(async () => {
    try {
      const [s, cfg, kp, pb] = await Promise.all([
        fetch("/api/arbitrage/stats").then(r => r.json()),
        fetch("/api/arbitrage/settings").then(r => r.json()),
        fetch("/api/predictor/portfolio").then(r => r.json()),
        fetch("/api/predictor/poly-balance").then(r => r.json()),
      ]);
      setStats(s);
      setSettings(cfg);
      setKalshiPortfolio(kp);
      setPolyBalance(pb);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { const t = setInterval(loadStats, 15000); return () => clearInterval(t); }, [loadStats]);

  const runPipeline = async () => {
    setRunning(true); setStageStatus({});
    try {
      const r = await fetch("/api/arbitrage/run", { method: "POST" });
      const d = await r.json();
      if (d.log) {
        const parsed: any = {};
        for (const line of d.log) {
          const m = line.match(/S(\d)\[(\w+)\]: (.+)/);
          if (m) parsed[m[1]] = { status: m[2], log: m[3] };
        }
        setStageStatus(parsed);
      }
      await loadStats();
    } catch {}
    setRunning(false);
  };

  const quickScan = async () => {
    setScanning(true);
    try {
      const r = await fetch("/api/arbitrage/scan", { method: "POST" });
      setScanResults(await r.json());
    } catch {}
    setScanning(false);
  };

  const updateSetting = async (key: string, value: string) => {
    await fetch("/api/arbitrage/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSettings((s: any) => ({ ...s, [key]: value }));
  };

  const kalshiAvail    = kalshiPortfolio?.available_usd ?? null;
  const kalshiAtStake  = kalshiPortfolio?.total_at_stake_usd ?? null;
  const polyAvail      = polyBalance?.usdc_balance ?? null;
  const polyAtStake    = polyBalance?.at_stake ?? null;
  const totalCapital   = (kalshiAvail ?? 0) + (polyAvail ?? 0) + (kalshiAtStake ?? 0) + (polyAtStake ?? 0);
  const totalDeployed  = (kalshiAtStake ?? 0) + (polyAtStake ?? 0);

  return (
    <AdminLayout>
      <div>

        <TradingPageHeader
          title="Arb Engine"
          subtitle="Risk-free profit from price mismatches between Kalshi and Polymarket"
          icon={<ArrowLeftRight className="h-6 w-6" />}
          accentClass="text-teal-500"
          loading={loading}
          balance={[
            { label: "Kalshi Balance",    value: kalshiAvail  != null ? `$${kalshiAvail.toFixed(2)}`  : "—", color: "purple" },
            { label: "Kalshi At Stake",   value: kalshiAtStake != null ? `$${kalshiAtStake.toFixed(2)}` : "—", color: "amber"  },
            { label: "Polymarket USDC",   value: polyAvail    != null ? `$${polyAvail.toFixed(2)}`    : "—", color: "blue"   },
            { label: "Poly At Stake",     value: polyAtStake  != null ? `$${polyAtStake.toFixed(2)}`  : "—", color: "amber"  },
            { label: "Total Deployed",    value: totalDeployed > 0 ? `$${totalDeployed.toFixed(2)}` : "$0.00", color: totalDeployed > 0 ? "amber" : "default" },
            { label: "Lifetime P&L",      value: stats?.total_pnl != null ? (stats.total_pnl >= 0 ? "+$" : "-$") + Math.abs(stats.total_pnl).toFixed(2) : "—", color: pnlColor(stats?.total_pnl ?? 0) },
          ]}
          stats={[
            { label: "Matched Markets",  value: String(stats?.matched_markets ?? "—") },
            { label: "Opportunities",    value: String(stats?.total_opportunities ?? "—") },
            { label: "Approved",         value: String(stats?.approved ?? "—"),          color: "green" },
            { label: "Executions",       value: String(stats?.total_executions ?? "—"),  color: "blue" },
            { label: "Win Rate",         value: stats?.win_rate != null ? `${stats.win_rate.toFixed(0)}%` : "—", color: "green" },
            { label: "Avg ROI",          value: stats?.avg_roi  != null ? `${stats.avg_roi.toFixed(1)}%`  : "—", color: "green" },
          ]}
          badges={<>
            {settings.auto_execute === "true" && (
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500">Auto-Execute ON</Badge>
            )}
            {settings.cron_enabled === "true" && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">Cron — 5m</Badge>
            )}
          </>}
        />

        {/* Tabs */}
        <div className="flex gap-1 flex-wrap mb-5">
          {[
            { id: "overview" as const,      label: "Overview",       Icon: Eye },
            { id: "opportunities" as const, label: "Opportunities",  Icon: TrendingUp },
            { id: "executions" as const,    label: "Executions",     Icon: Zap },
            { id: "matched" as const,       label: "Matched Markets", Icon: Link2 },
            { id: "settings" as const,      label: "Settings",       Icon: Shield },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors",
                tab === t.id
                  ? "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
              <t.Icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Matched Markets", value: stats?.matched_markets ?? "—",       cls: "text-blue-500" },
                { label: "Opportunities",    value: stats?.total_opportunities ?? "—",   cls: "text-foreground" },
                { label: "Approved",         value: stats?.approved ?? "—",              cls: "text-emerald-600 dark:text-emerald-400" },
                { label: "Executions",       value: stats?.total_executions ?? "—",      cls: "text-purple-500" },
                { label: "Total P&L",        value: stats?.total_pnl != null ? fmtUSD(stats.total_pnl) : "—", cls: clrPnl(stats?.total_pnl || 0) },
                { label: "Avg ROI",          value: stats?.avg_roi != null ? `${stats.avg_roi.toFixed(1)}%` : "—", cls: "text-teal-500" },
              ].map(m => (
                <Card key={m.label} className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                  <p className={cn("text-lg font-bold font-mono", m.cls)}>{m.value}</p>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Pipeline */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-teal-500" />Arb Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="flex gap-2 mb-4">
                    <Button size="sm" variant="outline" onClick={runPipeline} disabled={running}
                      className="text-xs border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20">
                      {running ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Play className="h-3 w-3 mr-1.5" />}
                      {running ? "Running…" : "Full Pipeline"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={quickScan} disabled={scanning} className="text-xs">
                      {scanning ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Search className="h-3 w-3 mr-1.5" />}
                      Quick Scan
                    </Button>
                  </div>
                  <div className="space-y-0">
                    {STAGES.map((s, i) => {
                      const st = stageStatus[s.id];
                      return (
                        <div key={s.id} className={cn("flex items-center gap-3 py-2.5", i < STAGES.length - 1 ? "border-b border-border/50" : "")}>
                          <s.icon className={cn("h-3.5 w-3.5 flex-shrink-0",
                            st?.status === "done" ? "text-emerald-500" : st?.status === "running" ? "text-amber-500" : "text-muted-foreground/30")} />
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-xs font-medium", st?.status ? "text-foreground" : "text-muted-foreground")}>{s.name}</p>
                            {st?.log && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{st.log}</p>}
                          </div>
                          <StagePill status={st?.status} />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Config */}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Scale className="h-4 w-4 text-muted-foreground" />Quick Config
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Min Profit %</p>
                    <div className="flex gap-1">
                      {["0.5", "1.0", "1.5", "2.0", "3.0"].map(v => (
                        <button key={v} onClick={() => updateSetting("min_profit_pct", v)}
                          className={cn("text-[10px] px-2 py-1 rounded border transition-colors",
                            settings.min_profit_pct === v ? "border-teal-500/30 bg-teal-500/10 text-teal-500" : "border-border text-muted-foreground hover:text-foreground")}>
                          {v}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Max Bet</p>
                    <div className="flex gap-1">
                      {["25", "50", "100", "250"].map(v => (
                        <button key={v} onClick={() => updateSetting("max_bet_usd", v)}
                          className={cn("text-[10px] px-2 py-1 rounded border transition-colors",
                            settings.max_bet_usd === v ? "border-teal-500/30 bg-teal-500/10 text-teal-500" : "border-border text-muted-foreground hover:text-foreground")}>
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Auto-execute</span>
                    <button onClick={() => updateSetting("auto_execute", settings.auto_execute === "true" ? "false" : "true")}
                      className={cn("text-xs px-3 py-1 rounded-md border transition-colors",
                        settings.auto_execute === "true"
                          ? "border-red-500/30 bg-red-500/10 text-red-500"
                          : "border-border text-muted-foreground")}>
                      {settings.auto_execute === "true" ? "⚠ ON" : "OFF"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Auto-scan (5m)</span>
                    <button onClick={() => updateSetting("cron_enabled", settings.cron_enabled === "true" ? "false" : "true")}
                      className={cn("text-xs px-3 py-1 rounded-md border transition-colors",
                        settings.cron_enabled === "true"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-border text-muted-foreground")}>
                      {settings.cron_enabled === "true" ? "ON" : "OFF"}
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Scan results */}
            {scanResults && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Scan Results — {scanResults.matched_pairs} matched, {scanResults.opportunities?.length || 0} opportunities
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {scanResults.kalshi_count} Kalshi × {scanResults.poly_count} Polymarket markets scanned
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                  {!scanResults.opportunities?.length ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No arb opportunities above threshold right now. Prices are too efficient.</p>
                  ) : (
                    <div className="space-y-2">
                      {scanResults.opportunities.slice(0, 10).map((opp: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-teal-500/20 bg-teal-500/5">
                          <div className="flex-shrink-0 w-12 h-12 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex flex-col items-center justify-center">
                            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">{opp.roi_pct.toFixed(1)}</span>
                            <span className="text-[7px] text-muted-foreground">%ROI</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-500">
                                {STRATEGY_LABELS[opp.strategy] || opp.strategy}
                              </Badge>
                            </div>
                            <p className="text-xs text-foreground truncate">{opp.kalshi.title}</p>
                            <div className="flex gap-3 text-[10px] font-mono text-muted-foreground mt-0.5">
                              <span>Cost: ${opp.combined_cost.toFixed(4)}</span>
                              <span className="text-emerald-600 dark:text-emerald-400">Profit: ${opp.net_profit.toFixed(4)}/ct</span>
                              <span>Match: {(opp.match_confidence * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recent opportunities */}
            {stats?.recent_opportunities?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-3">Recent Opportunities</p>
                <div className="space-y-3">
                  {stats.recent_opportunities.slice(0, 5).map((opp: any) => (
                    <OppCard key={opp.id} opp={opp} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OPPORTUNITIES ── */}
        {tab === "opportunities" && <OpportunitiesTab />}

        {/* ── EXECUTIONS ── */}
        {tab === "executions" && <ExecutionsTab />}

        {/* ── MATCHED MARKETS ── */}
        {tab === "matched" && <MatchedMarketsTab />}

        {/* ── SETTINGS ── */}
        {tab === "settings" && <SettingsTab settings={settings} onUpdate={updateSetting} />}
      </div>
    </AdminLayout>
  );
}

// ── Sub-tabs ────────────────────────────────────────────────────────────────

function OpportunitiesTab() {
  const [opps, setOpps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/arbitrage/history?type=opportunities").then(r => r.json()).then(d => { setOpps(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  if (!opps.length) return <p className="text-sm text-muted-foreground py-8 text-center">No opportunities detected yet. Run a scan to get started.</p>;
  return <div className="space-y-3">{opps.map((o: any) => <OppCard key={o.id} opp={o} />)}</div>;
}

function ExecutionsTab() {
  const [execs, setExecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/arbitrage/history?type=executions").then(r => r.json()).then(d => { setExecs(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  if (!execs.length) return <p className="text-sm text-muted-foreground py-8 text-center">No executions yet.</p>;
  return (
    <div className="space-y-3">
      {execs.map((e: any) => (
        <Card key={e.id}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] border-teal-500/20 text-teal-500">{e.id}</Badge>
              <Badge variant="outline" className={cn("text-[10px]",
                e.status === "settled" ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/20 text-amber-500")}>
                {e.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 rounded-md bg-muted/30 border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase">Leg A: {e.leg_a_platform}</p>
                <p className="text-xs font-mono">{e.leg_a_side?.toUpperCase()} @ ${parseFloat(e.leg_a_price).toFixed(2)} × {e.leg_a_contracts}</p>
              </div>
              <div className="p-2 rounded-md bg-muted/30 border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase">Leg B: {e.leg_b_platform}</p>
                <p className="text-xs font-mono">{e.leg_b_side?.toUpperCase()} @ ${parseFloat(e.leg_b_price).toFixed(2)} × {e.leg_b_contracts}</p>
              </div>
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
              <span>Cost: {fmtUSD(parseFloat(e.total_cost))}</span>
              <span>Expected: <span className="text-emerald-600 dark:text-emerald-400">{fmtUSD(parseFloat(e.expected_profit))}</span></span>
              {e.actual_pnl != null && <span className={cn("font-bold", clrPnl(parseFloat(e.actual_pnl)))}>Actual: {fmtUSD(parseFloat(e.actual_pnl))}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MatchedMarketsTab() {
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/arbitrage/matched-markets").then(r => r.json()).then(d => { setMarkets(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  if (!markets.length) return <p className="text-sm text-muted-foreground py-8 text-center">No matched markets yet. Run a scan to discover cross-platform pairs.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">{markets.length} active market pairs being monitored</p>
      {markets.map((m: any) => (
        <Card key={m.id} className="border">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="h-3.5 w-3.5 text-blue-500" />
              <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-500">
                {(m.match_confidence * 100).toFixed(0)}% match
              </Badge>
              <span className="text-[10px] text-muted-foreground">{m.match_method}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Kalshi</p>
                <p className="text-xs font-medium">{m.kalshi_title}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{m.kalshi_ticker}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Polymarket</p>
                <p className="text-xs font-medium">{m.poly_title}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{m.poly_slug}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SettingsTab({ settings, onUpdate }: { settings: any; onUpdate: (k: string, v: string) => void }) {
  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Arbitrage Parameters</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-4">
          {[
            { key: "min_profit_pct",  label: "Min Profit % (after fees)",   desc: "Ignore opportunities below this ROI" },
            { key: "max_bet_usd",     label: "Max Position (USD)",          desc: "Maximum USD per arb position" },
            { key: "max_concurrent",  label: "Max Concurrent Positions",    desc: "Limit simultaneous open arbs" },
            { key: "scan_interval_min", label: "Scan Interval (minutes)",   desc: "How often to scan for opportunities" },
          ].map(s => (
            <div key={s.key}>
              <p className="text-xs font-medium mb-0.5">{s.label}</p>
              <p className="text-[10px] text-muted-foreground mb-1.5">{s.desc}</p>
              <input type="text" value={settings[s.key] || ""} onChange={e => onUpdate(s.key, e.target.value)}
                className="w-full text-xs px-3 py-1.5 rounded-md border border-border bg-background font-mono" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Platform Credentials</CardTitle>
          <CardDescription className="text-xs">Set in Replit Secrets (env vars)</CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Kalshi (already configured via Predictor)</p>
            <p><span className="font-mono text-foreground">KALSHI_EMAIL_DEMO</span> / <span className="font-mono text-foreground">KALSHI_PASSWORD_DEMO</span></p>
            <Separator className="my-3" />
            <p className="font-medium text-foreground">Polymarket (for execution — optional for scanning)</p>
            <p><span className="font-mono text-foreground">POLY_PRIVATE_KEY</span> — Wallet private key for Polygon</p>
            <p><span className="font-mono text-foreground">POLY_FUNDER</span> — Wallet address</p>
            <p className="text-amber-500 text-[10px] mt-2">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              Scanning works without credentials. Execution on Polymarket requires a funded Polygon wallet.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Risk Council Agents</CardTitle>
          <CardDescription className="text-xs">5 AI agents review every opportunity before execution</CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="space-y-2">
            {COUNCIL_AGENTS.map(a => (
              <div key={a.key} className="flex items-center gap-2 text-xs">
                <a.Icon className={cn("h-4 w-4", a.color)} />
                <span className="font-medium">{a.label}</span>
                <span className="text-muted-foreground">—</span>
                <span className="text-muted-foreground">
                  {a.key === "validator" && "Verifies markets resolve identically"}
                  {a.key === "liquidity" && "Checks orderbook depth and slippage"}
                  {a.key === "settlement" && "Assesses platform and resolution risk"}
                  {a.key === "execution" && "Optimises leg ordering and position size"}
                  {a.key === "risk_manager" && "Final verdict: EXECUTE, PASS, or MONITOR"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
