import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { TradingPageHeader, pnlColor } from "@/components/TradingPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bitcoin, Search, Users, Shield, Zap, Play, RefreshCw,
  AlertTriangle, CheckCircle2, Clock, DollarSign, ChevronDown,
  ChevronRight, TrendingUp, TrendingDown, BarChart2, Settings2,
  Activity, Cpu, Lock, BookOpen, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtHKT } from "@/lib/hkt";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtUSD = (n: any) =>
  typeof n === "number"
    ? (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
const fmtPct = (n: any) => typeof n !== "number" ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const fmtPrice = (n: number) => n >= 1000 ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const clrPnl = (n: number) => n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-500" : "text-muted-foreground";
const clrEdge = (pct: number) => pct >= 20 ? "text-emerald-600 dark:text-emerald-400" : pct >= 10 ? "text-amber-500" : "text-muted-foreground";

const COUNCIL_AGENTS = [
  { key: "analyst",      label: "Crypto Analyst",     Icon: Bitcoin,  color: "text-amber-500",                         bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
  { key: "volatility",   label: "Volatility Analyst",  Icon: Activity, color: "text-blue-500",                          bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
  { key: "hedge",        label: "Hedge Strategist",    Icon: Layers,   color: "text-purple-500",                        bg: "bg-purple-500/10",  border: "border-purple-500/20"  },
  { key: "risk_manager", label: "Risk Manager",        Icon: Shield,   color: "text-red-500",                           bg: "bg-red-500/10",     border: "border-red-500/20"     },
];

const STAGES = [
  { id: 1, name: "Fetch Data",      Icon: Search },
  { id: 2, name: "Fair Value Calc", Icon: BarChart2 },
  { id: 3, name: "Council Review",  Icon: Users },
  { id: 4, name: "Execution",       Icon: Zap },
];

const CRYPTO_COLORS: Record<string, string> = {
  BTC: "text-amber-500",
  ETH: "text-blue-500",
  SOL: "text-purple-500",
  XRP: "text-cyan-500",
  DOGE: "text-yellow-500",
};

// ── Top-level trader nav ──────────────────────────────────────────────────────

function StagePill({ status }: { status?: string }) {
  if (!status) return <span className="text-[10px] text-muted-foreground/40 font-mono">WAIT</span>;
  const cls: any = { done: "text-emerald-600 dark:text-emerald-400", running: "text-amber-500", error: "text-red-500" };
  return <span className={cn("text-[10px] font-mono font-bold uppercase", cls[status] || "text-muted-foreground")}>{status}</span>;
}

// ── Opportunity card ──────────────────────────────────────────────────────────

function OpportunityCard({ opp }: { opp: any }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = opp.strategy?.includes("BUY YES");
  return (
    <Card className="text-sm">
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px] font-bold", CRYPTO_COLORS[opp.crypto] || "text-muted-foreground")}>
              {opp.crypto}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px]", isBuy ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 text-amber-500")}>
              {isBuy ? "BUY YES" : "BUY NO"}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px] font-bold", clrEdge(opp.edgePct || opp.edge_pct))}>
              {(opp.edgePct || opp.edge_pct || 0).toFixed(1)}% edge
            </Badge>
            <span className="text-[10px] text-muted-foreground font-mono">{opp.ticker || opp.kalshi_ticker}</span>
          </div>
          <p className="text-xs text-foreground font-medium truncate">{opp.title || opp.kalshi_title}</p>
          <div className="flex gap-4 mt-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground">Spot: <span className="text-foreground font-mono">{fmtPrice(opp.spotPrice || opp.spot_price)}</span></span>
            <span className="text-[11px] text-muted-foreground">Threshold: <span className="text-foreground font-mono">{opp.direction} {fmtPrice(opp.threshold)}</span></span>
            <span className="text-[11px] text-muted-foreground">Kalshi: <span className="text-foreground font-mono">${(opp.yesAsk || opp.kalshi_price || 0).toFixed(2)}</span></span>
            <span className="text-[11px] text-muted-foreground">Fair: <span className={cn("font-mono", isBuy ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500")}>${(opp.fairValue || opp.fair_value || 0).toFixed(2)}</span></span>
            <span className="text-[11px] text-muted-foreground">Exp: <span className="text-foreground font-mono">{Math.round((opp.minutesToExpiry || opp.time_to_expiry_min || 0))} min</span></span>
          </div>
          {opp.strategy && <p className="text-[11px] text-muted-foreground mt-1.5 italic">{opp.strategy}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {opp.status && (
            <Badge variant="outline" className={cn("text-[10px]",
              opp.status === "approved" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
              opp.status === "rejected" ? "border-red-500/30 text-red-500" :
              "border-muted text-muted-foreground")}>
              {opp.status}
            </Badge>
          )}
          {opp.council_json && (
            <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {expanded && opp.council_json && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          {COUNCIL_AGENTS.map(agent => {
            const c = opp.council_json?.transcript?.[agent.key] || opp.council_json?.[agent.key];
            if (!c) return null;
            return (
              <div key={agent.key} className={cn("rounded-md border p-2.5 text-xs", agent.bg, agent.border)}>
                <div className="flex items-center gap-1.5 mb-1">
                  <agent.Icon className={cn("h-3.5 w-3.5", agent.color)} />
                  <span className={cn("font-semibold text-[11px]", agent.color)}>{agent.label}</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">{c.argument || c.recommendation || c.analysis || "—"}</p>
                {c.verdict && <p className={cn("mt-1 font-bold text-[11px]", c.verdict === "EXECUTE" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>Verdict: {c.verdict}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Execution card ────────────────────────────────────────────────────────────

function ExecutionCard({ ex }: { ex: any }) {
  return (
    <Card className="p-3 text-sm">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px]",
              ex.status === "settled" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
              ex.status === "failed" ? "border-red-500/30 text-red-500" :
              "border-amber-500/30 text-amber-500")}>
              {ex.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-mono">{ex.id}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
            <span className="text-[11px] text-muted-foreground">Kalshi: <span className="text-foreground font-mono">{ex.kalshi_side?.toUpperCase()} {ex.kalshi_contracts}c @ ${ex.kalshi_price?.toFixed(2)}</span></span>
            <span className="text-[11px] text-muted-foreground">Hedge: <span className="text-foreground font-mono">{ex.hedge_side?.toUpperCase()} {ex.hedge_qty} {ex.hedge_symbol}</span></span>
            <span className="text-[11px] text-muted-foreground">Cost: <span className="text-foreground font-mono">{fmtUSD(ex.total_cost)}</span></span>
            <span className="text-[11px] text-muted-foreground">Expected P&L: <span className={cn("font-mono", clrPnl(ex.expected_profit))}>{fmtUSD(ex.expected_profit)}</span></span>
            {ex.actual_pnl != null && <span className="text-[11px] text-muted-foreground">Actual P&L: <span className={cn("font-mono font-bold", clrPnl(ex.actual_pnl))}>{fmtUSD(ex.actual_pnl)}</span></span>}
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">{fmtHKT(ex.logged_at)}</span>
      </div>
    </Card>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ stats, spotPrices, spotLoading }: { stats: any; spotPrices: any; spotLoading: boolean }) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [stageStatus, setStageStatus] = useState<Record<string, string>>({});
  const [runLog, setRunLog] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<any>(null);

  const doScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const d = await fetch("/api/crypto-arb/scan", { method: "POST" }).then(r => r.json());
      setScanResult(d);
    } catch {}
    setScanning(false);
  };

  const doPipeline = async () => {
    setRunning(true);
    setStageStatus({});
    setRunLog([]);
    setRunResult(null);
    try {
      const d = await fetch("/api/crypto-arb/run", { method: "POST" }).then(r => r.json());
      setRunResult(d);
      const stages: Record<string, string> = {};
      (d.log || []).forEach((line: string) => {
        const m = line.match(/^S(\d+)\[(done|error|running)\]:/);
        if (m) stages[m[1]] = m[2];
      });
      setStageStatus(stages);
      setRunLog(d.log || []);
    } catch (e: any) {
      setRunLog(["Error: " + e.message]);
    }
    setRunning(false);
  };

  const prices = scanResult?.spot_prices || spotPrices || {};

  return (
    <div className="space-y-5">
      {/* Spot prices */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Live Spot Prices</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(spotLoading && !Object.keys(prices).length) ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="p-3 animate-pulse"><div className="h-8 bg-muted rounded" /></Card>
            ))
          ) : Object.keys(prices).length ? (
            Object.entries(prices).map(([sym, data]: [string, any]) => (
              <Card key={sym} className="p-3">
                <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-0.5", CRYPTO_COLORS[sym] || "text-muted-foreground")}>{sym}</p>
                <p className="text-base font-bold font-mono">{fmtPrice(data.price || data)}</p>
                {data.change24h != null && (
                  <p className={cn("text-[11px] font-mono", data.change24h >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                    {data.change24h >= 0 ? "▲" : "▼"} {Math.abs(data.change24h).toFixed(2)}%
                  </p>
                )}
              </Card>
            ))
          ) : (
            <Card className="col-span-full p-4 text-center text-muted-foreground text-sm">No spot prices — run a scan to fetch</Card>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Opportunities",  value: stats.total_opportunities ?? "—",   cls: "text-foreground" },
            { label: "Approved",       value: stats.approved ?? "—",               cls: "text-emerald-600 dark:text-emerald-400" },
            { label: "Executions",     value: stats.total_executions ?? "—",       cls: "text-blue-500" },
            { label: "Total P&L",      value: fmtUSD(stats.total_pnl),             cls: clrPnl(stats.total_pnl || 0) },
            { label: "Avg Edge",       value: stats.avg_edge != null ? `${stats.avg_edge.toFixed(1)}%` : "—", cls: "text-amber-500" },
          ].map(m => (
            <Card key={m.label} className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
              <p className={cn("text-lg font-bold font-mono", m.cls)}>{m.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={doScan} disabled={scanning} className="flex items-center gap-1.5">
          {scanning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Quick Scan
        </Button>
        <Button size="sm" onClick={doPipeline} disabled={running} className="flex items-center gap-1.5">
          {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run Full Pipeline
        </Button>
      </div>

      {/* Pipeline stages */}
      {(running || runLog.length > 0) && (
        <Card className="p-4">
          <p className="text-xs font-medium mb-3">Pipeline Status</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {STAGES.map(s => (
              <div key={s.id} className={cn("rounded-md border p-2.5 text-center",
                stageStatus[String(s.id)] === "done"    ? "border-emerald-500/30 bg-emerald-500/5"  :
                stageStatus[String(s.id)] === "running" ? "border-amber-500/30 bg-amber-500/5"     :
                stageStatus[String(s.id)] === "error"   ? "border-red-500/30 bg-red-500/5"          :
                "border-muted")}>
                <s.Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground mb-0.5">{s.name}</p>
                <StagePill status={stageStatus[String(s.id)]} />
              </div>
            ))}
          </div>
          {runLog.length > 0 && (
            <div className="font-mono text-[10px] bg-muted/40 rounded p-2.5 max-h-40 overflow-y-auto space-y-0.5">
              {runLog.map((line, i) => (
                <div key={i} className={cn(
                  line.includes("[error]") ? "text-red-400" :
                  line.includes("[done]") ? "text-emerald-500" :
                  "text-muted-foreground")}>{line}</div>
              ))}
            </div>
          )}
          {runResult && (
            <div className="mt-3 text-xs text-muted-foreground">
              {runResult.contracts !== undefined && <span className="mr-4">Contracts scanned: <span className="text-foreground font-medium">{runResult.contracts}</span></span>}
              {runResult.opportunities !== undefined && <span className="mr-4">Opportunities: <span className="text-foreground font-medium">{Array.isArray(runResult.opportunities) ? runResult.opportunities.length : runResult.opportunities}</span></span>}
              {runResult.executions !== undefined && <span>Executions: <span className="text-foreground font-medium">{Array.isArray(runResult.executions) ? runResult.executions.length : runResult.executions}</span></span>}
            </div>
          )}
        </Card>
      )}

      {/* Scan opportunities */}
      {scanResult && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              Scan Results — {scanResult.opportunities?.length || 0} opportunities from {scanResult.contracts_count} contracts
            </p>
          </div>
          {scanResult.opportunities?.length ? (
            <div className="space-y-2">
              {scanResult.opportunities.map((opp: any, i: number) => (
                <OpportunityCard key={i} opp={opp} />
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              No opportunities above minimum edge threshold
            </Card>
          )}
        </div>
      )}

      {/* Recent from stats */}
      {!scanResult && stats?.recent_opportunities?.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Recent Opportunities</p>
          <div className="space-y-2">
            {stats.recent_opportunities.slice(0, 5).map((opp: any) => (
              <OpportunityCard key={opp.id} opp={opp} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [subTab, setSubTab] = useState<"opportunities" | "executions" | "scans" | "logs">("opportunities");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (type: string) => {
    setLoading(true);
    setData([]);
    try {
      const d = await fetch(`/api/crypto-arb/history?type=${type}`).then(r => r.json());
      setData(Array.isArray(d) ? d : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(subTab); }, [subTab, load]);

  const SUB = [
    { id: "opportunities" as const, label: "Opportunities" },
    { id: "executions"   as const, label: "Executions" },
    { id: "scans"        as const, label: "Scans" },
    { id: "logs"         as const, label: "Logs" },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {SUB.map(s => (
          <button key={s.id} onClick={() => setSubTab(s.id)}
            className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors",
              subTab === s.id ? "border-border bg-muted text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
            {s.label}
          </button>
        ))}
      </div>

      {loading && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />)}</div>}

      {!loading && data.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground text-sm">No {subTab} recorded yet</Card>
      )}

      {!loading && subTab === "opportunities" && (
        <div className="space-y-2">
          {data.map((opp: any) => <OpportunityCard key={opp.id} opp={opp} />)}
        </div>
      )}

      {!loading && subTab === "executions" && (
        <div className="space-y-2">
          {data.map((ex: any) => <ExecutionCard key={ex.id} ex={ex} />)}
        </div>
      )}

      {!loading && subTab === "scans" && (
        <div className="space-y-2">
          {data.map((scan: any) => (
            <Card key={scan.id} className="p-3 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-mono">#{scan.id}</span>
                  <span className="text-xs">Contracts: <span className="font-mono text-foreground">{scan.contracts_scanned}</span></span>
                  <span className="text-xs">Opportunities: <span className={cn("font-mono", (scan.opportunities_found || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{scan.opportunities_found}</span></span>
                  <span className="text-xs">Approved: <span className="font-mono text-foreground">{scan.approved_count || 0}</span></span>
                  <span className="text-xs">Executed: <span className="font-mono text-foreground">{scan.executed_count || 0}</span></span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{fmtHKT(scan.logged_at)}</span>
              </div>
              {scan.error_message && <p className="mt-1.5 text-[11px] text-red-400 font-mono">{scan.error_message}</p>}
            </Card>
          ))}
        </div>
      )}

      {!loading && subTab === "logs" && (
        <div className="font-mono text-[10px] space-y-0.5">
          {data.map((log: any) => (
            <div key={log.id} className={cn("flex gap-2 py-0.5",
              log.type === "error" ? "text-red-400" :
              log.type === "warn"  ? "text-amber-500" :
              "text-muted-foreground")}>
              <span className="shrink-0 text-muted-foreground/50">{fmtHKT(log.logged_at)}</span>
              <span className={cn("shrink-0 uppercase font-bold w-10",
                log.type === "error" ? "text-red-400" :
                log.type === "warn"  ? "text-amber-500" :
                "text-emerald-500")}>{log.type}</span>
              <span className="flex-1">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({ settings, onUpdate }: { settings: any; onUpdate: (key: string, value: string) => void }) {
  const toggle = (key: string, current: string) => onUpdate(key, current === "true" ? "false" : "true");

  const ToggleRow = ({ label, desc, settingKey }: { label: string; desc: string; settingKey: string }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button onClick={() => toggle(settingKey, settings[settingKey])}
        className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0",
          settings[settingKey] === "true" ? "bg-primary" : "bg-muted border border-border")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
          settings[settingKey] === "true" ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </div>
  );

  const NumRow = ({ label, desc, settingKey, suffix }: { label: string; desc: string; settingKey: string; suffix?: string }) => {
    const [val, setVal] = useState(settings[settingKey] || "");
    useEffect(() => { setVal(settings[settingKey] || ""); }, [settings[settingKey]]);
    return (
      <div className="flex items-center justify-between py-3 border-b last:border-0 gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input value={val} onChange={e => setVal(e.target.value)} type="number"
            className="w-24 text-right text-sm font-mono bg-muted/50 border border-border rounded px-2 py-1 focus:outline-none focus:border-primary" />
          {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onUpdate(settingKey, val)}>Save</Button>
        </div>
      </div>
    );
  };

  const SelectRow = ({ label, desc, settingKey, options }: { label: string; desc: string; settingKey: string; options: { value: string; label: string }[] }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <select value={settings[settingKey] || ""} onChange={e => onUpdate(settingKey, e.target.value)}
        className="text-sm bg-muted/50 border border-border rounded px-2 py-1 focus:outline-none shrink-0">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-5 max-w-xl">
      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <CardTitle className="text-sm">Engine Settings</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          <ToggleRow label="Cron Enabled" desc="Run scans automatically every 3 minutes" settingKey="cron_enabled" />
          <ToggleRow label="Auto Execute" desc="Automatically execute approved opportunities" settingKey="auto_execute" />
          <ToggleRow label="Hedge Enabled" desc="Place offsetting spot trades on Alpaca" settingKey="hedge_enabled" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <CardTitle className="text-sm">Risk Parameters</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          <NumRow label="Min Edge %" desc="Minimum edge percentage to flag an opportunity" settingKey="min_edge_pct" suffix="%" />
          <NumRow label="Max Bet" desc="Maximum USD per opportunity" settingKey="max_bet_usd" suffix="USD" />
          <NumRow label="Max Concurrent" desc="Maximum open positions at any time" settingKey="max_concurrent" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <CardTitle className="text-sm">Mode</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          <SelectRow label="Kalshi Mode" desc="Demo uses paper trading; live uses real funds" settingKey="kalshi_mode"
            options={[{ value: "demo", label: "Demo (paper)" }, { value: "live", label: "Live (real funds)" }]} />
        </CardContent>
      </Card>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-amber-500">Risk Warning</p>
            <p>This engine places real trades on Kalshi and Alpaca when live mode and auto-execute are both enabled. Start with demo mode and review every opportunity manually before enabling auto-execution.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CryptoArbPage() {
  const [stats, setStats]             = useState<any>(null);
  const [spotPrices, setSpotPrices]   = useState<any>({});
  const [spotLoading, setSpotLoading] = useState(true);
  const [settings, setSettings]       = useState<any>({});
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<"overview" | "history" | "settings">("overview");
  const [kalshiPortfolio, setKalshiPortfolio] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [st, cfg, sp, kp] = await Promise.all([
        fetch("/api/crypto-arb/stats").then(r => r.json()),
        fetch("/api/crypto-arb/settings").then(r => r.json()),
        fetch("/api/crypto-arb/spot-prices").then(r => r.json()),
        fetch("/api/predictor/portfolio").then(r => r.json()),
      ]);
      setStats(st);
      setSettings(cfg);
      setSpotPrices(sp);
      setKalshiPortfolio(kp);
    } catch {}
    setLoading(false);
    setSpotLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const t = setInterval(loadData, 60_000);
    return () => clearInterval(t);
  }, [loadData]);

  const updateSetting = async (key: string, value: string) => {
    await fetch("/api/crypto-arb/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSettings((s: any) => ({ ...s, [key]: value }));
  };

  const PAGE_TABS = [
    { id: "overview"  as const, label: "Overview",  Icon: Cpu },
    { id: "history"   as const, label: "History",   Icon: BookOpen },
    { id: "settings"  as const, label: "Settings",  Icon: Settings2 },
  ];

  const kalshiAvail   = kalshiPortfolio?.available_usd ?? null;
  const kalshiAtStake = kalshiPortfolio?.total_at_stake_usd ?? null;
  const maxPayout     = kalshiPortfolio?.total_max_payout_usd ?? null;
  const capAllocated  = parseFloat(settings.max_bet_usd || "0");

  return (
    <AdminLayout>
      <div>

        <TradingPageHeader
          title="Claude Crypto Arb Engine"
          subtitle="Finds mispriced Kalshi crypto contracts and hedges with opposite Alpaca positions"
          icon={<Bitcoin className="h-6 w-6" />}
          accentClass="text-amber-500"
          loading={loading}
          balance={[
            { label: "Kalshi Balance",   value: kalshiAvail  != null ? `$${kalshiAvail.toFixed(2)}`  : "—", color: "purple" },
            { label: "Kalshi At Stake",  value: kalshiAtStake != null ? `$${kalshiAtStake.toFixed(2)}` : "—", color: "amber"  },
            { label: "Max Payout",       value: maxPayout    != null ? `$${maxPayout.toFixed(2)}`    : "—", color: "green"  },
            { label: "Max Bet / Trade",  value: capAllocated > 0 ? `$${capAllocated.toFixed(0)}`     : "—", color: "blue"   },
            { label: "Total P&L",        value: stats?.total_pnl != null ? (stats.total_pnl >= 0 ? "+$" : "-$") + Math.abs(stats.total_pnl).toFixed(2) : "—", color: pnlColor(stats?.total_pnl ?? 0) },
          ]}
          stats={[
            { label: "Opportunities",  value: String(stats?.total_opportunities ?? "—") },
            { label: "Approved",       value: String(stats?.approved ?? "—"),           color: "green" },
            { label: "Executions",     value: String(stats?.total_executions ?? "—"),   color: "blue"  },
            { label: "Avg Edge",       value: stats?.avg_edge != null ? `${stats.avg_edge.toFixed(1)}%` : "—", color: "amber" },
          ]}
          badges={<>
            {settings.kalshi_mode && (
              <Badge variant="outline" className={cn("text-[10px]",
                settings.kalshi_mode === "live" ? "border-red-500/30 text-red-500" : "border-muted text-muted-foreground")}>
                {settings.kalshi_mode === "live" ? "🔴 LIVE" : "DEMO"} Kalshi
              </Badge>
            )}
            {settings.cron_enabled === "true" && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">Cron — 3m</Badge>
            )}
            {settings.auto_execute === "true" && (
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500">Auto-Execute ON</Badge>
            )}
          </>}
        />

        <div className="flex gap-1 mb-5">
          {PAGE_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors",
                tab === t.id
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
              <t.Icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {tab === "overview" && (
              <OverviewTab stats={stats} spotPrices={spotPrices} spotLoading={spotLoading} />
            )}
            {tab === "history" && <HistoryTab />}
            {tab === "settings" && <SettingsTab settings={settings} onUpdate={updateSetting} />}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
