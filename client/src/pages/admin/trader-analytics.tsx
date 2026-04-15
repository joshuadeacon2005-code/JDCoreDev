import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { useLocation } from "wouter";
import { TraderLayout } from "@/components/TraderLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtHKT, fmtHKTDate, getHKTHour } from "@/lib/hkt";
import { Trophy, TrendingDown, BarChart2, Layers, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const usd  = (n: any) => typeof n==="number" ? "$"+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—";
const clrCls = (n: any) => n>0 ? "text-emerald-600 dark:text-emerald-400" : n<0 ? "text-red-500" : "text-muted-foreground";

const MODES = [
  { key:"all",       label:"All",       color:"#008080", bg:"bg-[#008080]/10",  border:"border-[#008080]/30",  text:"text-[#008080]"  },
  { key:"day",       label:"Day",       color:"#008080", bg:"bg-[#008080]/10",  border:"border-[#008080]/30",  text:"text-[#008080]"  },
  { key:"swing",     label:"Swing",     color:"#8b5cf6", bg:"bg-violet-500/10", border:"border-violet-500/30", text:"text-violet-500" },
  { key:"portfolio", label:"Portfolio", color:"#16a34a", bg:"bg-emerald-500/10",border:"border-emerald-500/30",text:"text-emerald-600 dark:text-emerald-400" },
  { key:"crypto",    label:"Crypto",    color:"#f97316", bg:"bg-orange-500/10", border:"border-orange-500/30", text:"text-orange-500" },
];
const modeOf = (key:string) => MODES.find(m=>m.key===key) || MODES[0];

const ChartTooltip = ({active,payload,label}:any) => {
  if (!active||!payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p:any,i:number)=>(
        <p key={i} style={{color:p.color}} className="font-mono">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function Gauge({value,max=100,label,sub,color="#008080"}:{value:number,max?:number,label:string,sub:string,color?:string}) {
  const pv = Math.min((value/max)*100,100);
  const r=48, cx=65, cy=65;
  const circ = 2*Math.PI*r;
  return (
    <div className="text-center">
      <svg width={130} height={90} viewBox="0 0 130 90">
        <path d={`M ${cx-r},${cy} A ${r},${r} 0 0 1 ${cx+r},${cy}`} fill="none" stroke="hsl(var(--border))" strokeWidth={9}/>
        <path d={`M ${cx-r},${cy} A ${r},${r} 0 0 1 ${cx+r},${cy}`} fill="none" stroke={color} strokeWidth={9}
          strokeDasharray={`${circ*0.5} ${circ}`} strokeDashoffset={-circ*(1-pv/100)*0.5}
          strokeLinecap="round" style={{transition:"all 1s ease"}}/>
        <text x={cx} y={cy-4} textAnchor="middle" fill={color} fontSize={18} fontWeight={800} fontFamily="monospace">
          {typeof value==="number"?value.toFixed(1):value}
        </text>
        <text x={cx} y={cy+12} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{sub}</text>
      </svg>
      <p className="text-[10px] text-muted-foreground -mt-2">{label}</p>
    </div>
  );
}

function computeStats(trades: any[]) {
  if (!trades.length) return null;
  const buys  = trades.filter(t=>t.side==="buy");
  const sells = trades.filter(t=>t.side==="sell");
  const closed = trades.filter(t => t.pnl != null);
  const wins   = closed.filter(t => parseFloat(t.pnl||0) > 0);
  const losses = closed.filter(t => parseFloat(t.pnl||0) < 0);
  const winRate      = closed.length ? (wins.length / closed.length)*100 : 0;
  const avgWin       = wins.length   ? wins.reduce((s:number,t:any)=>s+parseFloat(t.pnl||0),0)/wins.length : 0;
  const avgLoss      = losses.length ? Math.abs(losses.reduce((s:number,t:any)=>s+parseFloat(t.pnl||0),0)/losses.length) : 0;
  const rr           = avgLoss ? avgWin/avgLoss : 0;
  const grossProfit  = wins.reduce((s:number,t:any)=>s+parseFloat(t.pnl||0),0);
  const grossLoss    = Math.abs(losses.reduce((s:number,t:any)=>s+parseFloat(t.pnl||0),0));
  const profitFactor = grossLoss ? grossProfit/grossLoss : grossProfit>0?999:0;
  const totalPnl     = closed.reduce((s:number,t:any)=>s+parseFloat(t.pnl||0),0);
  const bestTrade    = closed.length ? closed.reduce((b:any,t:any)=>parseFloat(t.pnl||0)>parseFloat(b.pnl||0)?t:b, closed[0]) : null;
  const worstTrade   = closed.length ? closed.reduce((b:any,t:any)=>parseFloat(t.pnl||0)<parseFloat(b.pnl||0)?t:b, closed[0]) : null;
  let maxWinStreak=0,maxLossStreak=0,curW=0,curL=0;
  closed.forEach((t:any)=>{ if(parseFloat(t.pnl||0)>0){curW++;curL=0;maxWinStreak=Math.max(maxWinStreak,curW);}else{curL++;curW=0;maxLossStreak=Math.max(maxLossStreak,curL);} });
  const bySymbol: any = {};
  closed.forEach((t:any)=>{ if(!bySymbol[t.symbol]) bySymbol[t.symbol]={symbol:t.symbol,trades:0,pnl:0,wins:0}; bySymbol[t.symbol].trades++; bySymbol[t.symbol].pnl+=parseFloat(t.pnl||0); if(parseFloat(t.pnl||0)>0) bySymbol[t.symbol].wins++; });
  const bySymbolArr = Object.values(bySymbol).sort((a:any,b:any)=>b.pnl-a.pnl);
  const byHour: any = {};
  closed.forEach((t:any)=>{ const h=t.executed_at?getHKTHour(t.executed_at):null; if(h==null) return; if(!byHour[h]) byHour[h]={hour:h,trades:0,pnl:0}; byHour[h].trades++; byHour[h].pnl+=parseFloat(t.pnl||0); });
  const byHourArr = Array.from({length:24},(_,h)=>byHour[h]||{hour:h,trades:0,pnl:0}).filter((x:any)=>x.trades>0);
  let running=0;
  const pnlCurve = closed.map((t:any,i:number)=>{ running+=parseFloat(t.pnl||0); return {n:i+1,cumPnl:parseFloat(running.toFixed(2)),pnl:parseFloat(t.pnl||0)}; });
  const byMonth: any = {};
  closed.forEach((t:any)=>{ const key=t.executed_at?fmtHKTDate(t.executed_at,{month:"short",year:"2-digit"}):"N/A"; if(!byMonth[key]) byMonth[key]={month:key,pnl:0,trades:0,wins:0}; byMonth[key].pnl+=parseFloat(t.pnl||0); byMonth[key].trades++; if(parseFloat(t.pnl||0)>0) byMonth[key].wins++; });
  const byMonthArr = Object.values(byMonth);
  return { total:trades.length, closed:closed.length, buys:buys.length, sells:sells.length, winRate, avgWin, avgLoss, rr, profitFactor, totalPnl, grossProfit, grossLoss, bestTrade, worstTrade, maxWinStreak, maxLossStreak, wins:wins.length, losses:losses.length, bySymbolArr, byHourArr, pnlCurve, byMonthArr };
}

function ModeSummaryRow({trades}:{trades:any[]}) {
  const modeSummaries = MODES.filter(m=>m.key!=="all").map(m=>{
    const modeTrades = trades.filter(t=>t.mode===m.key);
    const closed = modeTrades.filter(t=>t.pnl!=null);
    const totalPnl = closed.reduce((s:number,t:any)=>s+parseFloat(t.pnl||0),0);
    const wins = closed.filter(t=>parseFloat(t.pnl||0)>0);
    const winRate = closed.length ? (wins.length/closed.length)*100 : 0;
    return { ...m, count: modeTrades.length, closed: closed.length, totalPnl, winRate };
  }).filter(m=>m.count>0);

  if (!modeSummaries.length) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground"/>
          Strategy Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {modeSummaries.map(m=>(
            <div key={m.key} className={cn("rounded-lg border p-3", m.border, m.bg)}>
              <p className={cn("text-[10px] font-semibold uppercase tracking-widest mb-1.5", m.text)}>{m.label}</p>
              <p className={cn("text-lg font-bold font-mono", m.totalPnl>=0?"text-emerald-600 dark:text-emerald-400":"text-red-500")}>
                {m.totalPnl>=0?"+":"-"}{usd(Math.abs(m.totalPnl))}
              </p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground">{m.count} trades</span>
                {m.closed>0&&<span className="text-[10px] text-muted-foreground">{m.winRate.toFixed(0)}% WR</span>}
              </div>
              {m.closed>0&&(
                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                  <div style={{width:`${m.winRate}%`,backgroundColor:m.color}} className="h-full rounded-full transition-all"/>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionsView({pipelines, activeMode}:{pipelines:any[], activeMode:string}) {
  const filtered = activeMode==="all" ? pipelines : pipelines.filter((p:any)=>p.mode===activeMode);

  if (!filtered.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3"/>
          <p className="text-sm text-muted-foreground">No pipeline runs recorded yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Decisions appear here after each autonomous cron cycle.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Score chart */}
      {filtered.length>1&&(
        <Card>
          <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Pipeline Score History</CardTitle></CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={filtered.slice().reverse().slice(-30).map((p:any,i:number)=>({
                n: i+1,
                score: parseFloat(p.score)||0,
                mode: p.mode,
                pass: p.pass,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="n" tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false}/>
                <YAxis domain={[0,100]} tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false}/>
                <Tooltip content={({active,payload}:any)=>{
                  if(!active||!payload?.length) return null;
                  const d = payload[0].payload;
                  const mc = modeOf(d.mode);
                  return (
                    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
                      <p className={cn("font-semibold capitalize mb-1", mc.text)}>{d.mode} run</p>
                      <p className="font-mono">Score: {payload[0].value}</p>
                      <p className={d.pass?"text-emerald-500":"text-red-500"}>{d.pass?"✓ Passed":"✗ Skipped"}</p>
                    </div>
                  );
                }}/>
                <Bar dataKey="score" name="Score" radius={[3,3,0,0]}>
                  {filtered.slice().reverse().slice(-30).map((p:any,i:number)=>{
                    const mc = modeOf(p.mode);
                    return <Cell key={i} fill={p.pass ? mc.color : "hsl(var(--muted-foreground))"} fillOpacity={p.pass?1:0.35}/>;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Decision cards */}
      {filtered.map((p:any, i:number)=>{
        const mc = modeOf(p.mode);
        const score = parseFloat(p.score)||0;
        const time = new Date(p.logged_at);
        const relTime = fmtHKT(time, {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) + " HKT";
        return (
          <Card key={i} className={cn("border", p.pass ? mc.border : "border-border/60")}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                {/* Score circle */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-bold font-mono"
                  style={{borderColor: p.pass ? mc.color : "hsl(var(--border))", color: p.pass ? mc.color : "hsl(var(--muted-foreground))"}}>
                  {score.toFixed(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <Badge variant="outline" className={cn("text-[10px]", mc.border, mc.text)}>
                      {p.mode || "—"}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[10px]", p.risk==="high"?"border-red-500/30 text-red-500":p.risk==="low"?"border-blue-500/30 text-blue-500":"border-amber-500/30 text-amber-500")}>
                      {p.risk || "medium"} risk
                    </Badge>
                    {p.pass ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="h-3 w-3"/> Executed · {p.positions_count} position{p.positions_count!==1?"s":""}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <XCircle className="h-3 w-3"/> Skipped (score too low)
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">{relTime}</span>
                  </div>
                  {p.thesis&&(
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{p.thesis}</p>
                  )}
                  {p.ter&&(
                    <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">TER: {p.ter}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function TraderAnalytics() {
  const [allTrades,   setAllTrades]   = useState<any[]>([]);
  const [pipelines,   setPipelines]   = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [view,        setView]        = useState("overview");
  const [activeMode,  setActiveMode]  = useState("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const loadData = useCallback((silent = false)=>{
    if (!silent) setLoading(true);
    else setRefreshing(true);
    Promise.all([
      fetch("/api/trader/history?type=trades&limit=500").then(r=>r.json()),
      fetch("/api/trader/history?type=pipelines").then(r=>r.json()),
    ]).then(([t, p])=>{
      setAllTrades(Array.isArray(t)?t:[]);
      setPipelines(Array.isArray(p)?p:[]);
      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
    }).catch(()=>{ setLoading(false); setRefreshing(false); });
  }, []);

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
      toast({ title: "P&L synced", description: `${d.updated ?? 0} trade(s) updated from Alpaca fills.` });
      loadData();
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const trades = activeMode==="all" ? allTrades : allTrades.filter(t=>t.mode===activeMode);
  const s = computeStats(trades);
  const mc = modeOf(activeMode);
  const VIEWS = ["overview","decisions","symbols","timing","trades"];

  const activeModeKeys = new Set(allTrades.map(t=>t.mode).filter(Boolean));
  const pipelineModeKeys = new Set(pipelines.map((p:any)=>p.mode).filter(Boolean));
  const combinedKeys = new Set([...activeModeKeys, ...pipelineModeKeys]);
  const visibleModes = MODES.filter(m=>m.key==="all" || combinedKeys.has(m.key));

  const hasSomething = allTrades.length>0 || pipelines.length>0;

  return (
    <TraderLayout>
      <div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Claude Trader</p>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            {!loading&&<p className="text-sm text-muted-foreground mt-1">
              {s?.closed ?? 0} closed trades · {pipelines.length} pipeline runs
              {activeMode!=="all"&&<> · <span className={mc.text}>{mc.label} mode</span></>}
            </p>}
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
        {!loading&&hasSomething&&(
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
                    {allTrades.filter(t=>t.mode===m.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-3">{[...Array(4)].map((_,i)=><Skeleton key={i} className="h-20"/>)}</div>
            <Skeleton className="h-48"/>
          </div>
        ) : !hasSomething ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BarChart2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3"/>
              <p className="text-sm text-muted-foreground mb-1">No data yet</p>
              <p className="text-xs text-muted-foreground/60">Trade and pipeline data will appear here once the agent runs.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Strategy breakdown — only on All tab */}
            {activeMode==="all"&&allTrades.length>0&&<ModeSummaryRow trades={allTrades}/>}

            {/* View selector */}
            <div className="flex gap-1.5 mb-5 flex-wrap">
              {VIEWS.map(v=>(
                <button key={v} onClick={()=>setView(v)}
                  className={cn("text-xs px-3 py-1 rounded-md border capitalize transition-colors",
                    view===v ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  {v}
                  {v==="decisions"&&pipelines.length>0&&(
                    <span className="ml-1.5 text-[10px] opacity-60">
                      {activeMode==="all" ? pipelines.length : pipelines.filter((p:any)=>p.mode===activeMode).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── DECISIONS ── */}
            {view==="decisions"&&(
              <DecisionsView pipelines={pipelines} activeMode={activeMode}/>
            )}

            {/* ── OVERVIEW ── */}
            {view==="overview"&&(
              !s ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <RefreshCw className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3"/>
                    <p className="text-sm text-muted-foreground mb-1">No P&L data yet for {activeMode==="all"?"any mode":mc.label+" mode"}.</p>
                    <p className="text-xs text-muted-foreground/60 mb-4">Click "Sync P&L" above to pull fill data from Alpaca and calculate realised P&L.</p>
                    <Button variant="outline" size="sm" onClick={syncPnl} disabled={syncing} className="mx-auto flex items-center gap-1.5 text-xs">
                      <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")}/>
                      {syncing ? "Syncing…" : "Sync P&L now"}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardContent className="pt-5 pb-4 flex justify-around flex-wrap gap-4">
                      <Gauge value={s.winRate}      max={100} label="Win Rate"      sub="%"      color={mc.color}/>
                      <Gauge value={s.rr}           max={5}   label="Risk/Reward"   sub="ratio"  color={mc.color}/>
                      <Gauge value={s.profitFactor} max={5}   label="Profit Factor" sub="×"      color={mc.color}/>
                      <Gauge value={s.maxWinStreak} max={20}  label="Win Streak"    sub="trades" color={mc.color}/>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label:"Total P&L",    value:usd(Math.abs(s.totalPnl)), cls:clrCls(s.totalPnl), sub:s.totalPnl>=0?"Profit":"Loss" },
                      { label:"Total Trades", value:s.total,                   cls:"text-foreground",   sub:`${s.buys} buys · ${s.sells} sells` },
                      { label:"Avg Win",      value:usd(s.avgWin),             cls:"text-emerald-600 dark:text-emerald-400", sub:`${s.wins} winning` },
                      { label:"Avg Loss",     value:usd(s.avgLoss),            cls:"text-red-500",      sub:`${s.losses} losing` },
                    ].map(m=>(
                      <Card key={m.label} className="p-4">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                        <p className={cn("text-xl font-bold font-mono", m.cls)}>{m.value}</p>
                        {m.sub&&<p className="text-[10px] text-muted-foreground mt-0.5">{m.sub}</p>}
                      </Card>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label:"Gross Profit",     value:usd(s.grossProfit),        cls:"text-emerald-600 dark:text-emerald-400" },
                      { label:"Gross Loss",       value:usd(s.grossLoss),          cls:"text-red-500" },
                      { label:"Max Win Streak",   value:`${s.maxWinStreak}×`,      cls:"text-violet-500", sub:"consecutive wins" },
                      { label:"Max Loss Streak",  value:`${s.maxLossStreak}×`,     cls:"text-red-500",    sub:"consecutive losses" },
                    ].map(m=>(
                      <Card key={m.label} className="p-4">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                        <p className={cn("text-xl font-bold font-mono", m.cls)}>{m.value}</p>
                        {m.sub&&<p className="text-[10px] text-muted-foreground mt-0.5">{m.sub}</p>}
                      </Card>
                    ))}
                  </div>

                  {s.pnlCurve.length>1&&(
                    <Card>
                      <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Cumulative P&L Curve</CardTitle></CardHeader>
                      <CardContent className="pb-4">
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={s.pnlCurve} margin={{top:5,right:10,left:0,bottom:0}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                            <XAxis dataKey="n" tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={(v:any)=>"$"+Math.round(v)}/>
                            <Tooltip content={<ChartTooltip/>}/>
                            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3"/>
                            <Line type="monotone" dataKey="cumPnl" name="Cum P&L $" stroke={mc.color} strokeWidth={2} dot={false}/>
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {s.pnlCurve.length>0&&(
                      <Card>
                        <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Win vs Loss Distribution</CardTitle></CardHeader>
                        <CardContent className="pb-4">
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={s.pnlCurve}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                              <XAxis dataKey="n" tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false} tickFormatter={(v:any)=>"$"+Math.round(v)}/>
                              <Tooltip content={<ChartTooltip/>}/>
                              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3"/>
                              <Bar dataKey="pnl" name="P&L $" radius={[2,2,0,0]}>
                                {s.pnlCurve.map((d:any,i:number)=><Cell key={i} fill={d.pnl>=0?"#16a34a":"#ef4444"}/>)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                    {s.byMonthArr.length>0&&(
                      <Card>
                        <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Monthly P&L</CardTitle></CardHeader>
                        <CardContent className="pb-4">
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={s.byMonthArr}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                              <XAxis dataKey="month" tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={(v:any)=>"$"+Math.round(v)}/>
                              <Tooltip content={<ChartTooltip/>}/>
                              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3"/>
                              <Bar dataKey="pnl" name="Monthly P&L $" radius={[3,3,0,0]}>
                                {s.byMonthArr.map((d:any,i:number)=><Cell key={i} fill={d.pnl>=0?"#16a34a":"#ef4444"}/>)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-emerald-500/20">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Trophy className="h-4 w-4 text-emerald-500"/>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Best Trade</p>
                          {s.bestTrade?.mode&&<Badge variant="outline" className={cn("text-[10px] ml-auto", modeOf(s.bestTrade.mode).border, modeOf(s.bestTrade.mode).text)}>{s.bestTrade.mode}</Badge>}
                        </div>
                        <p className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{s.bestTrade?.symbol||"—"}</p>
                        <p className="text-sm font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">{s.bestTrade?.pnl!=null?"+"+usd(parseFloat(s.bestTrade.pnl)):"—"}</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-2">{s.bestTrade?.executed_at?fmtHKT(s.bestTrade.executed_at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" HKT":""}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-red-500/20">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingDown className="h-4 w-4 text-red-500"/>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Worst Trade</p>
                          {s.worstTrade?.mode&&<Badge variant="outline" className={cn("text-[10px] ml-auto", modeOf(s.worstTrade.mode).border, modeOf(s.worstTrade.mode).text)}>{s.worstTrade.mode}</Badge>}
                        </div>
                        <p className="text-3xl font-bold font-mono text-red-500">{s.worstTrade?.symbol||"—"}</p>
                        <p className="text-sm font-mono text-red-500 mt-0.5">{s.worstTrade?.pnl!=null?"-"+usd(Math.abs(parseFloat(s.worstTrade.pnl))):"—"}</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-2">{s.worstTrade?.executed_at?fmtHKT(s.worstTrade.executed_at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" HKT":""}</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )
            )}

            {/* ── BY SYMBOL ── */}
            {view==="symbols"&&(
              !s ? (
                <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No closed trade data for this mode.</CardContent></Card>
              ) : (
                <Card>
                  <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Performance by Symbol</CardTitle></CardHeader>
                  <CardContent className="pb-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b">
                          {["Symbol","Trades","Win Rate","Total P&L","Avg P&L","Rating"].map(h=>(
                            <th key={h} className="pb-2 text-left font-medium pr-4 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.bySymbolArr.map((r:any,i:number)=>{
                          const wr = r.trades ? (r.wins/r.trades)*100 : 0;
                          const avg = r.trades ? r.pnl/r.trades : 0;
                          return (
                            <tr key={i} className="border-b border-border/40 last:border-0">
                              <td className="py-3 pr-4 font-bold text-sm text-foreground">{r.symbol}</td>
                              <td className="py-3 pr-4 text-muted-foreground">{r.trades}</td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className={clrCls(wr-50)}>{wr.toFixed(0)}%</span>
                                  <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div style={{width:`${wr}%`}} className={cn("h-full rounded-full", wr>=50?"bg-emerald-500":"bg-red-500")}/>
                                  </div>
                                </div>
                              </td>
                              <td className={cn("py-3 pr-4 font-mono font-semibold", clrCls(r.pnl))}>{r.pnl>=0?"+":"-"}{usd(Math.abs(r.pnl))}</td>
                              <td className={cn("py-3 pr-4 font-mono", clrCls(avg))}>{avg>=0?"+":"-"}{usd(Math.abs(avg))}</td>
                              <td className="py-3">
                                <Badge variant="outline" className={cn("text-[10px]",
                                  r.pnl>0&&wr>=60 ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                                  r.pnl>0         ? "border-amber-500/30 text-amber-500" :
                                                    "border-red-500/30 text-red-500")}>
                                  {r.pnl>0&&wr>=60?"Strong":r.pnl>0?"OK":"Weak"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )
            )}

            {/* ── TIMING ── */}
            {view==="timing"&&(
              !s ? (
                <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No closed trade data for this mode.</CardContent></Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">P&L by Hour of Day</CardTitle></CardHeader>
                    <CardContent className="pb-4">
                      {s.byHourArr.length===0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Not enough data — timestamps come from live trade execution</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={s.byHourArr}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                            <XAxis dataKey="hour" tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={(h:number)=>`${h}:00`}/>
                            <YAxis tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={(v:any)=>"$"+Math.round(v)}/>
                            <Tooltip content={<ChartTooltip/>} labelFormatter={(h:any)=>`${h}:00`}/>
                            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3"/>
                            <Bar dataKey="pnl" name="P&L $" radius={[3,3,0,0]}>
                              {s.byHourArr.map((d:any,i:number)=><Cell key={i} fill={d.pnl>=0?"#16a34a":"#ef4444"}/>)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Trade Frequency by Hour</CardTitle></CardHeader>
                    <CardContent className="pb-4">
                      {s.byHourArr.length===0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Not enough data yet</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={s.byHourArr}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                            <XAxis dataKey="hour" tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={(h:number)=>`${h}:00`}/>
                            <YAxis tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false}/>
                            <Tooltip content={<ChartTooltip/>}/>
                            <Bar dataKey="trades" name="Trades" fill={mc.color} radius={[3,3,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )
            )}

            {/* ── ALL TRADES ── */}
            {view==="trades"&&(
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">
                    {activeMode==="all" ? `All Trades (${trades.length})` : `${mc.label} Trades (${trades.length})`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 overflow-x-auto">
                  {trades.length===0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No trades recorded for this mode yet.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b">
                          {["Symbol","Side","Mode","Notional","P&L","Status","Risk","Rationale","Time"].map(h=>(
                            <th key={h} className="pb-2 text-left font-medium pr-3 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((t:any,i:number)=>{
                          const tm = modeOf(t.mode||"all");
                          return (
                            <tr key={i} className="border-b border-border/40 last:border-0">
                              <td className="py-2.5 pr-3 font-bold text-foreground">{t.symbol}</td>
                              <td className="py-2.5 pr-3">
                                <Badge variant="outline" className={cn("text-[10px]", t.side==="buy"?"border-emerald-500/30 text-emerald-600 dark:text-emerald-400":"border-red-500/30 text-red-500")}>
                                  {t.side?.toUpperCase()}
                                </Badge>
                              </td>
                              <td className="py-2.5 pr-3">
                                {t.mode ? (
                                  <Badge variant="outline" className={cn("text-[10px]", tm.border, tm.text)}>{t.mode}</Badge>
                                ) : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="py-2.5 pr-3 font-mono text-muted-foreground">{t.notional?usd(parseFloat(t.notional)):"—"}</td>
                              <td className={cn("py-2.5 pr-3 font-mono font-semibold", t.pnl!=null?clrCls(parseFloat(t.pnl)):"text-muted-foreground/40")}>
                                {t.pnl!=null?(parseFloat(t.pnl)>=0?"+":"-")+usd(Math.abs(parseFloat(t.pnl))):"—"}
                              </td>
                              <td className="py-2.5 pr-3">
                                <Badge variant="outline" className={cn("text-[10px]",
                                  t.status==="filled" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                                  t.status==="canceled" ? "border-red-500/30 text-red-500" :
                                  "border-amber-500/30 text-amber-500")}>
                                  {t.status||"submitted"}
                                </Badge>
                              </td>
                              <td className="py-2.5 pr-3 text-muted-foreground capitalize">{t.risk||"—"}</td>
                              <td className="py-2.5 pr-3 text-muted-foreground/60 max-w-[160px] truncate">{t.rationale||"—"}</td>
                              <td className="py-2.5 text-muted-foreground/40 whitespace-nowrap">{t.executed_at?fmtHKT(t.executed_at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" HKT":"—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            )}

            <p className="text-center text-[10px] text-muted-foreground/30 mt-6">Claude Trader · JD Core Dev · Not financial advice</p>
          </>
        )}
      </div>
    </TraderLayout>
  );
}
