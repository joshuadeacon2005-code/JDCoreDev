import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { TraderLayout } from "@/components/TraderLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtHKTDate } from "@/lib/hkt";
import {
  RefreshCw, Search, TrendingUp, TrendingDown, Building2, Users,
  Activity, Zap, ArrowUpRight, ArrowDownRight, Minus, MessageSquare,
  BarChart2, AlertTriangle, ExternalLink, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";

const PARTY_COLOR: Record<string, string> = {
  democrat:    "text-blue-500",
  republican:  "text-red-500",
  independent: "text-purple-500",
};

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return fmtHKTDate(dt, { month:"short", day:"numeric", year:"2-digit" });
}

function fmtChange(v: number | undefined) {
  if (v == null) return null;
  const pos = v >= 0;
  return (
    <span className={cn("font-mono text-xs font-semibold", pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
      {pos ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function SentimentBadge({ s }: { s: string | null }) {
  if (!s) return <span className="text-[10px] text-muted-foreground">—</span>;
  const bull = s.toLowerCase() === "bullish";
  const bear = s.toLowerCase() === "bearish";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium",
      bull ? "text-emerald-600 dark:text-emerald-400" : bear ? "text-red-500" : "text-muted-foreground")}>
      {bull ? <ArrowUpRight className="h-3 w-3"/> : bear ? <ArrowDownRight className="h-3 w-3"/> : <Minus className="h-3 w-3"/>}
      {s}
    </span>
  );
}

function StockSparkline({ ticker, positive }: { ticker: string; positive: boolean }) {
  const [bars, setBars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/trader/stock-bars/${ticker}?limit=30&timeframe=1Day`)
      .then(r => r.json())
      .then(d => { setBars(d.bars || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ticker]);

  if (loading) return (
    <div className="h-20 flex items-center justify-center">
      <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground/40" />
    </div>
  );

  if (!bars.length) return (
    <div className="h-20 flex items-center justify-center">
      <p className="text-[10px] text-muted-foreground">No chart data — Alpaca not connected</p>
    </div>
  );

  const open  = bars[0].o;
  const close = bars[bars.length - 1].c;
  const up    = close >= open;
  const color = up ? "#10b981" : "#ef4444";
  const data  = bars.map(b => ({ t: new Date(b.t).toLocaleDateString("en-US", { month: "short", day: "numeric" }), c: b.c }));
  const min   = Math.min(...data.map(d => d.c));
  const max   = Math.max(...data.map(d => d.c));
  const pad   = (max - min) * 0.08;

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted-foreground">30-day price history</span>
        <div className="flex gap-3 text-[10px]">
          <span className="text-muted-foreground">Open: <span className="font-mono text-foreground">${open.toFixed(2)}</span></span>
          <span className="text-muted-foreground">Now: <span className={cn("font-mono font-bold", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>${close.toFixed(2)}</span></span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sg-${ticker}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0}    />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={[min - pad, max + pad]} hide />
          <RTooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11, padding: "4px 8px" }}
            formatter={(v: any) => [`$${(v as number).toFixed(2)}`, ticker]}
            labelStyle={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}
          />
          <Area type="monotone" dataKey="c" stroke={color} strokeWidth={1.5} fill={`url(#sg-${ticker})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const color = value <= 25 ? "#ef4444" : value <= 45 ? "#f97316" : value <= 55 ? "#eab308" : value <= 75 ? "#22c55e" : "#10b981";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-12 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path d="M 5 50 A 45 45 0 0 1 95 50" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30"/>
          <path d="M 5 50 A 45 45 0 0 1 95 50" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${(value/100)*141.37} 141.37`} strokeLinecap="round"/>
          <g transform={`rotate(${(value/100)*180 - 90}, 50, 50)`}>
            <line x1="50" y1="50" x2="50" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
          </g>
        </svg>
      </div>
      <p className="text-2xl font-bold font-mono" style={{ color }}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color }}>{label}</p>
    </div>
  );
}

export default function TraderWatchlist() {
  const [trades,      setTrades]      = useState<any[]>([]);
  const [signals,     setSignals]     = useState<any>(null);
  const [sigLoading,  setSigLoading]  = useState(true);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [conStatus,   setConStatus]   = useState<any>(null);
  const [chamber,     setChamber]     = useState<"both"|"house"|"senate">("both");
  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState<"all"|"buy"|"sell">("all");
  const [lastFetch,   setLastFetch]   = useState<Date|null>(null);
  const [sigLastFetch,setSigLastFetch]= useState<Date|null>(null);
  const [activeTab,   setActiveTab]   = useState<"signals"|"congress">("signals");
  const [sigView,     setSigView]     = useState<"stocks"|"crypto"|"social">("stocks");
  const [expanded,    setExpanded]    = useState<string|null>(null);
  const [chartTicker, setChartTicker] = useState<string|null>(null);

  const loadSignals = useCallback(async () => {
    setSigLoading(true);
    try {
      const r = await fetch("/api/trader/market-signals?mode=day");
      const d = await r.json();
      if (!d.error) { setSignals(d); setSigLastFetch(new Date()); }
    } catch { /* ignore */ }
    setSigLoading(false);
  }, []);

  const loadTrades = useCallback(async (ch = chamber) => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/trader/insider-trades?chamber=${ch}`);
      const d = await r.json();
      if (d.error) { setError(d.error); setTrades([]); }
      else {
        setTrades(d.trades || []);
        setConStatus(d.sourceStatus || null);
        setLastFetch(new Date());
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [chamber]);

  useEffect(() => { loadSignals(); }, []);

  // Only load congressional on demand
  const handleCongressTab = () => {
    setActiveTab("congress");
    if (trades.length === 0 && !loading) loadTrades();
  };

  const handleChamber = (ch: "both"|"house"|"senate") => {
    setChamber(ch);
    loadTrades(ch);
  };

  const filtered = trades.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      t.ticker?.toLowerCase().includes(q) ||
      t.name?.toLowerCase().includes(q) ||
      t.asset?.toLowerCase().includes(q);
    const type = (t.type || "").toLowerCase();
    const isBuy  = type.includes("purchase") || type.includes("buy");
    const isSell = type.includes("sale") || type.includes("sell");
    const matchType = typeFilter==="all" || (typeFilter==="buy"&&isBuy) || (typeFilter==="sell"&&isSell);
    return matchSearch && matchType;
  });

  const buys  = trades.filter(t => { const tp=(t.type||"").toLowerCase(); return tp.includes("purchase")||tp.includes("buy"); }).length;
  const sells = trades.filter(t => { const tp=(t.type||"").toLowerCase(); return tp.includes("sale")||tp.includes("sell"); }).length;
  const topTickers = Object.entries(
    trades.reduce((acc: any, t) => { if(t.ticker) acc[t.ticker]=(acc[t.ticker]||0)+1; return acc; }, {})
  ).sort((a:any,b:any)=>b[1]-a[1]).slice(0,8);

  const yahoo    = signals?.yahoo || { mostActive: [], gainers: [], losers: [] };
  const stEq:  any[] = signals?.equities || [];
  const stCr:  any[] = signals?.crypto   || [];
  const stream:any[] = signals?.stream   || [];
  const fg = signals?.fearGreed || null;

  const sourcesOk = conStatus && Object.values(conStatus).some(v => v === 'ok');
  const sourcesDown = conStatus && Object.values(conStatus).every(v => v === 'unavailable');

  return (
    <TraderLayout>
      <div className="max-w-5xl space-y-5">

        <div className="mb-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Claude Trader</p>
          <h1 className="text-2xl font-bold tracking-tight">Market Signals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live stock activity, social sentiment, and congressional disclosures — all fed into every pipeline run.
          </p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1">
          {[
            { id:"signals",  label:"Live Signals",          icon: <Activity className="h-3 w-3 mr-1.5"/>  },
            { id:"congress", label:"Congressional Trades",   icon: <Building2 className="h-3 w-3 mr-1.5"/> },
          ].map(t=>(
            <button key={t.id}
              onClick={t.id === "congress" ? handleCongressTab : ()=>setActiveTab("signals")}
              className={cn("flex items-center text-xs px-3 py-1.5 rounded-md border transition-colors",
                activeTab===t.id
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground")}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── SIGNALS TAB ────────────────────────────────────────────── */}
        {activeTab === "signals" && (
          <div className="space-y-4">

            {/* Top summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 flex flex-col items-center justify-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Fear & Greed</p>
                {sigLoading || !fg
                  ? <div className="h-16 flex items-center text-sm text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin mr-1"/>…</div>
                  : <FearGreedGauge value={fg.value} label={fg.classification}/>}
              </Card>
              {[
                { label:"Most Active", value: yahoo.mostActive.length, sub:"stocks by volume",    cls:"text-blue-500" },
                { label:"Top Gainers", value: yahoo.gainers.length,    sub:"today's biggest moves",cls:"text-emerald-600 dark:text-emerald-400" },
                { label:"Social Buzz", value: stEq.length + stCr.length, sub:"trending on StockTwits", cls:"text-orange-500" },
              ].map(c=>(
                <Card key={c.label} className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{c.label}</p>
                  <p className={cn("text-2xl font-bold font-mono", c.cls)}>{sigLoading ? "—" : c.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
                </Card>
              ))}
            </div>

            {/* Pipeline note */}
            <div className="flex items-start gap-2 rounded-lg border border-teal-500/20 bg-teal-500/5 px-4 py-3">
              <Zap className="h-3.5 w-3.5 text-teal-500 mt-0.5 shrink-0"/>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-teal-500 font-medium">Pipeline integration — </span>
                Most active stocks, top gainers, StockTwits trending tickers, and the Fear & Greed score are injected into Stage 1 and Stage 2 of every cron run so Claude accounts for real market activity.
              </p>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 items-center justify-between flex-wrap">
              <div className="flex gap-1">
                {(["stocks","crypto","social"] as const).map(v=>(
                  <button key={v} onClick={()=>setSigView(v)}
                    className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors capitalize",
                      sigView===v ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {v === "stocks" ? "Stocks" : v === "crypto" ? "Crypto" : "Social Feed"}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadSignals} disabled={sigLoading}>
                <RefreshCw className={cn("h-3 w-3 mr-1", sigLoading && "animate-spin")}/>
                {sigLastFetch ? `Updated ${sigLastFetch.toLocaleTimeString()}` : "Refresh"}
              </Button>
            </div>

            {sigLoading && (
              <div className="flex items-center justify-center py-14 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 mr-2 animate-spin"/>Fetching live signals…
              </div>
            )}

            {/* ── STOCKS VIEW ──────────────────────────────────────── */}
            {!sigLoading && sigView === "stocks" && (
              <div className="space-y-4">
                {/* Most active */}
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart2 className="h-3.5 w-3.5 text-blue-500"/>
                      Most Active Stocks
                    </CardTitle>
                    <CardDescription className="text-xs">Highest trading volume today — via Yahoo Finance</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {yahoo.mostActive.length === 0
                      ? <p className="text-center text-sm text-muted-foreground py-8">No data — market may be closed</p>
                      : (
                        <div className="divide-y divide-border/50">
                          {yahoo.mostActive.map((s: any, i: number) => (
                            <div key={s.ticker} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                              <span className="text-[10px] text-muted-foreground w-4 text-right">{i+1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-sm">{s.ticker}</span>
                                  <span className="text-xs text-muted-foreground truncate hidden sm:block">{s.name}</span>
                                </div>
                                {s.sector && <p className="text-[10px] text-muted-foreground">{s.sector}</p>}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {s.price && <span className="font-mono text-xs text-foreground">${s.price.toFixed(2)}</span>}
                                {fmtChange(s.change)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </CardContent>
                </Card>

                {/* Gainers / Losers side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label:"Top Gainers Today", data: yahoo.gainers, positive: true,  icon:<TrendingUp  className="h-3.5 w-3.5 text-emerald-500"/> },
                    { label:"Top Losers Today",  data: yahoo.losers,  positive: false, icon:<TrendingDown className="h-3.5 w-3.5 text-red-500"/> },
                  ].map(sec=>(
                    <Card key={sec.label}>
                      <CardHeader className="pb-2 pt-4">
                        <CardTitle className="text-sm flex items-center gap-2">{sec.icon}{sec.label}</CardTitle>
                        <CardDescription className="text-xs">Via Yahoo Finance · click any stock for 30-day chart</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        {sec.data.length === 0
                          ? <p className="text-center text-xs text-muted-foreground py-6">No data</p>
                          : (
                            <div className="divide-y divide-border/50">
                              {sec.data.map((s: any, i: number) => {
                                const isOpen = chartTicker === s.ticker;
                                return (
                                  <div key={s.ticker}>
                                    <button
                                      onClick={() => setChartTicker(isOpen ? null : s.ticker)}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
                                    >
                                      <span className="text-[10px] text-muted-foreground w-4 text-right">{i+1}</span>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-mono font-bold text-xs">{s.ticker}</span>
                                          {isOpen
                                            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                            : <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                                          }
                                        </div>
                                        <p className="text-[10px] text-muted-foreground truncate">{s.name}</p>
                                      </div>
                                      <div className="text-right shrink-0">
                                        {s.price && <p className="font-mono text-xs">${s.price.toFixed(2)}</p>}
                                        {fmtChange(s.change)}
                                      </div>
                                    </button>
                                    {isOpen && (
                                      <div className="border-t border-border/40 bg-muted/10">
                                        <StockSparkline ticker={s.ticker} positive={sec.positive} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )
                        }
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* StockTwits equity social sentiment */}
                {stEq.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-orange-500"/>
                        StockTwits — Trending Stocks
                      </CardTitle>
                      <CardDescription className="text-xs">Most discussed stocks on StockTwits right now. Click to expand summary.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {stEq.map((sym: any) => (
                          <div key={sym.ticker}>
                            <div onClick={()=>setExpanded(expanded===sym.ticker?null:sym.ticker)}
                              className={cn("rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors",
                                sym.sentiment==="bullish" ? "border-emerald-500/20" : sym.sentiment==="bearish" ? "border-red-500/20" : "border-border")}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-mono font-bold text-sm">{sym.ticker}</span>
                                <div className="flex items-center gap-1">
                                  <BarChart2 className="h-3 w-3 text-muted-foreground"/>
                                  <span className="text-[10px] font-mono text-muted-foreground">{sym.score}</span>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate">{sym.name}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <SentimentBadge s={sym.sentiment === "bullish" ? "Bullish" : sym.sentiment === "bearish" ? "Bearish" : null}/>
                                {(sym.bull > 0 || sym.bear > 0) && (
                                  <span className="text-[9px] text-muted-foreground">▲{sym.bull} ▼{sym.bear}</span>
                                )}
                              </div>
                            </div>
                            {expanded === sym.ticker && sym.summary && (
                              <div className="mt-1 px-3 py-2 rounded-md bg-muted/40 border border-border text-[10px] text-muted-foreground leading-relaxed">
                                {sym.summary}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── CRYPTO VIEW ──────────────────────────────────────── */}
            {!sigLoading && sigView === "crypto" && (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-orange-500"/>
                      StockTwits Trending Crypto
                    </CardTitle>
                    <CardDescription className="text-xs">Most discussed crypto assets on StockTwits. Click to expand summary.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {stCr.length === 0
                      ? <p className="text-center text-sm text-muted-foreground py-8">No data available</p>
                      : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {stCr.map((sym: any) => (
                            <div key={sym.ticker}>
                              <div onClick={()=>setExpanded(expanded===sym.ticker?null:sym.ticker)}
                                className={cn("rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors",
                                  sym.sentiment==="bullish" ? "border-emerald-500/20" : sym.sentiment==="bearish" ? "border-red-500/20" : "border-border")}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-mono font-bold text-sm">{sym.ticker}</span>
                                  <span className="text-[10px] font-mono text-muted-foreground">{sym.score}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate">{sym.name}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <SentimentBadge s={sym.sentiment === "bullish" ? "Bullish" : sym.sentiment === "bearish" ? "Bearish" : null}/>
                                  {(sym.bull > 0 || sym.bear > 0) && (
                                    <span className="text-[9px] text-muted-foreground">▲{sym.bull} ▼{sym.bear}</span>
                                  )}
                                </div>
                              </div>
                              {expanded === sym.ticker && sym.summary && (
                                <div className="mt-1 px-3 py-2 rounded-md bg-muted/40 border border-border text-[10px] text-muted-foreground leading-relaxed">
                                  {sym.summary}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </CardContent>
                </Card>

                {/* Fear & Greed history */}
                {fg?.history?.length > 1 && (
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-sm">Fear & Greed — 7 Day History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        {fg.history.slice(0, 7).reverse().map((h: any, i: number) => {
                          const c = h.value<=25?"#ef4444":h.value<=45?"#f97316":h.value<=55?"#eab308":h.value<=75?"#22c55e":"#10b981";
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                              <span className="text-[9px] font-mono" style={{color:c}}>{h.value}</span>
                              <div className="w-full rounded-sm" style={{height:`${Math.max(8,h.value*0.5)}px`,backgroundColor:c,opacity:0.7}}/>
                              <span className="text-[8px] text-muted-foreground">{h.date}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── SOCIAL FEED VIEW ─────────────────────────────────── */}
            {!sigLoading && sigView === "social" && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-blue-500"/>
                    StockTwits Live Feed
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">Recent posts with explicit Bullish/Bearish sentiment tags</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {stream.length === 0
                    ? <p className="text-center text-sm text-muted-foreground py-8">No stream data available</p>
                    : (
                      <div className="divide-y divide-border/50">
                        {stream.map((msg: any, i: number) => (
                          <div key={i} className="flex gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                            <div className="shrink-0 mt-0.5">
                              {msg.sentiment?.toLowerCase()==="bullish"
                                ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500"/>
                                : msg.sentiment?.toLowerCase()==="bearish"
                                ? <ArrowDownRight className="h-3.5 w-3.5 text-red-500"/>
                                : <Minus className="h-3.5 w-3.5 text-muted-foreground"/>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                {(msg.symbols||[]).map((s:string)=>(
                                  <span key={s} className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border border-border bg-muted/30">{s}</span>
                                ))}
                                <SentimentBadge s={msg.sentiment}/>
                                {msg.likes>0&&<span className="text-[9px] text-muted-foreground ml-auto">♥ {msg.likes}</span>}
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{msg.body}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </CardContent>
              </Card>
            )}

            <Card className="border-border/50">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Sources</strong>: Yahoo Finance screener (most active, gainers, losers) · StockTwits public API (trending symbols + message stream with user-tagged sentiment) · Alternative.me Fear & Greed index. All data refreshed on demand. For informational purposes only.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── CONGRESS TAB ──────────────────────────────────────────── */}
        {activeTab === "congress" && (
          <div className="space-y-4">
            {/* Source status banner */}
            {sourcesDown && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0"/>
                <div>
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-0.5">Data sources temporarily unavailable</p>
                  <p className="text-[10px] text-muted-foreground">
                    House Stock Watcher and Senate Stock Watcher are currently unreachable from this server. These are community-run sites that occasionally go offline. Try refreshing later or visit them directly.
                  </p>
                  <div className="flex gap-3 mt-2">
                    <a href="https://housestockwatcher.com" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline">
                      <ExternalLink className="h-3 w-3"/>housestockwatcher.com
                    </a>
                    <a href="https://senatestockwatcher.com" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline">
                      <ExternalLink className="h-3 w-3"/>senatestockwatcher.com
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label:"Total Disclosures", value: trades.length,  cls:"text-foreground" },
                { label:"Buys",              value: buys,            cls:"text-emerald-600 dark:text-emerald-400" },
                { label:"Sells",             value: sells,           cls:"text-red-500" },
                { label:"Unique Tickers",    value: new Set(trades.map(t=>t.ticker)).size, cls:"text-blue-500" },
              ].map(c=>(
                <Card key={c.label} className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{c.label}</p>
                  <p className={cn("text-xl font-bold font-mono", c.cls)}>{loading ? "—" : c.value}</p>
                </Card>
              ))}
            </div>

            {topTickers.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">Most Traded Tickers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {topTickers.map(([ticker, count]: any) => (
                      <button key={ticker} onClick={() => setSearch(ticker)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors font-mono">
                        {ticker}<span className="text-[10px] text-muted-foreground">×{count}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
                <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticker or name…" className="pl-8 h-8 text-xs"/>
              </div>
              <div className="flex gap-1">
                {(["both","house","senate"] as const).map(ch=>(
                  <button key={ch} onClick={()=>handleChamber(ch)}
                    className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors capitalize",
                      chamber===ch ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {ch==="both"?<><Users className="h-3 w-3 inline mr-1"/>Both</>:ch==="house"?<><Building2 className="h-3 w-3 inline mr-1"/>House</>:<><Building2 className="h-3 w-3 inline mr-1"/>Senate</>}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["all","buy","sell"] as const).map(tp=>(
                  <button key={tp} onClick={()=>setTypeFilter(tp)}
                    className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors capitalize",
                      typeFilter===tp ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {tp}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=>loadTrades()} disabled={loading}>
                <RefreshCw className={cn("h-3 w-3 mr-1.5", loading&&"animate-spin")}/>Refresh
              </Button>
              {lastFetch&&<span className="text-[10px] text-muted-foreground">Updated {lastFetch.toLocaleTimeString()}</span>}
            </div>

            <Card>
              <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Recent Disclosures</CardTitle>
                  <CardDescription className="text-xs mt-0.5">{filtered.length} trades shown</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin"/>Loading…
                  </div>
                ) : error ? (
                  <div className="text-center py-12">
                    <p className="text-sm text-red-500 mb-2">{error}</p>
                    <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={()=>loadTrades()}>Try Again</Button>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-12">
                    {sourcesDown ? "Data sources offline — no trades to display" : "No trades match your filters"}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5 whitespace-nowrap">Date</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Member</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Chamber</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Ticker</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Type</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Amount</th>
                          <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Asset</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0,200).map((t,i)=>{
                          const party=(t.party||"").toLowerCase();
                          const partyCls=PARTY_COLOR[party]||"text-muted-foreground";
                          const isBuy=(t.type||"").toLowerCase().includes("purchase")||(t.type||"").toLowerCase().includes("buy");
                          const isSell=(t.type||"").toLowerCase().includes("sale")||(t.type||"").toLowerCase().includes("sell");
                          return (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">{fmtDate(t.date)}</td>
                              <td className="px-4 py-2.5 max-w-[160px]">
                                <p className="font-medium truncate">{t.name||"—"}</p>
                                {t.state&&<p className={cn("text-[10px]",partyCls)}>{t.state}{party?` · ${party.charAt(0).toUpperCase()}`:""}</p>}
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant="secondary" className={cn("text-[9px]",t.chamber==="House"?"text-blue-500":"text-purple-500")}>
                                  {t.chamber}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{t.ticker||"—"}</td>
                              <td className="px-4 py-2.5">
                                <div className={cn("flex items-center gap-1",isBuy?"text-emerald-600 dark:text-emerald-400":isSell?"text-red-500":"text-muted-foreground")}>
                                  {isBuy?<TrendingUp className="h-3 w-3"/>:isSell?<TrendingDown className="h-3 w-3"/>:null}
                                  <Badge variant="secondary" className="text-[9px] px-1.5">{isBuy?"Buy":isSell?"Sell":t.type||"—"}</Badge>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">{t.amount||"—"}</td>
                              <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate hidden md:table-cell">{t.asset||"—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filtered.length>200&&<p className="text-center text-[10px] text-muted-foreground py-3">Showing 200 of {filtered.length} — search to filter</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Data source</strong>: House Stock Watcher &amp; Senate Stock Watcher — community aggregators of STOCK Act disclosures. Members must disclose trades within 45 days. Data is for informational purposes only.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </TraderLayout>
  );
}
