import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { TraderTabs } from "@/components/TraderTabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { fmtHKT, fmtHKTTime } from "@/lib/hkt";
import { Activity, CheckCircle2, XCircle, Play, Mail, MessageSquare, ChevronDown, ChevronUp, Wifi, WifiOff } from "lucide-react";

const RISK_CONFIGS: any = {
  low:    { label:"Conservative" },
  medium: { label:"Balanced"     },
  high:   { label:"Aggressive"   },
};
const TRADING_MODES: any = {
  swing:     { label:"Swing",       cadence:"Every 4 h · market hours",     accent:"purple" },
};
const UNIVERSES: any = {
  low:    ["JNJ","PG","KO","WMT","NEE","VYM","SCHD","SO","VZ","MCD","ABBV","T","DUK","O","JEPI"],
  medium: ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","AVGO","LLY","UNH","JPM","V","HD","MA","CRM","MRK"],
  high:   ["MSTR","COIN","HOOD","IONQ","SMCI","PLTR","RKLB","CLSK","MARA","TSLA","AMD","SOXL","TQQQ","ARKK"],
  crypto: ["BTCUSD","ETHUSD","SOLUSD","AVAXUSD","LINKUSD","DOTUSD","ADAUSD","MATICUSD"],
};

function ModeIntervalInput({ modeKey, value, onSave }: { modeKey: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef(value);
  useEffect(() => { setV(value); ref.current = value; }, [value]);
  const unit = modeKey === "portfolio" || modeKey === "crypto" ? "min (daily=1440)" : "min";
  return (
    <div className="flex items-center gap-2 pl-12">
      <span className="text-[10px] text-muted-foreground flex-1">Interval</span>
      <input type="number" min="1" value={v} onChange={e => setV(e.target.value)}
        className="w-20 text-right text-[10px] font-mono bg-muted/60 border border-border rounded px-1.5 py-0.5 focus:outline-none focus:border-primary" />
      <span className="text-[10px] text-muted-foreground">{unit}</span>
      <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => { onSave(v); ref.current = v; }}>Save</Button>
    </div>
  );
}

export default function TraderSettings() {
  const [health,      setHealth]      = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [settings,    setSettings]    = useState<any>({});
  const [saving,      setSaving]      = useState(false);
  const [testMsg,     setTestMsg]     = useState("");
  const [logs,        setLogs]        = useState<any[]>([]);
  const [logsOpen,    setLogsOpen]    = useState(false);
  const [routineRunning, setRoutineRunning] = useState<string|null>(null);
  const [routineMsg,     setRoutineMsg]     = useState<Record<string,string>>({});

  useEffect(()=>{
    Promise.all([
      fetch('/api/trader/health').then(r=>r.json()),
      fetch('/api/trader/settings').then(r=>r.json()),
    ]).then(([h,s])=>{ setHealth(h); setSettings(s||{}); setLoading(false); }).catch(()=>setLoading(false));
  },[]);

  const updateSetting = async (key: string, value: string) => {
    setSaving(true);
    try {
      await fetch('/api/trader/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,value})});
      setSettings((p:any)=>({...p,[key]:value}));
    } catch {}
    setSaving(false);
  };

  const triggerManualRun = async (mode: string) => {
    setRoutineRunning(mode); setRoutineMsg(p=>({...p,[mode]:""}));
    try {
      const r = await fetch('/api/trader/agent/run',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({note:`manual fire from settings — risk=${settings.cron_risk||'medium'} mode=${mode}`}),
      });
      const d = await r.json();
      const msg = d.error ? `Error: ${d.error}` : `Routine fired ✓ — Claude is analyzing. Check Runs for results.`;
      setRoutineMsg(p=>({...p,[mode]:msg}));
    } catch(e:any){setRoutineMsg(p=>({...p,[mode]:`Error: ${e.message}`}));}
    setRoutineRunning(null);
    setTimeout(()=>setRoutineMsg(p=>({...p,[mode]:""})),8000);
  };

  const loadLogs = async () => {
    if(!logsOpen){
      const r = await fetch('/api/trader/history?type=logs');
      const d = await r.json();
      setLogs(Array.isArray(d)?d:[]);
    }
    setLogsOpen(p=>!p);
  };

  const sendTest = async (type: string) => {
    setTestMsg("Sending…");
    try {
      const r = await fetch('/api/trader/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,data:type==="email"?{subject:"Test",html:"<p>Claude Trader is live ✓</p>"}:{text:"✅ Claude Trader is live · jdcoredev.com"}})});
      const d = await r.json();
      setTestMsg(d.ok?"Sent successfully":"Error: "+d.error);
    } catch(e:any){setTestMsg("Error: "+e.message);}
    setTimeout(()=>setTestMsg(""),4000);
  };

  return (
    <AdminLayout>
      <TraderTabs />
      <div className="max-w-3xl space-y-4">
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Claude Trader</p>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        </div>

        {/* Trader Routine */}
        <Card>
          <CardHeader className="pb-3">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4"/>Trader Routine
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Powered by Claude Code. Fires on-demand — no server-side cron. Use "Fire Routine" on the dashboard or the button below.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Risk Profile</p>
              <div className="flex gap-1.5">
                {Object.entries(RISK_CONFIGS).map(([k,v]:any)=>(
                  <button key={k} onClick={()=>updateSetting('cron_risk',k)}
                    className={cn("text-xs px-3 py-1 rounded-md border transition-colors",
                      settings.cron_risk===k ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Strategy Profile</p>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  {k:"conservative", label:"Conservative", desc:"RR≥2.5 · 0.5% risk · no biotech/M&A binaries"},
                  {k:"aggressive",   label:"Aggressive",   desc:"RR≥1.5 · full risk band · all catalysts"},
                  {k:"both",         label:"Both",         desc:"Run each fire under both lenses · max 1 buy per profile"},
                ].map(({k,label,desc})=>(
                  <button key={k} onClick={()=>updateSetting('strategy_profile',k)} title={desc}
                    className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors text-left",
                      (settings.strategy_profile||'aggressive')===k ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    <div className="font-medium">{label}</div>
                    <div className="text-[9px] opacity-70 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Strategy</p>
              <div className="space-y-1">
                {Object.entries(TRADING_MODES).map(([k,v]:any)=>{
                  const lastRun = settings[`cron_last_run_${k}`];
                  const lastLabel = lastRun ? fmtHKT(lastRun, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) + ' HKT' : 'Never';
                  return (
                    <div key={k} className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{v.label}</p>
                        <p className="text-[10px] text-muted-foreground">Last fire: {lastLabel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {routineMsg[k]&&<p className={cn("text-[10px]", routineMsg[k].startsWith("Error") ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>{routineMsg[k]}</p>}
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={()=>triggerManualRun(k)} disabled={routineRunning===k}>
                          <Play className="h-3 w-3 mr-1"/>{routineRunning===k?"Firing…":"Fire Now"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System health */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-xs text-muted-foreground">Checking systems…</p>
            ) : health ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={cn("text-xs", health.alpacaConnected ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : (health.isPaper ? health.hasPaperKeys : health.hasLiveKeys) ? "border-amber-500/30 text-amber-500" : "border-red-500/30 text-red-500")}>
                    {health.alpacaConnected ? "Alpaca Connected" : (health.isPaper ? health.hasPaperKeys : health.hasLiveKeys) ? "Keys Set · Not Verified" : "Alpaca Not Configured"}
                  </Badge>
                  <Badge variant="outline" className={cn("text-xs", health.isPaper ? "border-sky-500/30 text-sky-600 dark:text-sky-400" : "border-orange-500/30 text-orange-500")}>
                    {health.isPaper ? "Paper Trading" : "⚡ Live Trading"}
                  </Badge>
                  {health.timestamp&&<span className="text-[10px] text-muted-foreground ml-auto">{fmtHKT(health.timestamp,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} HKT</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Alpaca connectivity row */}
                  <div className="flex items-center gap-2 text-xs sm:col-span-2 p-2 rounded-md border bg-muted/20">
                    {health.alpacaConnected
                      ? <Wifi className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0"/>
                      : <WifiOff className="h-3.5 w-3.5 text-red-500/70 flex-shrink-0"/>}
                    <span className={health.alpacaConnected ? "text-foreground" : "text-muted-foreground"}>
                      Alpaca API · {health.isPaper ? "Paper" : "Live"} endpoint
                    </span>
                    <Badge variant="outline" className={cn("ml-auto text-[10px]",
                      health.alpacaConnected ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                      (health.isPaper ? health.hasPaperKeys : health.hasLiveKeys) ? "border-amber-500/30 text-amber-500" : "border-red-500/30 text-red-500")}>
                      {health.alpacaConnected ? "CONNECTED" : (health.isPaper ? health.hasPaperKeys : health.hasLiveKeys) ? "KEYS SET" : "MISSING"}
                    </Badge>
                  </div>

                  {/* Paper / Live keys rows */}
                  {[
                    { label: "Paper account keys", value: health.hasPaperKeys,  accent: "sky"     },
                    { label: "Live account keys",   value: health.hasLiveKeys,   accent: "orange"  },
                  ].map(({label,value,accent})=>(
                    <div key={label} className="flex items-center gap-2 text-xs">
                      {value
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0"/>
                        : <XCircle className="h-3.5 w-3.5 text-red-500/50 flex-shrink-0"/>}
                      <span className={value ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                      <Badge variant="outline" className={cn("ml-auto text-[10px]",
                        value ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 text-red-500")}>
                        {value ? "SET" : "MISSING"}
                      </Badge>
                    </div>
                  ))}

                  {health.env&&Object.entries({
                    "Anthropic API Key": health.env.hasAnthropicKey,
                    "Email (SMTP)":      health.env.hasEmail,
                    "Slack Webhook":     health.env.hasSlack,
                  }).map(([k,v]:any)=>(
                    <div key={k} className="flex items-center gap-2 text-xs">
                      {v ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0"/> : <XCircle className="h-3.5 w-3.5 text-red-500/50 flex-shrink-0"/>}
                      <span className={v ? "text-foreground" : "text-muted-foreground"}>{k}</span>
                      <Badge variant="outline" className={cn("ml-auto text-[10px]", v ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 text-red-500")}>
                        {v ? "SET" : "MISSING"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-red-500">Could not reach health endpoint</p>
            )}
          </CardContent>
        </Card>

        {/* Required secrets */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm">Environment Secrets</CardTitle>
            <CardDescription className="text-xs">Add these in <strong>Railway → Variables</strong>. Paper/Live mode is controlled from the dashboard toggle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { key:"CLAUDE_ROUTINE_TRADER_TOKEN", note:"Anthropic routine fire token — get from claude.ai/code/routines", req:true,  set: health?.env?.hasRoutineToken },
              { key:"CRON_ALPACA_KEY_PAPER",       note:"Alpaca paper account Key ID",     req:true,  set: health?.env?.hasPaperKeys },
              { key:"CRON_ALPACA_SECRET_PAPER",    note:"Alpaca paper account Secret Key",  req:true,  set: health?.env?.hasPaperKeys },
              { key:"CRON_ALPACA_KEY_LIVE",        note:"Alpaca live account Key ID",      req:false, set: health?.env?.hasLiveKeys  },
              { key:"CRON_ALPACA_SECRET_LIVE",     note:"Alpaca live account Secret Key",   req:false, set: health?.env?.hasLiveKeys  },
              { key:"SMTP_HOST",                   note:"e.g. smtp.gmail.com — for email notifications", req:false, set: health?.env?.hasEmail },
              { key:"SLACK_WEBHOOK_URL",           note:"For Slack trade alerts",           req:false, set: health?.env?.hasSlack },
            ].map(({key:k,note,req,set,group}:any)=>(
              <div key={k} className="flex items-center gap-3 p-2.5 rounded-md border bg-muted/30">
                <code className={cn("text-xs font-mono flex-shrink-0", req ? "text-primary" : "text-muted-foreground")}>{k}</code>
                <span className="text-[10px] text-muted-foreground flex-1 truncate">{note}</span>
                <Badge variant="outline" className={cn("text-[10px] flex-shrink-0",
                  set===true  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                  set===false ? "border-red-500/30 text-red-500" :
                  req         ? "border-amber-500/30 text-amber-500" : "border-border text-muted-foreground")}>
                  {set===true ? "SET" : set===false ? "MISSING" : req ? "required" : "optional"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Test notifications */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm">Test Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-center flex-wrap">
              <Button size="sm" variant="outline" onClick={()=>sendTest("email")}>
                <Mail className="h-3.5 w-3.5 mr-1.5"/>Test Email
              </Button>
              <Button size="sm" variant="outline" onClick={()=>sendTest("slack")}>
                <MessageSquare className="h-3.5 w-3.5 mr-1.5"/>Test Slack
              </Button>
              {testMsg&&<p className={cn("text-xs", testMsg.startsWith("Error") ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>{testMsg}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Agent logs */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Agent Logs</p>
              <Button size="sm" variant="ghost" onClick={loadLogs} className="text-xs h-7">
                {logsOpen ? <><ChevronUp className="h-3 w-3 mr-1"/>Hide</> : <><ChevronDown className="h-3 w-3 mr-1"/>View Logs</>}
              </Button>
            </div>
            {logsOpen&&(
              <div className="mt-3 max-h-72 overflow-y-auto space-y-0.5">
                {logs.length===0 ? (
                  <p className="text-xs text-muted-foreground py-2">No logs yet</p>
                ) : logs.map((l,i)=>(
                  <p key={i} className="text-[10px] font-mono py-0.5 border-b border-border/30 last:border-0">
                    <span className="text-muted-foreground/40 mr-2">{fmtHKT(l.logged_at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} HKT</span>
                    <span className={cn(l.type==="error"?"text-red-500":l.type==="warn"?"text-amber-500":"text-muted-foreground")}>{l.message}</span>
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Universe reference */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm">Asset Universes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(UNIVERSES).map(([k,v]:any)=>(
              <div key={k}>
                <p className={cn("text-[10px] font-semibold uppercase tracking-wider mb-2",
                  k==="low"?"text-emerald-600 dark:text-emerald-400":k==="medium"?"text-amber-500":k==="high"?"text-red-500":"text-orange-500")}>
                  {k==="crypto"?"Crypto":k.charAt(0).toUpperCase()+k.slice(1)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {v.map((t:string)=><Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0.5 font-mono">{t}</Badge>)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground/30 pb-4">Claude Trader v1.0 · Powered by JD Core Dev · Not financial advice</p>
      </div>
    </AdminLayout>
  );
}
