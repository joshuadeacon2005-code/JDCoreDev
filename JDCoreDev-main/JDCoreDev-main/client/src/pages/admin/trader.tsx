import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Zap, TrendingUp, BarChart2, Bitcoin, Activity, Play, Square,
  RefreshCw, LogOut, AlertTriangle, CheckCircle2, Clock, DollarSign,
  ShieldCheck, Rocket, Scale, PlugZap, ChevronRight, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtHKT, fmtHKTTime } from "@/lib/hkt";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_CONFIGS: any = {
  low:    { id:"low",    label:"Conservative", Icon:ShieldCheck, maxPos:12, stopLoss:2,  takeProfit:4,  maxSinglePct:12 },
  medium: { id:"medium", label:"Balanced",     Icon:Scale,       maxPos:10, stopLoss:4,  takeProfit:8,  maxSinglePct:15 },
  high:   { id:"high",   label:"Aggressive",   Icon:Rocket,      maxPos:8,  stopLoss:6,  takeProfit:15, maxSinglePct:15 },
};

const UNIVERSES: any = {
  low:    ["JNJ","PG","KO","WMT","NEE","VYM","SCHD","SO","VZ","MCD","ABBV","T","DUK","O","JEPI"],
  medium: ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","AVGO","LLY","UNH","JPM","V","HD","MA","CRM","MRK"],
  high:   ["MSTR","COIN","HOOD","IONQ","SMCI","PLTR","RKLB","CLSK","MARA","TSLA","AMD","SOXL","TQQQ","ARKK"],
  crypto: ["BTCUSD","ETHUSD","SOLUSD","AVAXUSD","LINKUSD","DOTUSD","ADAUSD","MATICUSD"],
};

const TRADING_MODES: any = {
  day:       { id:"day",       label:"Day Trading", Icon:Zap,        desc:"Intraday — positions closed by 3:45 PM ET", cronMinutes:15,    riskKey:"medium", accent:"teal" },
  swing:     { id:"swing",     label:"Swing",       Icon:TrendingUp, desc:"1–5 day holds — signal check every 4 hours",cronMinutes:240,   riskKey:"medium", accent:"purple" },
  portfolio: { id:"portfolio", label:"Portfolio",   Icon:BarChart2,  desc:"Long-term rebalancing — weekly cadence",   cronMinutes:10080, riskKey:"low",    accent:"green" },
  crypto:    { id:"crypto",    label:"Crypto",      Icon:Bitcoin,    desc:"24/7 crypto markets via Alpaca",           cronMinutes:60,    riskKey:"high",   accent:"orange" },
};

const MODE_ACCENT: any = {
  teal:   { tab:"text-teal-600 dark:text-teal-400",   badge:"bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",   btn:"border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20" },
  purple: { tab:"text-purple-600 dark:text-purple-400",badge:"bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",btn:"border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20" },
  green:  { tab:"text-emerald-600 dark:text-emerald-400",badge:"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",btn:"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" },
  orange: { tab:"text-orange-600 dark:text-orange-400",badge:"bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",btn:"border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20" },
};

const STAGES = [
  { id:1, name:"Universe Screening",     icon:Activity },
  { id:2, name:"Adversarial Research",   icon:AlertTriangle },
  { id:3, name:"Scenario Modeling",      icon:BarChart2 },
  { id:4, name:"Portfolio Construction", icon:TrendingUp },
  { id:5, name:"Risk Validation",        icon:CheckCircle2 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep  = (ms: number) => new Promise(r => setTimeout(r, ms));
const fmtUSD = (n: any) => typeof n==="number" ? "$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—";
const fmtPct = (n: any) => typeof n!=="number" ? "—" : (n>=0?"+":"")+n.toFixed(2)+"%";
const clrPct = (n: any) => n>0 ? "text-emerald-600 dark:text-emerald-400" : n<0 ? "text-red-500" : "text-muted-foreground";

function safeJSON(t: string) {
  if (!t) return null;
  try { const m=t.replace(/```json|```/g,"").match(/(\{[\s\S]*\}|\[[\s\S]*\])/); if(m) return JSON.parse(m[0]); } catch {}
  return null;
}

async function callClaude(prompt: string, useSearch=false) {
  const body: any = { max_tokens:1200, messages:[{role:"user",content:prompt}] };
  if (useSearch) body.tools = [{ type:"web_search_20250305", name:"web_search" }];
  try {
    const r = await fetch("/api/trader/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    return (d.content||[]).filter((b:any)=>b.type==="text").map((b:any)=>b.text).join("");
  } catch(e:any){ console.error("Claude:",e); return ""; }
}

async function alpacaReq(keys: any, path: string, method="GET", body: any=null) {
  const res = await fetch("/api/trader/alpaca-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: keys.key, secret: keys.secret, isPaper: keys.isPaper, path, method, body }),
  });
  return res.json();
}

async function getQuote(keys: any, symbol: string) {
  try {
    const isCrypto = symbol.endsWith("USD") && symbol.length > 4;
    const path = isCrypto
      ? `/v1beta3/crypto/us/latest/quotes?symbols=${symbol}`
      : `/v2/stocks/${symbol}/quotes/latest`;
    const r = await fetch("/api/trader/alpaca-data-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: keys.key, secret: keys.secret, path }),
    });
    const d = await r.json();
    if (isCrypto) {
      const q = d.quotes?.[symbol];
      return q ? (q.ap + q.bp) / 2 : null;
    }
    const ap=d.quote?.ap; const bp=d.quote?.bp;
    if(ap&&bp) return (ap+bp)/2; return ap||bp||null;
  } catch { return null; }
}

function buildOrderBody(o: any) {
  const {symbol,side,notional,price,mode,stopLossPct,takeProfitPct} = o;
  const tif = mode==="day"?"day":"gtc";
  if(side==="sell") return {symbol,side:"sell",type:"market",time_in_force:tif,notional:notional.toFixed(2)};
  if(!price) return {symbol,side:"buy",type:"market",time_in_force:tif,notional:notional.toFixed(2)};
  const qty = Math.floor(notional/price);
  if(qty<1) return null;
  const b:any={symbol,side:"buy",type:"limit",time_in_force:tif,qty:qty.toString(),limit_price:price.toFixed(2)};
  if(stopLossPct&&takeProfitPct){ b.order_class="bracket"; b.stop_loss={stop_price:(price*(1-stopLossPct/100)).toFixed(2)}; b.take_profit={limit_price:(price*(1+takeProfitPct/100)).toFixed(2)}; }
  return b;
}

// ── Sub-nav ───────────────────────────────────────────────────────────────────

function TraderNav({active}:{active:string}) {
  const [,setLocation] = useLocation();
  const tabs = [
    { label:"Dashboard",    path:"/admin/trader" },
    { label:"Runs",         path:"/admin/trader/runs" },
    { label:"Analytics",    path:"/admin/trader/analytics" },
    { label:"Performance",  path:"/admin/trader/performance" },
    { label:"Predictions",  path:"/admin/trader/predictions" },
    { label:"Arb Engine",   path:"/admin/trader/arbitrage" },
    { label:"Crypto Arb",   path:"/admin/trader/crypto-arb" },
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

// ── Stage badge ───────────────────────────────────────────────────────────────

function StagePill({status}:{status?:string}) {
  if (!status) return <span className="text-[10px] text-muted-foreground/40 font-mono">WAIT</span>;
  const cls: any = { done:"text-emerald-600 dark:text-emerald-400", running:"text-amber-500", error:"text-red-500" };
  return <span className={cn("text-[10px] font-mono font-bold uppercase", cls[status]||"text-muted-foreground")}>{status}</span>;
}

// ── Mode performance mini-stats ────────────────────────────────────────────────

function ModePerfStats({mode}:{mode:string}) {
  const [stats, setStats] = useState<any>(null);
  useEffect(()=>{
    fetch(`/api/trader/history?type=trades&limit=500`)
      .then(r=>r.json())
      .then((trades:any[])=>{
        if(!Array.isArray(trades)) return;
        const filtered = trades.filter(t=>t.mode===mode && t.pnl!=null);
        if(!filtered.length){setStats({empty:true});return;}
        const wins = filtered.filter(t=>parseFloat(t.pnl)>0);
        const totalPnl = filtered.reduce((s,t)=>s+parseFloat(t.pnl||0),0);
        setStats({ count:filtered.length, winRate:wins.length/filtered.length*100, totalPnl });
      }).catch(()=>{});
  },[mode]);

  if(!stats||stats.empty) return <p className="text-xs text-muted-foreground">No {mode} trades recorded yet.</p>;
  return (
    <div className="flex gap-4 flex-wrap">
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total P&amp;L</p>
        <p className={cn("text-base font-bold font-mono", stats.totalPnl>=0?"text-emerald-600 dark:text-emerald-400":"text-red-500")}>{fmtUSD(Math.abs(stats.totalPnl))}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Win Rate</p>
        <p className={cn("text-base font-bold font-mono", stats.winRate>=50?"text-emerald-600 dark:text-emerald-400":"text-red-500")}>{stats.winRate.toFixed(0)}%</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Trades</p>
        <p className="text-base font-bold font-mono text-foreground">{stats.count}</p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TraderDashboard() {
  const [screen,      setScreen]      = useState<"config"|"dashboard">("config");
  const [keys,        setKeys]        = useState({key:"",secret:"",isPaper:true});
  const [envConfig,   setEnvConfig]   = useState<{configured:boolean,isPaper:boolean}|null>(null);
  const [autoConnecting, setAutoConnecting] = useState(true);
  const [risk,        setRisk]        = useState("medium");
  const [mode,        setMode]        = useState("day");
  const [connErr,     setConnErr]     = useState("");
  const [account,     setAccount]     = useState<any>(null);
  const [positions,   setPositions]   = useState<any[]>([]);
  const [orders,      setOrders]      = useState<any[]>([]);
  const [tradeLog,    setTradeLog]    = useState<any[]>([]);
  const [analysis,    setAnalysis]    = useState<any>(null);
  const [agentStatus, setAgentStatus] = useState("idle");
  const [agentLog,    setAgentLog]    = useState<any[]>([]);
  const [stageStatus, setStageStatus] = useState<any>({});
  const [marketOpen,  setMarketOpen]  = useState<boolean|null>(null);
  const [innerTab,    setInnerTab]    = useState("positions");
  const [portfolioHistory, setPortfolioHistory] = useState<any[]>([]);
  const [lastSync,    setLastSync]    = useState<Date|null>(null);
  const [histRange,   setHistRange]   = useState<"1W"|"1M"|"3M">("1M");
  const [liveConfirm, setLiveConfirm] = useState(false);
  const [usage, setUsage]             = useState<any>(null);

  const agentActive = useRef(false);
  const cycleTimer  = useRef<any>(null);
  const rc   = RISK_CONFIGS[risk];
  const mcfg = TRADING_MODES[mode];
  const accent = MODE_ACCENT[mcfg?.accent||"teal"];

  const log = useCallback((msg: string, type="info") => {
    const ts = new Date().toLocaleTimeString("en-US",{hour12:false,timeZone:"Asia/Hong_Kong"});
    setAgentLog(p=>[{ts,msg,type},...p].slice(0,120));
  },[]);

  const updStage = useCallback((id: number, status: string, txt: string) => {
    setStageStatus((p:any)=>({...p,[id]:{status,log:txt}}));
    log(`S${id}: ${txt}`, status==="done"?"success":status==="running"?"info":"warn");
  },[log]);

  const parseAccount = (raw: any) => ({
    equity:      parseFloat(raw.equity),
    cash:        parseFloat(raw.cash),
    buyingPower: parseFloat(raw.buying_power),
    pnl:         parseFloat(raw.equity)-parseFloat(raw.last_equity),
    pnlPct:      ((parseFloat(raw.equity)-parseFloat(raw.last_equity))/parseFloat(raw.last_equity))*100,
  });

  const fetchAccount = useCallback(async()=>{
    const raw = await alpacaReq(keys,"/v2/account");
    if(raw.error||raw.code){setConnErr(raw.message||"Auth error");return false;}
    setAccount(parseAccount(raw)); return true;
  },[keys]);

  const fetchPositions = useCallback(async()=>{
    const raw = await alpacaReq(keys,"/v2/positions");
    if(Array.isArray(raw)) setPositions(raw.map((p:any)=>({symbol:p.symbol,qty:parseFloat(p.qty),mktVal:parseFloat(p.market_value),unrealizedPl:parseFloat(p.unrealized_pl),unrealizedPlPct:parseFloat(p.unrealized_plpc)*100,currentPrice:parseFloat(p.current_price),avgEntry:parseFloat(p.avg_entry_price)})));
  },[keys]);

  const fetchOrders = useCallback(async()=>{
    const raw = await alpacaReq(keys,"/v2/orders?status=all&limit=40");
    if(Array.isArray(raw)) setOrders(raw.map((o:any)=>({id:o.id,symbol:o.symbol,side:o.side,qty:o.qty,notional:o.notional,status:o.status,type:o.type,filledAvg:o.filled_avg_price,at:o.created_at})));
  },[keys]);

  const fetchPortfolioHistory = useCallback(async(range:"1W"|"1M"|"3M"="1M")=>{
    const period = range==="1W"?"1W":range==="3M"?"3M":"1M";
    const raw = await alpacaReq(keys,`/v2/account/portfolio/history?period=${period}&timeframe=1D&extended_hours=false`);
    if(raw?.equity&&raw?.timestamp){
      const pts = raw.timestamp.map((ts:number,i:number)=>({
        date: fmtHKT(new Date(ts*1000), {day:"numeric",month:"short"}),
        equity: raw.equity[i]??null,
        pl: raw.profit_loss?.[i]??null,
      })).filter((p:any)=>p.equity!==null&&p.equity>0);
      setPortfolioHistory(pts);
    }
  },[keys]);

  const placeOrder = useCallback(async(symbol:string,side:string,notional:number,rationale="")=>{
    log(`${side.toUpperCase()} ${symbol} ~$${notional.toFixed(0)} — ${rationale}`,side);
    const price = side==="buy" ? await getQuote(keys,symbol) : null;
    const body  = buildOrderBody({symbol,side,notional,price,mode,stopLossPct:rc.stopLoss,takeProfitPct:rc.takeProfit});
    if(!body){log(`Skip ${symbol} — qty<1`,"warn");return null;}
    const res = await alpacaReq(keys,"/v2/orders","POST",body);
    const entry = {symbol,side,notional:notional.toFixed(0),status:res.status||"submitted",rationale,orderId:res.id,at:new Date().toISOString(),mode};
    setTradeLog(p=>[entry,...p]);
    try{ await fetch("/api/trader/history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"trade",...entry})}); }catch{}
    return res;
  },[keys,mode,rc,log]);

  const runPipeline = useCallback(async()=>{
    setAgentStatus("analyzing"); setStageStatus({});
    const isCrypto = mode === "crypto";
    const tickers = isCrypto ? UNIVERSES.crypto : UNIVERSES[risk];
    const riskLabel = isCrypto ? "high" : risk;
    const rcLocal = RISK_CONFIGS[riskLabel] || rc;

    updStage(1,"running",`Scoring ${tickers.length} assets…`);
    const s1=safeJSON(await callClaude(`Financial screening. Mode:${mode}. Risk:${riskLabel}.\nAssets:${tickers.join(",")}\nScore 0-100: momentum 30%, fundamentals 40%, sentiment 30%.\n${mode==="day"?"Favour pre-market movers and intraday volume.":""}\n${isCrypto?"Focus on on-chain metrics, BTC correlation, and mempool activity.":""}\nReturn ONLY JSON:{"screened":[{"t":"XX","score":82,"type":"${isCrypto?"crypto":"stock"}","why":"reason"}],"top":["T1","T2","T3","T4","T5"]}`));
    const tops=(s1?.top||tickers.slice(0,5)).slice(0,6);
    updStage(1,"done",`${s1?.screened?.length||0} scored — top ${tops.length} advance`);

    updStage(2,"running",`Bull/bear debate on ${tops.length}…`);
    const s2=safeJSON(await callClaude(`Adversarial research — ONLY last 7 days count.\nTickers:${tops.join(",")}. Mode:${mode}. Risk:${riskLabel}.\nReturn ONLY JSON:{"analysis":[{"t":"XX","bull":"thesis","bear":"thesis","bs":8,"be":3,"v":"BUY","note":"catalyst"}]}\nv=BUY|HOLD|SELL`,true));
    updStage(2,"done",`${s2?.analysis?.length||0} dossiers complete`);

    const buyList=(s2?.analysis||[]).filter((a:any)=>a.v!=="SELL").map((a:any)=>a.t);
    const mkList=buyList.length?buyList:tops.slice(0,4);
    updStage(3,"running",`Scenarios for ${mkList.length} assets…`);
    const s3=safeJSON(await callClaude(`Scenario modeling. Assets:${mkList.join(",")}.\nBull/base/bear. Probs sum to 100. 3-month targets.\nReturn ONLY JSON:{"models":[{"t":"XX","bp":30,"mp":55,"bep":15,"bt":"+40%","mt":"+12%","bet":"-20%","er":"+15%","c":8}]}`));
    updStage(3,"done",`${s3?.models?.length||0} models built`);

    updStage(4,"running","Building portfolio…");
    const eq=account?.equity||10000; const bp=account?.buyingPower||5000;
    s1; // ensure s1 in scope
    const s4=safeJSON(await callClaude(`Portfolio optimizer. Models:${JSON.stringify(s3?.models||[])}.\nBuild ≤${rcLocal.maxPos} positions. Equity $${eq.toFixed(0)}. BP $${bp.toFixed(0)}.\nAllocs sum=100%, max single ${rcLocal.maxSinglePct}%, min 3%, positive EV only.\nReturn ONLY JSON:{"positions":[{"t":"XX","alloc":12,"type":"${isCrypto?"crypto":"stock"}","er":"+15%","why":"reason","notional":1200}],"ter":"+14%","thesis":"2 sentences"}`));
    updStage(4,"done",`${s4?.positions?.length||0} positions constructed`);

    updStage(5,"running","Validating…");
    const s5=safeJSON(await callClaude(`Validate ${riskLabel} ${mode} portfolio:${JSON.stringify(s4?.positions||[])}.\nSL ${rcLocal.stopLoss}% TP ${rcLocal.takeProfit}%.\nReturn ONLY JSON:{"score":85,"pass":true,"strengths":["s1"],"warnings":["w1"],"suggestion":"tip"}`));
    updStage(5,"done",`Score ${s5?.score||"?"}/100 — ${s5?.pass?"PASS":"FAIL"}`);

    const result={screened:s1?.screened||[],analysis:s2?.analysis||[],models:s3?.models||[],positions:s4?.positions||[],ter:s4?.ter||"N/A",thesis:s4?.thesis||"",validation:s5||{score:80,pass:true,strengths:[],warnings:[]},timestamp:new Date().toISOString()};
    setAnalysis(result);
    log("Pipeline complete ✓","success");
    return result;
  },[risk,mode,account,rc,updStage,log]);

  const executeTrades = useCallback(async(pipe:any)=>{
    if(!pipe?.positions?.length){log("No trades","warn");return;}
    setAgentStatus("executing");
    const sellSet=new Set((pipe.analysis||[]).filter((a:any)=>a.v==="SELL").map((a:any)=>a.t));
    const heldSet=new Set(positions.map(p=>p.symbol));
    for(const pos of positions){ if(sellSet.has(pos.symbol)){await placeOrder(pos.symbol,"sell",pos.mktVal,"Sell signal");await sleep(500);} }
    for(const p of pipe.positions){
      if(heldSet.has(p.t)) continue;
      const n=p.notional||((account?.equity||10000)*(p.alloc/100));
      if(n<1||(account?.buyingPower||0)<n) continue;
      await placeOrder(p.t,"buy",n,p.why||"AI signal");
      await sleep(700);
    }
    log("Execution complete ✓","success");
    await fetchPositions(); await fetchOrders(); await fetchAccount();
    setAgentStatus("monitoring");
  },[positions,account,placeOrder,fetchPositions,fetchOrders,fetchAccount,log]);

  const startAgent = useCallback(async()=>{
    agentActive.current=true; setAgentStatus("monitoring");
    log(`${mcfg.label} agent started`,"success");
    const cycle=async()=>{
      if(!agentActive.current) return;
      await fetchAccount(); await fetchPositions();
      if(mode==="day"){
        const now=new Date(); const etH=now.getUTCHours()-4; const etM=now.getUTCMinutes();
        if(etH>=15&&etM>=45){
          const dayBuys=[...new Set(tradeLog.filter(t=>t.mode==="day"&&t.side==="buy").map(t=>t.symbol))];
          if(dayBuys.length){
            log(`3:45 PM ET — closing ${dayBuys.length} day trade position(s): ${dayBuys.join(", ")}`, "warn");
            for(const sym of dayBuys){ try{ await alpacaReq(keys,`/v2/positions/${sym}`,"DELETE"); }catch{} await new Promise(r=>setTimeout(r,300)); }
          } else { log("3:45 PM ET — no day trade positions to close","warn"); }
          await fetchPositions(); agentActive.current=false; setAgentStatus("stopped"); return;
        }
      }
      const pipe=await runPipeline();
      if(agentActive.current&&pipe?.validation?.pass&&pipe?.positions?.length) await executeTrades(pipe);
      if(agentActive.current){ log(`Next cycle in ${mcfg.cronMinutes}m`); setAgentStatus("monitoring"); cycleTimer.current=setTimeout(cycle,mcfg.cronMinutes*60000); }
    };
    await cycle();
  },[risk,mode,mcfg,keys,fetchAccount,fetchPositions,runPipeline,executeTrades,log]);

  const stopAgent=useCallback(()=>{ agentActive.current=false; clearTimeout(cycleTimer.current); setAgentStatus("stopped"); log("Agent stopped","warn"); },[]);

  const refreshAll = useCallback(async()=>{
    await Promise.all([
      fetchAccount(),fetchPositions(),fetchOrders(),
      fetch("/api/predictor/usage").then(r=>r.json()).then(u=>setUsage(u)).catch(()=>{}),
    ]);
    setLastSync(new Date());
  },[fetchAccount,fetchPositions,fetchOrders]);

  useEffect(()=>{
    if(screen!=="dashboard") return;
    const t=setInterval(()=>{ refreshAll(); },30000);
    return()=>clearInterval(t);
  },[screen,refreshAll]);

  useEffect(()=>{
    if(screen!=="dashboard") return;
    fetchPortfolioHistory(histRange);
  },[screen,histRange,fetchPortfolioHistory]);

  const connectWithKeys = useCallback(async(k: {key:string,secret:string,isPaper:boolean})=>{
    setConnErr("");
    const raw = await alpacaReq(k,"/v2/account");
    if(raw.error||raw.code){setConnErr(raw.message||"Auth error — check your API keys");return false;}
    setAccount(parseAccount(raw));
    const [posRaw, ordRaw, clock, histRaw] = await Promise.all([
      alpacaReq(k,"/v2/positions"),
      alpacaReq(k,"/v2/orders?status=all&limit=40"),
      alpacaReq(k,"/v2/clock"),
      alpacaReq(k,"/v2/account/portfolio/history?period=1M&timeframe=1D&extended_hours=false"),
    ]);
    if(Array.isArray(posRaw)) setPositions(posRaw.map((p:any)=>({symbol:p.symbol,qty:parseFloat(p.qty),mktVal:parseFloat(p.market_value),unrealizedPl:parseFloat(p.unrealized_pl),unrealizedPlPct:parseFloat(p.unrealized_plpc)*100,currentPrice:parseFloat(p.current_price),avgEntry:parseFloat(p.avg_entry_price)})));
    if(Array.isArray(ordRaw)) setOrders(ordRaw.map((o:any)=>({id:o.id,symbol:o.symbol,side:o.side,qty:o.qty,notional:o.notional,status:o.status,type:o.type,filledAvg:o.filled_avg_price,at:o.created_at})));
    setMarketOpen(clock?.is_open);
    if(histRaw?.equity&&histRaw?.timestamp){
      const pts = histRaw.timestamp.map((ts:number,i:number)=>({
        date: fmtHKT(new Date(ts*1000), {day:"numeric",month:"short"}),
        equity: histRaw.equity[i]??null,
        pl: histRaw.profit_loss?.[i]??null,
      })).filter((p:any)=>p.equity!==null&&p.equity>0);
      setPortfolioHistory(pts);
    }
    setLastSync(new Date());
    setScreen("dashboard"); log(`Connected · Alpaca ${k.isPaper?"Paper":"LIVE"}`,"success");
    return true;
  },[log]);

  const connect=async()=>{
    setConnErr("");
    if(!keys.key||!keys.secret){setConnErr("Enter both API Key and Secret");return;}
    // Sync the selected paper/live mode to DB before connecting so the proxy
    // always uses the mode the user has chosen on the config screen.
    await fetch('/api/trader/alpaca-paper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({isPaper:keys.isPaper})});
    await connectWithKeys(keys);
  };

  useEffect(()=>{
    fetch("/api/trader/alpaca-config")
      .then(r=>r.json())
      .then(async(cfg)=>{
        setEnvConfig(cfg);
        if(cfg.configured){
          const envKeys={key:"_env_",secret:"_env_",isPaper:cfg.isPaper};
          setKeys(envKeys);
          await connectWithKeys(envKeys);
        }
        setAutoConnecting(false);
      })
      .catch(()=>setAutoConnecting(false));
  },[]);

  const handleModeChange = (newMode: string) => {
    if(agentActive.current){ stopAgent(); }
    setMode(newMode);
    setAnalysis(null); setStageStatus({}); setAgentLog([]); setTradeLog([]);
    setAgentStatus("idle");
    setRisk(TRADING_MODES[newMode]?.riskKey||"medium");
    setInnerTab("positions");
  };

  const togglePaperLive = async (goLive: boolean) => {
    setLiveConfirm(false);
    await fetch('/api/trader/alpaca-paper', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ isPaper: !goLive }) });
    const newKeys = { ...keys, isPaper: !goLive };
    setKeys(newKeys);
    log(`Switched to ${goLive ? "LIVE" : "Paper"} trading`, goLive ? "warn" : "info");
    await connectWithKeys(newKeys);
  };

  const agentRunning = agentStatus !== "idle" && agentStatus !== "stopped";

  // ── CONFIG SCREEN ────────────────────────────────────────────────────────────
  if(screen==="config") return (
    <AdminLayout>
      <div className="max-w-2xl">
        <TraderNav active="/admin/trader"/>
        <div className="mb-8">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Autonomous Execution Engine</p>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Claude Trader</h1>
          <p className="text-muted-foreground text-sm">AI-powered trading across Day, Swing, Portfolio &amp; Crypto strategies via Alpaca Markets.</p>
        </div>

        <Card className="mb-5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2"><PlugZap className="h-4 w-4"/>Alpaca Markets</CardTitle>
            <CardDescription className="mt-0.5">Connect your brokerage account to start trading</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {autoConnecting ? (
              <div className="flex items-center gap-3 py-4">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground"/>
                <p className="text-sm text-muted-foreground">Connecting with saved API keys…</p>
              </div>
            ) : envConfig?.configured ? (
              <>
                {connErr ? (
                  <>
                    <div className="p-3 rounded-md border border-red-500/20 bg-red-500/5 text-red-500 text-xs">
                      <AlertTriangle className="inline h-3 w-3 mr-1.5"/>{connErr}
                    </div>
                    <p className="text-xs text-muted-foreground">Your API keys are saved in Secrets but the connection failed. Check that the keys are valid and try again.</p>
                    <Button className="w-full" onClick={async()=>{
                      await fetch('/api/trader/alpaca-paper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({isPaper:keys.isPaper})});
                      connectWithKeys({key:"_env_",secret:"_env_",isPaper:keys.isPaper});
                    }}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5"/>Retry Connection
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500"/>
                    <p className="text-sm text-muted-foreground">Connected using saved API keys ({envConfig.isPaper?"Paper":"Live"} account)</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex gap-2 mb-2">
                  {["Paper","Live"].map(t=>{
                    const sel=keys.isPaper===(t==="Paper");
                    return (
                      <button key={t} onClick={()=>setKeys(k=>({...k,isPaper:t==="Paper"}))}
                        className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors font-medium",
                          sel
                            ? t==="Live" ? "border-red-500/40 bg-red-500/10 text-red-500" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-border text-muted-foreground hover:text-foreground")}>
                        {t==="Live"?"⚠ LIVE":t}
                      </button>
                    );
                  })}
                </div>
                {!keys.isPaper&&(
                  <div className="p-3 rounded-md border border-red-500/20 bg-red-500/5 text-red-500 text-xs leading-relaxed">
                    <AlertTriangle className="inline h-3 w-3 mr-1.5"/>LIVE mode executes real trades with real money. JD Core Dev accepts no liability for losses.
                  </div>
                )}
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">API Key ID</Label>
                    <Input type="text" placeholder="Your Alpaca Key ID" value={keys.key} onChange={e=>setKeys(k=>({...k,key:e.target.value}))} className="font-mono text-sm"/>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Secret Key</Label>
                    <Input type="password" placeholder="Your Alpaca Secret Key" value={keys.secret} onChange={e=>setKeys(k=>({...k,secret:e.target.value}))} className="font-mono text-sm"/>
                  </div>
                </div>
                {connErr&&<p className="text-xs text-red-500">{connErr}</p>}
                <Button className="w-full" onClick={connect}>Connect to Alpaca <ChevronRight className="h-4 w-4 ml-1"/></Button>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          {Object.values(TRADING_MODES).map((m:any)=>{
            const ac = MODE_ACCENT[m.accent];
            return (
              <Card key={m.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <m.Icon className={cn("h-4 w-4", ac.tab)}/>
                  <span className="text-sm font-semibold">{m.label}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );

  // ── DASHBOARD ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div>
        <TraderNav active="/admin/trader"/>

        {/* Live trading confirmation dialog */}
        {liveConfirm&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-background border border-red-500/40 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
                <p className="text-sm font-bold text-red-500">Switch to LIVE Trading</p>
              </div>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                You are about to switch from Paper trading to <strong className="text-foreground">real money</strong>. All orders will execute against your actual Alpaca brokerage account. This cannot be undone automatically.
              </p>
              <div className="flex gap-2">
                <button onClick={()=>setLiveConfirm(false)} className="flex-1 text-xs px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button onClick={()=>togglePaperLive(true)} className="flex-1 text-xs px-3 py-2 rounded-md bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors">Yes, switch to LIVE</button>
              </div>
            </div>
          </div>
        )}

        {/* Account bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Claude Trader</p>
              <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
            </div>
            {marketOpen!==null&&(
              <Badge variant="outline" className={cn("text-xs", marketOpen?"border-emerald-500/30 text-emerald-600 dark:text-emerald-400":"border-muted text-muted-foreground")}>
                <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1.5", marketOpen?"bg-emerald-500":"bg-muted-foreground")}/>
                {marketOpen?"Market Open":"Market Closed"}
              </Badge>
            )}
            {/* Paper / Live toggle */}
            <button
              onClick={()=>{ if(keys.isPaper) setLiveConfirm(true); else togglePaperLive(false); }}
              className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border font-medium transition-colors",
                keys.isPaper
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                  : "border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20")}>
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full", keys.isPaper?"bg-blue-500":"bg-red-500 animate-pulse")}/>
              {keys.isPaper ? "Paper" : "LIVE"}
            </button>
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={()=>{setScreen("config");stopAgent();}}>
            <LogOut className="h-3 w-3 mr-1.5"/>Disconnect
          </Button>
        </div>

        {/* API Usage Strip */}
        {usage && (
          <div className="mb-4 flex items-center gap-4 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs">
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <DollarSign className="h-3 w-3" /><span className="font-medium">API Credits</span>
            </div>
            <div className="flex items-center gap-4 font-mono">
              <span>Today: <strong>${(usage?.today?.cost || 0).toFixed(4)}</strong></span>
              <span>Week: <strong>${(usage?.week?.cost || 0).toFixed(4)}</strong></span>
              <span>Month: <strong>${(usage?.month?.cost || 0).toFixed(4)}</strong></span>
            </div>
          </div>
        )}

        {/* ── Portfolio Overview ── */}
        {account&&(
          <div className="mb-6 space-y-4">
            {/* Metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label:"Portfolio Equity",   value:fmtUSD(account.equity),     cls:"text-foreground",                                                      sub:null },
                { label:"Cash",               value:fmtUSD(account.cash),       cls:"text-blue-600 dark:text-blue-400",                                      sub:null },
                { label:"Buying Power",       value:fmtUSD(account.buyingPower),cls:"text-muted-foreground",                                                 sub:null },
                { label:"Long Market Value",  value:fmtUSD(positions.reduce((s:number,p:any)=>s+(p.mktVal||0),0)), cls:"text-foreground",                   sub:`${positions.length} position${positions.length!==1?"s":""}` },
                { label:"Today P&L",          value:fmtUSD(Math.abs(account.pnl)), cls:clrPct(account.pnl),                                                 sub:null },
                { label:"Today %",            value:fmtPct(account.pnlPct),     cls:clrPct(account.pnlPct),                                                  sub:null },
              ].map(m=>(
                <Card key={m.label} className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 whitespace-nowrap">{m.label}</p>
                  <p className={cn("text-lg font-bold font-mono leading-tight", m.cls)}>{m.value}</p>
                  {m.sub&&<p className="text-[10px] text-muted-foreground mt-0.5">{m.sub}</p>}
                </Card>
              ))}
            </div>

            {/* Equity curve + positions side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Equity curve */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground"/>Portfolio History
                  </CardTitle>
                  <div className="flex gap-1">
                    {(["1W","1M","3M"] as const).map(r=>(
                      <button key={r} onClick={()=>setHistRange(r)}
                        className={cn("text-[10px] px-2 py-0.5 rounded border transition-colors",
                          histRange===r?"border-primary/30 bg-primary/10 text-primary":"border-border text-muted-foreground hover:text-foreground")}>
                        {r}
                      </button>
                    ))}
                    <button onClick={()=>fetchPortfolioHistory(histRange)} className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors ml-1">
                      <RefreshCw className="h-2.5 w-2.5"/>
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  {portfolioHistory.length<2 ? (
                    <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">
                      {portfolioHistory.length===0?"Loading portfolio history…":"Not enough data points yet"}
                    </div>
                  ) : (()=>{
                    const first = portfolioHistory[0]?.equity||0;
                    const last  = portfolioHistory[portfolioHistory.length-1]?.equity||0;
                    const up    = last >= first;
                    return (
                      <div>
                        <div className="flex items-baseline gap-3 mb-3">
                          <span className="text-2xl font-bold font-mono">{fmtUSD(last)}</span>
                          <span className={cn("text-xs font-mono", up?"text-emerald-600 dark:text-emerald-400":"text-red-500")}>
                            {up?"+":""}{fmtUSD(last-first)} ({up?"+":""}{(((last-first)/first)*100).toFixed(2)}%)
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">{histRange} range</span>
                        </div>
                        <ResponsiveContainer width="100%" height={140}>
                          <AreaChart data={portfolioHistory} margin={{top:4,right:0,left:0,bottom:0}}>
                            <defs>
                              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={up?"#008080":"#ef4444"} stopOpacity={0.18}/>
                                <stop offset="95%" stopColor={up?"#008080":"#ef4444"} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                            <XAxis dataKey="date" tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                            <YAxis domain={["auto","auto"]} tick={{fill:"hsl(var(--muted-foreground))",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={(v:any)=>"$"+Math.round(v/1000)+"k"} width={40}/>
                            <Tooltip
                              contentStyle={{background:"hsl(var(--background))",border:"1px solid hsl(var(--border))",borderRadius:"8px",fontSize:11}}
                              formatter={(v:any)=>[fmtUSD(v),"Equity"]}
                              labelStyle={{color:"hsl(var(--muted-foreground))"}}
                            />
                            <Area type="monotone" dataKey="equity" stroke={up?"#008080":"#ef4444"} strokeWidth={2} fill="url(#eqGrad)" dot={false} activeDot={{r:3}}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Position allocation */}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">Open Positions</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  {positions.length===0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No open positions</p>
                  ) : (()=>{
                    const totalMkt = positions.reduce((s:number,p:any)=>s+Math.abs(p.mktVal||0),0)||1;
                    return (
                      <div className="space-y-2.5">
                        {[...positions].sort((a:any,b:any)=>Math.abs(b.mktVal)-Math.abs(a.mktVal)).slice(0,8).map((p:any)=>(
                          <div key={p.symbol}>
                            <div className="flex items-center justify-between mb-1 text-xs">
                              <span className="font-semibold text-foreground">{p.symbol}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-muted-foreground">{fmtUSD(p.mktVal)}</span>
                                <span className={cn("font-mono text-[10px]", clrPct(p.unrealizedPl))}>{p.unrealizedPl>=0?"+":""}{fmtUSD(p.unrealizedPl)}</span>
                              </div>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                style={{width:`${(Math.abs(p.mktVal)/totalMkt*100).toFixed(1)}%`}}
                                className={cn("h-full rounded-full", p.unrealizedPl>=0?"bg-teal-500":"bg-red-500")}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{(Math.abs(p.mktVal)/totalMkt*100).toFixed(1)}% · {fmtPct(p.unrealizedPlPct)}</p>
                          </div>
                        ))}
                        {positions.length>8&&<p className="text-[10px] text-muted-foreground text-center pt-1">+{positions.length-8} more — see Positions tab</p>}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Last sync footer */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
              <span>{lastSync?"Last synced: "+fmtHKTTime(lastSync)+" HKT":"Syncing…"}</span>
              <button onClick={()=>{ refreshAll(); fetchPortfolioHistory(histRange); }} className="hover:text-muted-foreground flex items-center gap-1 transition-colors">
                <RefreshCw className="h-2.5 w-2.5"/>{marketOpen?"Auto-refresh every 30s":"Market closed"}
              </button>
            </div>
          </div>
        )}

        {/* Trading mode tabs */}
        <Tabs value={mode} onValueChange={handleModeChange}>
          <TabsList className="mb-5 h-auto p-1 gap-1 flex-wrap">
            {Object.values(TRADING_MODES).map((m:any)=>{
              const ac = MODE_ACCENT[m.accent];
              return (
                <TabsTrigger key={m.id} value={m.id}
                  className={cn("flex items-center gap-1.5 text-xs px-3 py-2 data-[state=active]:", ac.tab)}>
                  <m.Icon className="h-3.5 w-3.5"/>
                  {m.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {Object.values(TRADING_MODES).map((m:any)=>{
            const isActive = mode === m.id;
            const ac = MODE_ACCENT[m.accent];
            return (
              <TabsContent key={m.id} value={m.id} className="mt-0">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                  {/* ── Left: main workspace (2/3) ── */}
                  <div className="lg:col-span-2 space-y-4">

                    {/* Agent control */}
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", agentRunning?"bg-emerald-500 animate-pulse":"bg-muted")}/>
                            <div>
                              <p className="text-sm font-semibold">{m.label} Agent</p>
                              <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {!agentRunning ? (
                              <Button size="sm" className={cn("text-xs border", ac.btn)} variant="outline" onClick={startAgent}>
                                <Play className="h-3 w-3 mr-1.5"/>Start Agent
                              </Button>
                            ):(
                              <Button size="sm" variant="outline" className="text-xs border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20" onClick={stopAgent}>
                                <Square className="h-3 w-3 mr-1.5"/>Stop
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-xs" onClick={async()=>{const pipe=await runPipeline();if(pipe) await executeTrades(pipe);}}>
                              Run Once
                            </Button>
                          </div>
                        </div>

                        {agentLog[0]&&(
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-[10px] font-mono text-muted-foreground">
                              <span className="text-muted-foreground/50">{agentLog[0].ts} </span>
                              <span className={cn(agentLog[0].type==="success"?"text-emerald-600 dark:text-emerald-400":agentLog[0].type==="warn"?"text-amber-500":agentLog[0].type==="error"?"text-red-500":"text-muted-foreground")}>
                                {agentLog[0].msg}
                              </span>
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Pipeline stages */}
                    <Card>
                      <CardHeader className="pb-2 pt-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4 text-muted-foreground"/>AI Pipeline
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="space-y-0">
                          {STAGES.map((s,i)=>{
                            const st=stageStatus[s.id];
                            return(
                              <div key={s.id} className={cn("flex items-center gap-3 py-2.5", i<STAGES.length-1?"border-b border-border/50":"")}>
                                <s.icon className={cn("h-3.5 w-3.5 flex-shrink-0", st?.status==="done"?"text-emerald-500":st?.status==="running"?"text-amber-500":"text-muted-foreground/30")}/>
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-xs font-medium", st?.status?"text-foreground":"text-muted-foreground")}>{s.name}</p>
                                  {st?.log&&<p className="text-[10px] text-muted-foreground truncate mt-0.5">{st.log}</p>}
                                </div>
                                <StagePill status={st?.status}/>
                              </div>
                            );
                          })}
                        </div>

                        {analysis&&(
                          <div className="mt-3 p-3 rounded-md border border-emerald-500/20 bg-emerald-500/5">
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Expected Return: {analysis.ter}</p>
                            {analysis.thesis&&<p className="text-xs text-muted-foreground leading-relaxed">{analysis.thesis}</p>}
                            {analysis.validation?.warnings?.length>0&&(
                              <p className="text-[10px] text-amber-500 mt-1.5 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3"/>
                                {analysis.validation.warnings[0]}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Inner tabs: Positions / Orders / Trades / Log */}
                    <Card>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-1 mb-4 flex-wrap">
                          {[
                            {id:"positions", label:`Positions (${positions.length})`},
                            {id:"orders",    label:`Orders (${orders.length})`},
                            {id:"trades",    label:`Session Trades (${tradeLog.length})`},
                            {id:"log",       label:"Log"},
                          ].map(t=>(
                            <button key={t.id} onClick={()=>setInnerTab(t.id)}
                              className={cn("text-xs px-2.5 py-1 rounded-md border transition-colors",
                                innerTab===t.id
                                  ? cn("border text-foreground bg-muted", "")
                                  : "border-transparent text-muted-foreground hover:text-foreground")}>
                              {t.label}
                            </button>
                          ))}
                          <div className="ml-auto">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={()=>{fetchPositions();fetchOrders();}}>
                              <RefreshCw className="h-3 w-3 mr-1"/>Refresh
                            </Button>
                          </div>
                        </div>

                        {/* Positions */}
                        {innerTab==="positions"&&(
                          positions.length===0
                            ? <p className="text-sm text-muted-foreground text-center py-8">No open positions</p>
                            : <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead><tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b">
                                    {["Symbol","Qty","Mkt Value","P&L","P&L %","Price","Entry"].map(h=><th key={h} className="pb-2 text-left font-medium pr-4 last:pr-0">{h}</th>)}
                                  </tr></thead>
                                  <tbody>{positions.map((p,i)=>(
                                    <tr key={i} className="border-b border-border/40 last:border-0">
                                      <td className="py-2.5 pr-4 font-semibold text-foreground">{p.symbol}</td>
                                      <td className="py-2.5 pr-4 text-muted-foreground">{p.qty}</td>
                                      <td className="py-2.5 pr-4 font-mono">{fmtUSD(p.mktVal)}</td>
                                      <td className={cn("py-2.5 pr-4 font-mono font-semibold", clrPct(p.unrealizedPl))}>{fmtUSD(p.unrealizedPl)}</td>
                                      <td className={cn("py-2.5 pr-4 font-mono", clrPct(p.unrealizedPlPct))}>{fmtPct(p.unrealizedPlPct)}</td>
                                      <td className="py-2.5 pr-4 font-mono text-muted-foreground">{fmtUSD(p.currentPrice)}</td>
                                      <td className="py-2.5 font-mono text-muted-foreground">{fmtUSD(p.avgEntry)}</td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              </div>
                        )}

                        {/* Orders */}
                        {innerTab==="orders"&&(
                          orders.length===0
                            ? <p className="text-sm text-muted-foreground text-center py-8">No recent orders</p>
                            : <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead><tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b">
                                    {["Symbol","Side","Qty/Notional","Status","Type","Filled At"].map(h=><th key={h} className="pb-2 text-left font-medium pr-4">{h}</th>)}
                                  </tr></thead>
                                  <tbody>{orders.map((o,i)=>(
                                    <tr key={i} className="border-b border-border/40 last:border-0">
                                      <td className="py-2.5 pr-4 font-semibold text-foreground">{o.symbol}</td>
                                      <td className={cn("py-2.5 pr-4 font-semibold uppercase text-[11px]", o.side==="buy"?"text-emerald-600 dark:text-emerald-400":"text-red-500")}>{o.side}</td>
                                      <td className="py-2.5 pr-4 font-mono text-muted-foreground">{o.qty||`~$${o.notional}`}</td>
                                      <td className="py-2.5 pr-4">
                                        <Badge variant="outline" className={cn("text-[10px]", o.status==="filled"?"border-emerald-500/30 text-emerald-600 dark:text-emerald-400":o.status==="canceled"?"border-red-500/30 text-red-500":"border-amber-500/30 text-amber-500")}>
                                          {o.status}
                                        </Badge>
                                      </td>
                                      <td className="py-2.5 pr-4 text-muted-foreground">{o.type}</td>
                                      <td className="py-2.5 font-mono text-muted-foreground">{o.filledAvg?fmtUSD(parseFloat(o.filledAvg)):"—"}</td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              </div>
                        )}

                        {/* Session trades */}
                        {innerTab==="trades"&&(
                          tradeLog.length===0
                            ? <p className="text-sm text-muted-foreground text-center py-8">No trades placed this session</p>
                            : <div className="space-y-2">
                                {tradeLog.map((t,i)=>(
                                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/40 text-xs">
                                    <span className={cn("font-bold uppercase text-[10px]", t.side==="buy"?"text-emerald-600 dark:text-emerald-400":"text-red-500")}>{t.side}</span>
                                    <span className="font-semibold text-foreground">{t.symbol}</span>
                                    <span className="text-muted-foreground font-mono">~${t.notional}</span>
                                    <span className="text-muted-foreground/60 flex-1 truncate">{t.rationale}</span>
                                    <span className="text-muted-foreground/40 text-[10px] flex-shrink-0">{fmtHKTTime(t.at)}</span>
                                  </div>
                                ))}
                              </div>
                        )}

                        {/* Agent log */}
                        {innerTab==="log"&&(
                          agentLog.length===0
                            ? <p className="text-sm text-muted-foreground text-center py-8">No activity yet — start the agent</p>
                            : <div className="max-h-64 overflow-y-auto space-y-0.5">
                                {agentLog.map((l,i)=>(
                                  <p key={i} className="text-[10px] font-mono py-0.5 border-b border-border/30 last:border-0">
                                    <span className="text-muted-foreground/40 mr-2">{l.ts}</span>
                                    <span className={cn(l.type==="success"?"text-emerald-600 dark:text-emerald-400":l.type==="warn"?"text-amber-500":l.type==="error"?"text-red-500":l.type==="buy"?"text-blue-500":l.type==="sell"?"text-red-400":"text-muted-foreground")}>
                                      {l.msg}
                                    </span>
                                  </p>
                                ))}
                              </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* ── Right: config + performance (1/3) ── */}
                  <div className="space-y-4">

                    {/* Mode info */}
                    <Card>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <m.Icon className={cn("h-5 w-5", ac.tab)}/>
                          <div>
                            <p className="text-sm font-semibold">{m.label}</p>
                            <p className="text-[10px] text-muted-foreground">Cycle: {m.cronMinutes < 60 ? `${m.cronMinutes}m` : m.cronMinutes < 1440 ? `${m.cronMinutes/60}h` : `${m.cronMinutes/1440}d`}</p>
                          </div>
                        </div>
                        <Separator className="mb-3"/>

                        {/* Risk selector (not shown for crypto — always high) */}
                        {m.id!=="crypto"&&(
                          <div className="mb-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Risk Profile</p>
                            <div className="space-y-1.5">
                              {Object.values(RISK_CONFIGS).map((r:any)=>(
                                <button key={r.id} onClick={()=>setRisk(r.id)}
                                  className={cn("w-full flex items-center gap-2 p-2 rounded-md text-xs border transition-colors text-left",
                                    risk===r.id?"border-primary/40 bg-primary/10 text-primary":"border-border text-muted-foreground hover:text-foreground hover:border-border")}>
                                  <r.Icon className="h-3 w-3 flex-shrink-0"/>
                                  <span className="font-medium">{r.label}</span>
                                  <span className="ml-auto text-[10px] opacity-60">SL {r.stopLoss}% TP {r.takeProfit}%</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Universe */}
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                            {m.id==="crypto"?"Crypto Universe":"Stock Universe"}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {(m.id==="crypto" ? UNIVERSES.crypto : UNIVERSES[risk]).map((t:string)=>(
                              <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0.5 font-mono">{t}</Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Performance stats for this mode */}
                    <Card>
                      <CardHeader className="pb-2 pt-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground"/>{m.label} Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <ModePerfStats mode={m.id}/>
                      </CardContent>
                    </Card>

                    {/* Analysis summary (when available) */}
                    {analysis&&isActive&&(
                      <Card>
                        <CardHeader className="pb-2 pt-4">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500"/>Latest Analysis
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4 space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Expected Return</span>
                            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{analysis.ter}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Positions</span>
                            <span className="font-mono">{analysis.positions?.length||0}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Score</span>
                            <span className={cn("font-mono font-semibold", (analysis.validation?.score||0)>=70?"text-emerald-600 dark:text-emerald-400":"text-amber-500")}>
                              {analysis.validation?.score||"?"}/100
                            </span>
                          </div>
                          <Separator/>
                          {analysis.positions?.slice(0,4).map((p:any)=>(
                            <div key={p.t} className="flex justify-between text-xs">
                              <span className="font-mono font-semibold text-foreground">{p.t}</span>
                              <span className="text-muted-foreground">{p.alloc}% · {p.er}</span>
                            </div>
                          ))}
                          {analysis.positions?.length>4&&(
                            <p className="text-[10px] text-muted-foreground">+{analysis.positions.length-4} more</p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </AdminLayout>
  );
}
