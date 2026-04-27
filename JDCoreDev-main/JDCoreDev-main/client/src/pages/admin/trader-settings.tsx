import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
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

export default function TraderSettings() {
  const [health,      setHealth]      = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [settings,    setSettings]    = useState<any>({});
  const [saving,      setSaving]      = useState(false);
  const [testMsg,     setTestMsg]     = useState("");
  const [logs,        setLogs]        = useState<any[]>([]);
  const [logsOpen,    setLogsOpen]    = useState(false);
  const [cronRunning, setCronRunning] = useState<string|null>(null);
  const [cronMsg,     setCronMsg]     = useState<Record<string,string>>({});

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

  const toggleCron = () => updateSetting('cron_enabled', settings.cron_enabled==='true' ? 'false' : 'true');

  const triggerManualRun = async (mode: string) => {
    setCronRunning(mode); setCronMsg(p=>({...p,[mode]:""}));
    try {
      const r = await fetch('/api/trader/cron/run',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({risk:settings.cron_risk||'medium',mode}),
      });
      const d = await r.json();
      const msg = d.error ? `Error: ${d.error}` : `Done — ${d.action||'complete'}. ${d.orders||0} orders.`;
      setCronMsg(p=>({...p,[mode]:msg}));
    } catch(e:any){setCronMsg(p=>({...p,[mode]:`Error: ${e.message}`}));}
    setCronRunning(null);
    setTimeout(()=>setCronMsg(p=>({...p,[mode]:""})),6000);
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

  const cronEnabled = settings.cron_enabled === 'true';

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-4">
        <TraderNav active="/admin/trader/settings"/>
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Claude Trader</p>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        </div>

        {/* Auto-trading cron */}
        <Card className={cn("transition-colors", cronEnabled && "border-emerald-500/30")}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4"/>Autonomous Trading Cron
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  All enabled strategies run simultaneously on independent schedules. Every trade is tagged with its strategy type.
                </CardDescription>
              </div>
              <button onClick={toggleCron} disabled={loading||saving}
                className={cn("relative w-12 h-6 rounded-full border transition-colors flex-shrink-0",
                  cronEnabled ? "bg-emerald-500 border-emerald-500" : "bg-muted border-border")}>
                <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                  cronEnabled ? "left-6" : "left-0.5")}/>
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {cronEnabled&&(
              <div className="p-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 text-xs">
                Autonomous trading is active. Ensure <code className="font-mono">CRON_ALPACA_KEY</code> and <code className="font-mono">CRON_ALPACA_SECRET</code> are configured in Secrets.
              </div>
            )}

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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Active Strategies</p>
              <div className="space-y-1">
                {Object.entries(TRADING_MODES).map(([k,v]:any)=>{
                  const on = settings[`cron_${k}_enabled`]==='true';
                  const lastRun = settings[`cron_last_run_${k}`];
                  const lastLabel = lastRun ? fmtHKT(lastRun, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) + ' HKT' : 'Never';
                  return (
                    <div key={k} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-md border transition-colors",
                      on ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-muted/20")}>
                      <button onClick={()=>updateSetting(`cron_${k}_enabled`, on?'false':'true')} disabled={saving}
                        className={cn("relative w-9 h-5 rounded-full border flex-shrink-0 transition-colors",
                          on ? "bg-emerald-500 border-emerald-500" : "bg-muted border-border")}>
                        <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                          on ? "left-4" : "left-0.5")}/>
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{v.label}</p>
                        <p className="text-[10px] text-muted-foreground">{v.cadence} · Last run: {lastLabel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {cronMsg[k]&&<p className={cn("text-[10px]", cronMsg[k].startsWith("Error") ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>{cronMsg[k]}</p>}
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={()=>triggerManualRun(k)} disabled={cronRunning===k}>
                          <Play className="h-3 w-3 mr-1"/>{cronRunning===k?"…":"Run"}
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
            <CardDescription className="text-xs">Add these in <strong>Replit → Secrets</strong>. Paper/Live mode is controlled from the dashboard toggle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { key:"CRON_ALPACA_KEY_PAPER",    note:"Paper account Key ID",     req:true,  set: health?.env?.hasPaperKeys, group:"paper" },
              { key:"CRON_ALPACA_SECRET_PAPER",  note:"Paper account Secret Key",  req:true,  set: health?.env?.hasPaperKeys, group:"paper" },
              { key:"CRON_ALPACA_KEY_LIVE",      note:"Live account Key ID",      req:true,  set: health?.env?.hasLiveKeys,  group:"live"  },
              { key:"CRON_ALPACA_SECRET_LIVE",   note:"Live account Secret Key",   req:true,  set: health?.env?.hasLiveKeys,  group:"live"  },
              { key:"ANTHROPIC_API_KEY",         note:"Claude AI — required for pipeline analysis", req:true,  set: health?.env?.hasAnthropicKey },
              { key:"SMTP_HOST",                 note:"e.g. smtp.gmail.com — for email notifications", req:false, set: health?.env?.hasEmail },
              { key:"SLACK_WEBHOOK_URL",         note:"For Slack trade alerts",   req:false, set: health?.env?.hasSlack },
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
