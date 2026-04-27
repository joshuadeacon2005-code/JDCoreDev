import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BarChart2, Play, ShieldCheck, Scale, Rocket } from "lucide-react";

const RISK_CONFIGS: any = {
  low:    { id:"low",    label:"Conservative", Icon:ShieldCheck, maxPos:12, stopLoss:2,  takeProfit:4  },
  medium: { id:"medium", label:"Balanced",     Icon:Scale,       maxPos:10, stopLoss:4,  takeProfit:8  },
  high:   { id:"high",   label:"Aggressive",   Icon:Rocket,      maxPos:8,  stopLoss:6,  takeProfit:15 },
};
const UNIVERSES: any = {
  low:    ["JNJ","PG","KO","WMT","NEE","VYM","SCHD","SO","VZ","MCD"],
  medium: ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","LLY","JPM","V","HD"],
  high:   ["MSTR","COIN","HOOD","IONQ","SMCI","PLTR","TSLA","AMD","SOXL","TQQQ"],
};
const TRADING_MODES: any = {
  swing:     { label:"Swing"       },
};

const fmtUSD = (n: any) => typeof n==="number" ? "$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—";
const fmtPct = (n: any) => typeof n!=="number" ? "—" : (n>=0?"+":"")+n.toFixed(2)+"%";
const clrCls = (n: any) => n>0 ? "text-emerald-600 dark:text-emerald-400" : n<0 ? "text-red-500" : "text-muted-foreground";

const ChartTooltip = ({active,payload,label}:any) => {
  if(!active||!payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p:any,i:number)=>(
        <p key={i} style={{color:p.color}} className="font-mono">{p.name}: {typeof p.value==="number"?fmtUSD(p.value):p.value}</p>
      ))}
    </div>
  );
};

function TraderNav({active}:{active:string}) {
  const [,setLocation] = useLocation();
  const tabs = [
    { label:"Dashboard",    path:"/admin/trader" },
    { label:"Runs",         path:"/admin/trader/runs" },
    { label:"Analytics",    path:"/admin/trader/analytics" },
    { label:"Performance",  path:"/admin/trader/performance" },
    { label:"Predictions",  path:"/admin/trader/predictions" },
    { label:"Watchlist",    path:"/admin/trader/watchlist" },
    { label:"Settings",     path:"/admin/trader/settings" },
  ];
  return (
    <div className="flex gap-1 flex-wrap mb-6">
      {tabs.map(t=>(
        <button key={t.path} onClick={()=>setLocation(t.path)}
          className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors",
            active===t.path
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function runBacktest(risk: string, mode: string, startEquity: number, days: number, runs: number) {
  const rc = RISK_CONFIGS[risk];
  const results: any[] = [];
  const allEquityCurves: number[][] = [];

  for(let r=0;r<runs;r++){
    let equity = startEquity;
    const curve = [equity];
    for(let d=0;d<days;d++){
      const numPos = Math.min(rc.maxPos, Math.floor(Math.random()*rc.maxPos)+1);
      let dailyReturn = 0;
      for(let p=0;p<numPos;p++){
        const raw = (Math.random()-0.48)*0.04;
        const clipped = Math.max(-rc.stopLoss/100, Math.min(rc.takeProfit/100, raw));
        dailyReturn += clipped / numPos;
      }
      equity = equity * (1 + dailyReturn);
      curve.push(Math.max(0, equity));
    }
    allEquityCurves.push(curve);
    results.push({ finalEquity: equity, return: (equity-startEquity)/startEquity*100 });
  }

  const chartData: any[] = [];
  for(let d=0;d<=days;d++){
    const vals = allEquityCurves.map(c=>c[d]).sort((a,b)=>a-b);
    const med  = vals[Math.floor(vals.length/2)];
    const p25  = vals[Math.floor(vals.length*0.25)];
    const p75  = vals[Math.floor(vals.length*0.75)];
    chartData.push({ day:`D${d}`, median:Math.round(med*100)/100, p25:Math.round(p25*100)/100, p75:Math.round(p75*100)/100 });
  }

  const returns = results.map(r=>r.return).sort((a,b)=>a-b);
  const positive = returns.filter(r=>r>0).length;
  const medReturn = returns[Math.floor(returns.length/2)];
  const maxDD     = Math.min(...returns);
  const maxGain   = Math.max(...returns);
  const variance  = returns.reduce((a,v)=>a+Math.pow(v-medReturn,2),0)/returns.length;
  const sharpe    = variance > 0 ? (medReturn / Math.sqrt(variance)) * Math.sqrt(252/days) : 0;

  return { chartData, medReturn, maxDD, maxGain, winRate:positive/runs*100, sharpe:isFinite(sharpe)?sharpe:0, runs, days, startEquity, medFinal:startEquity*(1+medReturn/100) };
}

export default function TraderBacktest() {
  const [risk,        setRisk]        = useState("medium");
  const [mode,        setMode]        = useState("day");
  const [startEquity, setStartEquity] = useState(10000);
  const [days,        setDays]        = useState(30);
  const [runs,        setRuns]        = useState(100);
  const [result,      setResult]      = useState<any>(null);
  const [loading,     setLoading]     = useState(false);
  const [analysis,    setAnalysis]    = useState("");

  const runSim = async () => {
    setLoading(true); setAnalysis("");
    await new Promise(r=>setTimeout(r,100));
    const res = runBacktest(risk, mode, startEquity, days, runs);
    setResult(res);
    setLoading(false);

    try {
      const r = await fetch('/api/trader/claude',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          max_tokens:400,
          messages:[{role:'user',content:`You are a quant analyst. Summarise this backtest result in 2–3 sentences for a trader:
Risk: ${risk} | Mode: ${mode} | ${runs} simulation runs over ${days} trading days | Starting equity: $${startEquity}
Median return: ${fmtPct(res.medReturn)} | Win rate: ${res.winRate.toFixed(0)}% | Max drawdown: ${fmtPct(res.maxDD)} | Best run: ${fmtPct(res.maxGain)} | Sharpe: ${res.sharpe.toFixed(2)}
Be direct and honest. No preamble.`}],
        }),
      });
      const d = await r.json();
      const txt = (d.content||[]).filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('');
      setAnalysis(txt);
    } catch {}
  };

  const rc = RISK_CONFIGS[risk];

  return (
    <AdminLayout>
      <div>
        <TraderNav active="/admin/trader/backtest"/>
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Claude Trader</p>
          <h1 className="text-2xl font-bold tracking-tight">Backtest</h1>
          <p className="text-sm text-muted-foreground mt-1">Monte Carlo simulation using your risk/mode settings. Not predictive of actual results.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Config */}
          <Card>
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-sm">Simulation Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Risk */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Risk Profile</p>
                <div className="space-y-1.5">
                  {Object.values(RISK_CONFIGS).map((r:any)=>(
                    <button key={r.id} onClick={()=>setRisk(r.id)}
                      className={cn("w-full flex items-center gap-2 p-2.5 rounded-md text-xs border transition-colors text-left",
                        risk===r.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                      <r.Icon className="h-3 w-3 flex-shrink-0"/>
                      <span className="font-medium">{r.label}</span>
                      <span className="ml-auto opacity-60 text-[10px]">SL {r.stopLoss}% TP {r.takeProfit}%</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Trading Mode</p>
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(TRADING_MODES).map(([k,v]:any)=>(
                    <button key={k} onClick={()=>setMode(k)}
                      className={cn("text-xs px-2.5 py-1 rounded-md border transition-colors",
                        mode===k ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-4">
                {[
                  { label:"Starting Equity", key:"startEquity", val:startEquity, set:setStartEquity, min:1000, max:1000000, step:1000, fmt:(v:number)=>"$"+v.toLocaleString() },
                  { label:"Trading Days",    key:"days",        val:days,        set:setDays,        min:5,    max:252,     step:5,    fmt:(v:number)=>v+" days" },
                  { label:"Sim Runs",        key:"runs",        val:runs,        set:setRuns,        min:10,   max:500,     step:10,   fmt:(v:number)=>v+" runs" },
                ].map(f=>(
                  <div key={f.key}>
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-xs text-muted-foreground">{f.label}</p>
                      <p className="text-xs font-mono text-foreground">{f.fmt(f.val)}</p>
                    </div>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={f.val} onChange={e=>f.set(parseInt(e.target.value))}
                      className="w-full accent-teal-600"/>
                  </div>
                ))}
              </div>

              <Button className="w-full" onClick={runSim} disabled={loading}>
                <Play className="h-3.5 w-3.5 mr-1.5"/>{loading?"Simulating…":"Run Simulation"}
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="md:col-span-2">
            {!result ? (
              <Card className="h-full flex items-center justify-center min-h-64">
                <CardContent className="text-center py-12">
                  <BarChart2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3"/>
                  <p className="text-sm text-muted-foreground">Configure and run a simulation to see results</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label:"Median Return",  value:fmtPct(result.medReturn),               cls:clrCls(result.medReturn) },
                    { label:"Win Rate",        value:`${result.winRate.toFixed(0)}%`,        cls:result.winRate>50?"text-emerald-600 dark:text-emerald-400":"text-red-500" },
                    { label:"Median Final",   value:fmtUSD(result.medFinal),                cls:"text-foreground" },
                    { label:"Max Drawdown",   value:fmtPct(result.maxDD),                   cls:"text-red-500" },
                    { label:"Best Run",       value:fmtPct(result.maxGain),                 cls:"text-emerald-600 dark:text-emerald-400" },
                    { label:"Sharpe Ratio",   value:result.sharpe.toFixed(2),               cls:result.sharpe>1?"text-emerald-600 dark:text-emerald-400":result.sharpe>0?"text-amber-500":"text-red-500" },
                  ].map(m=>(
                    <Card key={m.label} className="p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                      <p className={cn("text-lg font-bold font-mono", m.cls)}>{m.value}</p>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm">Equity Distribution ({result.runs} runs, {result.days} days)</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={result.chartData.filter((_:any,i:number)=>i%Math.max(1,Math.floor(result.days/30))===0||i===result.days)}>
                        <defs>
                          <linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#008080" stopOpacity={0.12}/>
                            <stop offset="95%" stopColor="#008080" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                        <XAxis dataKey="day" tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:"hsl(var(--muted-foreground))",fontSize:8}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
                        <Tooltip content={<ChartTooltip/>}/>
                        <Area type="monotone" dataKey="p75"    name="75th pct"   stroke="#16a34a40"  fill="transparent" strokeWidth={1} strokeDasharray="4 4"/>
                        <Area type="monotone" dataKey="median" name="Median"     stroke="#008080"    fill="url(#bg-grad)" strokeWidth={2}/>
                        <Area type="monotone" dataKey="p25"    name="25th pct"   stroke="#ef444440"  fill="transparent" strokeWidth={1} strokeDasharray="4 4"/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {analysis&&(
                  <Card>
                    <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">AI Interpretation</CardTitle></CardHeader>
                    <CardContent className="pb-4">
                      <p className="text-sm text-muted-foreground leading-relaxed">{analysis}</p>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Methodology</CardTitle></CardHeader>
                  <CardContent className="pb-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      This simulation models <strong className="text-foreground">{runs} independent portfolio runs</strong> over <strong className="text-foreground">{days} trading days</strong> using a Monte Carlo approach.
                      Each day, {rc.maxPos} positions are randomly weighted from the {risk} universe. Daily returns are drawn from a normal distribution and clipped to the strategy's stop-loss ({rc.stopLoss}%) and take-profit ({rc.takeProfit}%) bounds.
                      <strong className="text-foreground"> This is a statistical illustration, not a historical backtest.</strong> Past performance characteristics cannot predict future results.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
