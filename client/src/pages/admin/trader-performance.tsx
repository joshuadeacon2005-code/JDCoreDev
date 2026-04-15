import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { useLocation } from "wouter";
import { TraderLayout } from "@/components/TraderLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtHKT, fmtHKTDate, fmtHKTTime } from "@/lib/hkt";
import { TrendingUp, Activity, BarChart2, Clock, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const fmtUSD = (n: any) => typeof n==="number" ? "$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—";
const fmtPct = (n: any) => typeof n!=="number" ? "—" : (n>=0?"+":"")+n.toFixed(2)+"%";
const clrCls = (n: any) => n>0 ? "text-emerald-600 dark:text-emerald-400" : n<0 ? "text-red-500" : "text-muted-foreground";

const MODES = [
  { key:"all",       label:"All",       color:"#008080", bg:"bg-[#008080]/10",  border:"border-[#008080]/30",  text:"text-[#008080]"  },
  { key:"day",       label:"Day",       color:"#008080", bg:"bg-[#008080]/10",  border:"border-[#008080]/30",  text:"text-[#008080]"  },
  { key:"swing",     label:"Swing",     color:"#8b5cf6", bg:"bg-violet-500/10", border:"border-violet-500/30", text:"text-violet-500" },
  { key:"portfolio", label:"Portfolio", color:"#16a34a", bg:"bg-emerald-500/10",border:"border-emerald-500/30",text:"text-emerald-600 dark:text-emerald-400" },
  { key:"crypto",    label:"Crypto",    color:"#f97316", bg:"bg-orange-500/10", border:"border-orange-500/30", text:"text-orange-500" },
];
const modeOf = (key: string) => MODES.find(m=>m.key===key) || MODES[0];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{color:p.color}} className="font-mono">
          {p.name}: {typeof p.value==="number" ? (p.name.toLowerCase().includes("equity") ? fmtUSD(p.value) : fmtPct(p.value)) : p.value}
        </p>
      ))}
    </div>
  );
};

function DecisionsFeed({pipelines, activeMode}:{pipelines:any[], activeMode:string}) {
  const filtered = activeMode==="all" ? pipelines : pipelines.filter((p:any)=>p.mode===activeMode);
  const recent = filtered.slice(0, 20);

  if (!recent.length) return (
    <Card>
      <CardContent className="py-10 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2"/>
        <p className="text-sm text-muted-foreground">No pipeline decisions yet{activeMode!=="all"?` for ${modeOf(activeMode).label} mode`:""}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-2">
      {recent.map((p:any, i:number)=>{
        const mc = modeOf(p.mode);
        const score = parseFloat(p.score)||0;
        const time = new Date(p.logged_at);
        const relTime = fmtHKT(time, {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) + " HKT";
        return (
          <div key={i} className={cn("flex items-start gap-3 rounded-lg border p-3", p.pass ? cn(mc.border, mc.bg) : "border-border/50 bg-muted/20")}>
            {/* Score */}
            <div className="flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold font-mono"
              style={{borderColor: p.pass ? mc.color : "hsl(var(--border))", color: p.pass ? mc.color : "hsl(var(--muted-foreground))"}}>
              {score.toFixed(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className={cn("text-[10px]", mc.border, mc.text)}>{p.mode||"—"}</Badge>
                <Badge variant="outline" className={cn("text-[10px]",
                  p.risk==="high"?"border-red-500/30 text-red-500":p.risk==="low"?"border-blue-500/30 text-blue-500":"border-amber-500/30 text-amber-500")}>
                  {p.risk||"medium"}
                </Badge>
                {p.pass ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle className="h-3 w-3"/> {p.positions_count} position{p.positions_count!==1?"s":""}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <XCircle className="h-3 w-3"/> skipped
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/40 ml-auto whitespace-nowrap">{relTime}</span>
              </div>
              {p.thesis&&<p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">{p.thesis}</p>}
              {p.ter&&<p className="text-[10px] text-muted-foreground/40 mt-0.5 font-mono">TER: {p.ter}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TraderPerformance() {
  const [snapshots,   setSnapshots]   = useState<any[]>([]);
  const [trades,      setTrades]      = useState<any[]>([]);
  const [pipelines,   setPipelines]   = useState<any[]>([]);
  const [days,        setDays]        = useState(30);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [activeMode,  setActiveMode]  = useState("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [s,t,p] = await Promise.all([
        fetch(`/api/trader/history?type=snapshots&days=${days}`).then(r=>r.json()),
        fetch('/api/trader/history?type=trades&limit=500').then(r=>r.json()),
        fetch('/api/trader/history?type=pipelines').then(r=>r.json()),
      ]);
      setSnapshots(Array.isArray(s)?s:[]);
      setTrades(Array.isArray(t)?t:[]);
      setPipelines(Array.isArray(p)?p:[]);
      setLastUpdated(new Date());
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [days]);

  useEffect(()=>{ loadData(); }, [loadData]);

  useEffect(()=>{
    intervalRef.current = setInterval(()=>loadData(true), 60000);
    return ()=>{ if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadData]);

  const syncPnl = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/trader/sync-pnl", { method: "POST" });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      toast({ title: "Synced", description: `${d.updated ?? 0} trade(s) updated · equity snapshot recorded.` });
      loadData();
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const filteredTrades    = activeMode==="all" ? trades    : trades.filter(t=>t.mode===activeMode);
  const filteredPipelines = activeMode==="all" ? pipelines : pipelines.filter((p:any)=>p.mode===activeMode);
  const mc = modeOf(activeMode);

  const equityData = snapshots.map(s=>({
    date: fmtHKTDate(s.logged_at, {month:"short",day:"numeric"}),
    equity: parseFloat(s.equity)||0,
    pnl: parseFloat(s.pnl_day)||0,
  }));

  const totalTrades = filteredTrades.length;
  const buys  = filteredTrades.filter(t=>t.side==="buy").length;
  const sells = filteredTrades.filter(t=>t.side==="sell").length;

  const sectorMap: any = {};
  filteredTrades.forEach(t=>{ const s=t.symbol||"Other"; sectorMap[s]=(sectorMap[s]||0)+1; });
  const symbolData = Object.entries(sectorMap).map(([symbol,count])=>({symbol,count})).sort((a:any,b:any)=>b.count-a.count).slice(0,8);

  const pipelineScoreData = filteredPipelines.slice().reverse().slice(-30).map((p:any,i:number)=>({
    run:`#${i+1}`, score:parseFloat(p.score)||0, pass:p.pass, mode:p.mode,
  }));

  const latestSnap = snapshots[snapshots.length-1];
  const firstSnap  = snapshots[0];
  const totalPnl   = latestSnap && firstSnap ? parseFloat(latestSnap.equity)-parseFloat(firstSnap.equity) : 0;
  const totalPnlPct= firstSnap ? (totalPnl/parseFloat(firstSnap.equity))*100 : 0;

  const passedRuns   = filteredPipelines.filter((p:any)=>p.pass).length;
  const skippedRuns  = filteredPipelines.filter((p:any)=>!p.pass).length;
  const avgScore     = filteredPipelines.length ? filteredPipelines.reduce((s:number,p:any)=>s+parseFloat(p.score||0),0)/filteredPipelines.length : 0;

  // Mode keys present in data
  const tradeKeys    = new Set(trades.map(t=>t.mode).filter(Boolean));
  const pipelineKeys = new Set(pipelines.map((p:any)=>p.mode).filter(Boolean));
  const combinedKeys = new Set([...tradeKeys, ...pipelineKeys]);
  const visibleModes = MODES.filter(m=>m.key==="all" || combinedKeys.has(m.key));

  const hasData = snapshots.length>0 || trades.length>0 || pipelines.length>0;

  return (
    <TraderLayout>
      <div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Claude Trader</p>
            <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
            {!loading&&hasData&&(
              <p className="text-sm text-muted-foreground mt-1">
                {filteredTrades.length} trades · {filteredPipelines.length} pipeline runs
                {activeMode!=="all"&&<> · <span className={mc.text}>{mc.label} mode</span></>}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" onClick={syncPnl} disabled={syncing || refreshing} className="flex items-center gap-1.5 text-xs mt-1">
              <RefreshCw className={cn("h-3.5 w-3.5", (syncing || refreshing) && "animate-spin")}/>
              {syncing ? "Syncing…" : refreshing ? "Refreshing…" : "Sync P&L"}
            </Button>
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground/50">
                Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        {/* Mode filter tabs */}
        {!loading&&hasData&&(
          <div className="flex gap-1.5 flex-wrap mb-5">
            {visibleModes.map(m=>(
              <button key={m.key} onClick={()=>setActiveMode(m.key)}
                className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors font-medium",
                  activeMode===m.key
                    ? cn(m.border, m.bg, m.text)
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/60")}>
                {m.label}
                {m.key!=="all"&&(
                  <span className="ml-1.5 text-[10px] opacity-60">
                    {trades.filter(t=>t.mode===m.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_,i)=><Skeleton key={i} className="h-20"/>)}
            </div>
            <Skeleton className="h-48"/>
          </div>
        ) : !hasData ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No data yet — run the agent to start collecting performance metrics.</CardContent></Card>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label:"Total Return",    value:fmtPct(totalPnlPct),  cls:clrCls(totalPnlPct), icon:TrendingUp, sub:"from equity baseline" },
                { label:"Net P&L",         value:fmtUSD(totalPnl),     cls:clrCls(totalPnl),    icon:Activity,   sub:`${buys} buys · ${sells} sells` },
                { label:"Pipeline Runs",   value:filteredPipelines.length, cls:"text-foreground", icon:BarChart2,  sub:`${passedRuns} executed · ${skippedRuns} skipped` },
                { label:"Avg Score",       value:avgScore>0?avgScore.toFixed(1):"—",cls:avgScore>=60?"text-emerald-600 dark:text-emerald-400":avgScore>0?"text-amber-500":"text-muted-foreground", icon:Clock, sub:"pipeline quality" },
              ].map(m=>(
                <Card key={m.label} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                    <m.icon className="h-3.5 w-3.5 text-muted-foreground/40"/>
                  </div>
                  <p className={cn("text-xl font-bold font-mono", m.cls)}>{m.value}</p>
                  {m.sub&&<p className="text-[10px] text-muted-foreground/60 mt-0.5">{m.sub}</p>}
                </Card>
              ))}
            </div>

            {/* Day filter (only relevant for equity curve, which is account-level) */}
            <div className="flex items-center gap-1.5 mb-5">
              <p className="text-xs text-muted-foreground mr-1">Equity period:</p>
              {[7,14,30,90].map(d=>(
                <button key={d} onClick={()=>setDays(d)}
                  className={cn("text-xs px-3 py-1 rounded-md border transition-colors",
                    days===d ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  {d}d
                </button>
              ))}
            </div>

            {/* Equity curve — account-level, not filtered by mode */}
            {equityData.length>1&&(
              <Card className="mb-4">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Equity Curve
                    <span className="text-[10px] text-muted-foreground/60 font-normal">(account-level, all modes)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={equityData}>
                      <defs>
                        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#008080" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#008080" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                      <XAxis dataKey="date" tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
                      <Tooltip content={<ChartTooltip/>}/>
                      <Area type="monotone" dataKey="equity" name="Equity" stroke="#008080" fill="url(#eg)" strokeWidth={2}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Pipeline scores */}
              {pipelineScoreData.length>0&&(
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm">
                      Pipeline Scores
                      {activeMode!=="all"&&<span className={cn("ml-2 text-[10px] font-normal", mc.text)}>{mc.label}</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={pipelineScoreData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                        <XAxis dataKey="run" tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false}/>
                        <YAxis domain={[0,100]} tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false}/>
                        <Tooltip content={({active,payload}:any)=>{
                          if(!active||!payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
                              <p className="text-muted-foreground mb-1">{d.run}</p>
                              <p className="font-mono">Score: {d.score}</p>
                              <p className={d.pass?"text-emerald-500":"text-muted-foreground"}>{d.pass?"✓ Executed":"✗ Skipped"}</p>
                            </div>
                          );
                        }}/>
                        <Bar dataKey="score" name="Score" radius={[3,3,0,0]}>
                          {pipelineScoreData.map((d:any,i:number)=>{
                            const pm = modeOf(d.mode);
                            return <Cell key={i} fill={d.pass ? pm.color : "hsl(var(--muted-foreground))"} fillOpacity={d.pass?1:0.3}/>;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Trade distribution by symbol */}
              {symbolData.length>0&&(
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm">
                      Trades by Symbol
                      {activeMode!=="all"&&<span className={cn("ml-2 text-[10px] font-normal", mc.text)}>{mc.label}</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={symbolData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                        <XAxis type="number" tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false}/>
                        <YAxis type="category" dataKey="symbol" tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} width={52}/>
                        <Tooltip content={<ChartTooltip/>}/>
                        <Bar dataKey="count" name="Trades" fill={mc.color} radius={[0,3,3,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Recent Decisions */}
            <Card className="mb-4">
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground"/>
                  Recent Cron Decisions
                  <span className="text-[10px] text-muted-foreground/60 font-normal ml-1">
                    — AI pipeline runs &amp; what it decided to do
                  </span>
                  {filteredPipelines.length>0&&(
                    <Badge variant="outline" className="ml-auto text-[10px]">{filteredPipelines.length} total</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <DecisionsFeed pipelines={pipelines} activeMode={activeMode}/>
              </CardContent>
            </Card>

            {/* Trade history */}
            {filteredTrades.length>0&&(
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">
                    Trade History ({filteredTrades.length})
                    {activeMode!=="all"&&<span className={cn("ml-2 text-[10px] font-normal", mc.text)}>{mc.label} only</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b">
                        {["Symbol","Side","Mode","Notional","Status","Risk","Rationale","Date"].map(h=>(
                          <th key={h} className="pb-2 text-left font-medium pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.slice(0,50).map((t,i)=>{
                        const tm = modeOf(t.mode);
                        return (
                          <tr key={i} className="border-b border-border/40 last:border-0">
                            <td className="py-2.5 pr-4 font-semibold text-foreground">{t.symbol}</td>
                            <td className={cn("py-2.5 pr-4 font-semibold uppercase text-[11px]", t.side==="buy"?"text-emerald-600 dark:text-emerald-400":"text-red-500")}>{t.side}</td>
                            <td className="py-2.5 pr-4">
                              {t.mode ? (
                                <Badge variant="outline" className={cn("text-[10px]", tm.border, tm.text)}>{t.mode}</Badge>
                              ) : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-muted-foreground">{t.notional?fmtUSD(parseFloat(t.notional)):"—"}</td>
                            <td className="py-2.5 pr-4">
                              <Badge variant="outline" className={cn("text-[10px]",
                                t.status==="filled" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                                t.status==="canceled" ? "border-red-500/30 text-red-500" :
                                "border-amber-500/30 text-amber-500")}>
                                {t.status||"—"}
                              </Badge>
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground capitalize">{t.risk||"—"}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground/60 max-w-[160px] truncate">{t.rationale||"—"}</td>
                            <td className="py-2.5 text-muted-foreground/60">{t.logged_at?fmtHKTDate(t.logged_at,{month:"short",day:"numeric"})+" HKT":"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <p className="text-center text-[10px] text-muted-foreground/30 mt-6">Claude Trader · JD Core Dev · Not financial advice</p>
      </div>
    </TraderLayout>
  );
}
