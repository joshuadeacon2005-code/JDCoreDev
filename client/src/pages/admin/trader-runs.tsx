import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtHKT } from "@/lib/hkt";
import {
  CheckCircle, XCircle, TrendingUp, TrendingDown, AlertTriangle,
  ChevronDown, ChevronRight, Clock, BarChart2, Zap, Shield, RefreshCw,
} from "lucide-react";

const usd = (n: any) => typeof n === "number"
  ? (n >= 0 ? "+" : "-") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : "—";
const pct = (n: any) => typeof n === "number" ? (n >= 0 ? "+" : "") + n.toFixed(2) + "%" : "—";
const clrCls = (n: any) => n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-500" : "text-muted-foreground";

const MODES = [
  { key: "all",       label: "All",       color: "#008080", bg: "bg-[#008080]/10",   border: "border-[#008080]/30",   text: "text-[#008080]"   },
  { key: "day",       label: "Day",       color: "#008080", bg: "bg-[#008080]/10",   border: "border-[#008080]/30",   text: "text-[#008080]"   },
  { key: "swing",     label: "Swing",     color: "#8b5cf6", bg: "bg-violet-500/10",  border: "border-violet-500/30",  text: "text-violet-500"  },
  { key: "portfolio", label: "Portfolio", color: "#16a34a", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" },
  { key: "crypto",    label: "Crypto",    color: "#f97316", bg: "bg-orange-500/10",  border: "border-orange-500/30",  text: "text-orange-500"  },
];
const modeOf = (k: string) => MODES.find(m => m.key === k) || MODES[0];

function ScoreBadge({ score, pass, color }: { score: number; pass: boolean; color: string }) {
  return (
    <div className="flex-shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center text-sm font-bold font-mono"
      style={{ borderColor: pass ? color : "hsl(var(--border))", color: pass ? color : "hsl(var(--muted-foreground))" }}>
      {score}
    </div>
  );
}

function RunCard({ run }: { run: any }) {
  const [expanded, setExpanded] = useState(false);
  const mc = modeOf(run.mode);
  const time = new Date(run.logged_at);
  const relTime = fmtHKT(time, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " HKT";

  const positions  = Array.isArray(run.positions)  ? run.positions  : [];
  const declined   = Array.isArray(run.declined)   ? run.declined   : [];
  const trades     = Array.isArray(run.trades)      ? run.trades     : [];
  const validation = run.validation || {};
  const analysis   = Array.isArray(run.analysis)   ? run.analysis   : [];
  const screened   = Array.isArray(run.screened)   ? run.screened   : [];

  const runPnl = trades.reduce((s: number, t: any) => s + (t.pnl != null ? parseFloat(t.pnl) : 0), 0);
  const hasPnl = trades.some((t: any) => t.pnl != null);

  // High-potential declined tickers: had a HOLD/SELL signal but looked promising
  const highRiskDeclined = declined.filter((d: any) => {
    const screen = d.screened;
    return screen && parseFloat(screen.score || 0) >= 60;
  });

  return (
    <Card className={cn("border transition-all", run.pass ? cn(mc.border, "bg-card") : "border-border/50 bg-muted/20")}>
      {/* ── Header row ── */}
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start gap-3">
          <ScoreBadge score={run.score} pass={run.pass} color={mc.color} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className={cn("text-[10px]", mc.border, mc.text)}>
                {run.mode}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px]",
                run.risk === "high" ? "border-red-500/30 text-red-500"
                : run.risk === "low"  ? "border-blue-500/30 text-blue-500"
                : "border-amber-500/30 text-amber-500")}>
                {run.risk || "medium"} risk
              </Badge>
              {run.pass ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle className="h-3 w-3" /> Executed · {positions.length} position{positions.length !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <XCircle className="h-3 w-3" /> Skipped
                </span>
              )}
              {hasPnl && (
                <span className={cn("text-[10px] font-mono font-medium", clrCls(runPnl))}>
                  {usd(runPnl)}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/50 ml-auto whitespace-nowrap flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />{relTime}
              </span>
            </div>

            {/* TER + thesis */}
            {run.ter && run.ter !== "N/A" && (
              <p className="text-[10px] font-mono text-muted-foreground/60 mb-0.5">TER: {run.ter}</p>
            )}
            {run.thesis && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{run.thesis}</p>
            )}

            {/* Quick position chips */}
            {positions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {positions.map((p: any, i: number) => (
                  <span key={i}
                    className={cn("text-[10px] px-1.5 py-0.5 rounded border font-mono", mc.border, mc.bg, mc.text)}>
                    {p.t} {p.alloc ? `${p.alloc}%` : ""}
                  </span>
                ))}
              </div>
            )}

            {/* Trades from this run (if any) */}
            {trades.length > 0 && !expanded && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {trades.map((t: any, i: number) => (
                  <span key={i} className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border font-mono",
                    t.side === "buy"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-red-500/30 bg-red-500/10 text-red-500"
                  )}>
                    {t.side === "buy" ? "↑" : "↓"} {t.symbol}
                    {t.notional ? ` $${parseFloat(t.notional).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : ""}
                    {t.pnl != null ? ` · ${usd(parseFloat(t.pnl))}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setExpanded(e => !e)}
            className="flex-shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors p-0.5">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* ── Expanded detail ── */}
        {expanded && (
          <div className="mt-4 space-y-4 pl-14">

            {/* Full thesis */}
            {run.thesis && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Market Thesis</p>
                <p className="text-sm text-foreground leading-relaxed">{run.thesis}</p>
              </div>
            )}

            {/* Positions built */}
            {positions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Positions Built
                </p>
                <div className="space-y-1.5">
                  {positions.map((p: any, i: number) => {
                    const a = analysis.find((x: any) => x.t === p.t);
                    const trade = trades.find((t: any) => t.symbol === p.t);
                    return (
                      <div key={i} className={cn("rounded-lg border p-2.5", mc.border, mc.bg)}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn("text-sm font-bold font-mono", mc.text)}>{p.t}</span>
                          <div className="flex items-center gap-2">
                            {p.alloc && <span className="text-[10px] text-muted-foreground">{p.alloc}% alloc</span>}
                            {p.notional && <span className="text-[10px] font-mono text-muted-foreground">${parseFloat(p.notional).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}
                            {p.er && <span className={cn("text-[10px] font-mono", p.er.startsWith("+") ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>{p.er} expected</span>}
                            {trade?.pnl != null && <span className={cn("text-[10px] font-mono font-medium", clrCls(parseFloat(trade.pnl)))}>{usd(parseFloat(trade.pnl))}</span>}
                          </div>
                        </div>
                        {p.why && <p className="text-[11px] text-muted-foreground">{p.why}</p>}
                        {a && (
                          <div className="flex gap-3 mt-1.5">
                            {a.bull && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex-1">↑ {a.bull}</p>}
                            {a.bear && <p className="text-[10px] text-red-500 flex-1">↓ {a.bear}</p>}
                          </div>
                        )}
                        {trade && trade.side === "buy" && (
                          <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                            Ordered {trade.status || "submitted"}{trade.notional ? ` · $${parseFloat(trade.notional).toFixed(2)} notional` : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Trades executed */}
            {trades.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <BarChart2 className="h-3 w-3" /> Orders ({trades.length})
                </p>
                <div className="space-y-1.5">
                  {trades.map((t: any, i: number) => (
                    <div key={i} className={cn("rounded-lg border p-2.5 flex items-center justify-between",
                      t.side === "buy"
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-red-500/30 bg-red-500/10"
                    )}>
                      <div className="flex items-center gap-2">
                        {t.side === "buy"
                          ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                        <span className="text-sm font-bold font-mono">{t.symbol}</span>
                        <Badge variant="outline" className={cn("text-[10px]",
                          t.side === "buy"
                            ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : "border-red-500/30 text-red-500")}>
                          {t.side}
                        </Badge>
                        {t.notional && <span className="text-[10px] text-muted-foreground font-mono">${parseFloat(t.notional).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}
                        {t.status && <span className="text-[10px] text-muted-foreground/60">{t.status}</span>}
                      </div>
                      <div className="text-right">
                        {t.pnl != null
                          ? <span className={cn("text-sm font-bold font-mono", clrCls(parseFloat(t.pnl)))}>{usd(parseFloat(t.pnl))}</span>
                          : <span className="text-[10px] text-muted-foreground/40">P&L pending</span>}
                        {t.rationale && <p className="text-[10px] text-muted-foreground/60 max-w-40 text-right">{t.rationale}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* High-potential declined opportunities */}
            {highRiskDeclined.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" /> Passed Over (scored ≥60, not selected)
                </p>
                <div className="space-y-1.5">
                  {highRiskDeclined.map((d: any, i: number) => (
                    <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">{d.t}</span>
                        <div className="flex items-center gap-2">
                          {d.screened?.score && (
                            <span className="text-[10px] text-muted-foreground">screen: {d.screened.score}</span>
                          )}
                          <Badge variant="outline" className={cn("text-[10px]",
                            d.v === "SELL" ? "border-red-500/30 text-red-500"
                            : "border-amber-500/30 text-amber-500")}>
                            {d.v || "HOLD"}
                          </Badge>
                        </div>
                      </div>
                      {d.note && <p className="text-[11px] text-muted-foreground">{d.note}</p>}
                      <div className="flex gap-3 mt-1">
                        {d.bull && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex-1">↑ {d.bull}</p>}
                        {d.bear && <p className="text-[10px] text-red-500 flex-1">↓ {d.bear}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Declined all (any that aren't in positions) */}
            {declined.length > 0 && declined.length !== highRiskDeclined.length && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Not Selected ({declined.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {declined.map((d: any, i: number) => (
                    <div key={i} className="rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px]">
                      <span className="font-mono font-medium">{d.t}</span>
                      {d.v && <span className="text-muted-foreground ml-1">· {d.v}</span>}
                      {d.screened?.score && <span className="text-muted-foreground/60 ml-1">({d.screened.score})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validation */}
            {(validation.strengths?.length > 0 || validation.warnings?.length > 0 || validation.suggestion) && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Validation
                </p>
                <div className="space-y-1">
                  {validation.strengths?.map((s: string, i: number) => (
                    <p key={i} className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-start gap-1">
                      <CheckCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />{s}
                    </p>
                  ))}
                  {validation.warnings?.map((w: string, i: number) => (
                    <p key={i} className="text-[11px] text-amber-500 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />{w}
                    </p>
                  ))}
                  {validation.suggestion && (
                    <p className="text-[11px] text-muted-foreground italic mt-1">{validation.suggestion}</p>
                  )}
                </div>
              </div>
            )}

            {/* All screened tickers */}
            {screened.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  All Screened ({screened.length} tickers)
                </p>
                <div className="flex flex-wrap gap-1">
                  {[...screened].sort((a: any, b: any) => parseFloat(b.score) - parseFloat(a.score)).map((s: any, i: number) => {
                    const inPositions = positions.some((p: any) => p.t === s.t);
                    return (
                      <span key={i} className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border font-mono",
                        inPositions ? cn(mc.border, mc.bg, mc.text) : "border-border/40 text-muted-foreground"
                      )}>
                        {s.t} {s.score}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModeStats({ runs }: { runs: any[] }) {
  const passed  = runs.filter(r => r.pass).length;
  const total   = runs.length;
  const tradesAll = runs.flatMap(r => r.trades || []);
  const closed    = tradesAll.filter(t => t.pnl != null);
  const totalPnl  = closed.reduce((s: number, t: any) => s + parseFloat(t.pnl), 0);
  const avgScore  = total ? runs.reduce((s: number, r: any) => s + parseFloat(r.score || 0), 0) / total : 0;

  const stats = [
    { label: "Runs",        value: total },
    { label: "Executed",    value: `${passed}/${total}` },
    { label: "Orders",      value: tradesAll.length },
    { label: "Avg Score",   value: avgScore.toFixed(0) },
    ...(closed.length > 0 ? [{ label: "Total P&L", value: usd(totalPnl), cls: clrCls(totalPnl) }] : []),
  ];

  return (
    <div className="flex gap-4 flex-wrap mb-5">
      {stats.map(s => (
        <div key={s.label} className="text-center">
          <p className={cn("text-sm font-bold font-mono", (s as any).cls || "text-foreground")}>{s.value}</p>
          <p className="text-[10px] text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function TraderRuns() {
  const [runs,       setRuns]       = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeMode, setActiveMode] = useState("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRuns = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    fetch(`/api/trader/run-summaries?limit=60&mode=${activeMode}`)
      .then(r => r.json())
      .then(d => {
        setRuns(Array.isArray(d) ? d : []);
        setLastUpdated(new Date());
        setLoading(false);
        setRefreshing(false);
      })
      .catch(() => { setLoading(false); setRefreshing(false); });
  }, [activeMode]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  useEffect(() => {
    intervalRef.current = setInterval(() => loadRuns(true), 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadRuns]);

  const modeKeys   = new Set(runs.map(r => r.mode).filter(Boolean));
  const visibleModes = MODES.filter(m => m.key === "all" || modeKeys.has(m.key) || runs.length === 0);

  const hasRuns    = runs.length > 0;
  const passedRuns = runs.filter(r => r.pass);
  const allTrades  = runs.flatMap(r => r.trades || []);
  const mc         = modeOf(activeMode);

  return (
    <AdminLayout>
      <div>

        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Claude Trader</p>
            <h1 className="text-2xl font-bold tracking-tight">Run Summaries</h1>
            {!loading && hasRuns && (
              <p className="text-sm text-muted-foreground mt-1">
                {runs.length} runs · {passedRuns.length} executed · {allTrades.length} orders placed
                {activeMode !== "all" && <> · <span className={mc.text}>{mc.label} mode</span></>}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" onClick={() => loadRuns(true)} disabled={refreshing || loading}
              className="flex items-center gap-1.5 text-xs mt-1">
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground/50">
                Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        {/* Mode tabs */}
        {!loading && (
          <div className="flex gap-1.5 flex-wrap mb-5">
            {MODES.filter(m => m.key === "all" || modeKeys.has(m.key)).map(m => (
              <button key={m.key} onClick={() => setActiveMode(m.key)}
                className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors font-medium",
                  activeMode === m.key
                    ? cn(m.border, m.bg, m.text)
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/60")}>
                {m.label}
                {m.key !== "all" && (
                  <span className="ml-1.5 text-[10px] opacity-60">
                    {runs.filter(r => r.mode === m.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : !hasRuns ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BarChart2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">No cron runs recorded yet</p>
              <p className="text-xs text-muted-foreground/60">Run summaries will appear here once the agent starts cycling.<br/>Detailed reasoning, positions, and declined stocks are captured from each run.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {hasRuns && <ModeStats runs={runs} />}
            {runs.map((run, i) => <RunCard key={run.id ?? i} run={run} />)}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
