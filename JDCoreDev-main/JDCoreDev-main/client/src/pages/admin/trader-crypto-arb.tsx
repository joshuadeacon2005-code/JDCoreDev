import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Eye, DollarSign, MessageSquare, Settings, RefreshCw,
  Search, Play, Trash2, Send, Zap, Bitcoin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtHKT } from "@/lib/hkt";

const fmtUSD = (n: any) => typeof n === "number" ? (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtPct = (n: any) => typeof n !== "number" ? "—" : (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const clrPnl = (n: any) => n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-500" : "text-muted-foreground";

function TraderNav({ active }: { active: string }) {
  const [, setLocation] = useLocation();
  const tabs = [
    { label: "Dashboard",   path: "/admin/trader" },
    { label: "Runs",        path: "/admin/trader/runs" },
    { label: "Analytics",   path: "/admin/trader/analytics" },
    { label: "Performance", path: "/admin/trader/performance" },
    { label: "Predictions", path: "/admin/trader/predictions" },
    { label: "Arb Engine",  path: "/admin/trader/arbitrage" },
    { label: "Crypto Arb",  path: "/admin/trader/crypto-arb" },
    { label: "Watchlist",   path: "/admin/trader/watchlist" },
    { label: "Settings",    path: "/admin/trader/settings" },
  ];
  return (
    <div className="flex gap-1 flex-wrap mb-6">
      {tabs.map(t => (
        <button key={t.path} onClick={() => setLocation(t.path)}
          className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors",
            active === t.path
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const d = await fetch("/api/crypto-arb/chat").then(r => r.json());
      setMessages(Array.isArray(d) ? d : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    setMessages(prev => [...prev, { id: Date.now(), role: "user", content: msg, created_at: new Date().toISOString() }]);
    try {
      const d = await fetch("/api/crypto-arb/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      }).then(r => r.json());
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", content: d.content, created_at: new Date().toISOString() }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", content: "Error — could not reach the AI.", created_at: new Date().toISOString() }]);
    }
    setSending(false);
  };

  const clearHistory = async () => {
    await fetch("/api/crypto-arb/chat", { method: "DELETE" });
    setMessages([]);
  };

  const STARTERS = ["Which crypto has the biggest edge right now?", "Compare BTC spot price vs Kalshi implied price", "What's our win rate on crypto arb trades?", "Should I adjust the minimum edge threshold?"];
  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">Ask about crypto prices, Kalshi mispricing, or strategy</p>
        {messages.length > 0 && <Button size="sm" variant="ghost" onClick={clearHistory} className="text-xs text-muted-foreground h-7 px-2"><Trash2 className="h-3 w-3 mr-1" />Clear</Button>}
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
        {loading && <p className="text-xs text-muted-foreground text-center py-8">Loading history...</p>}
        {!loading && messages.length === 0 && (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center mx-auto"><Bitcoin className="h-6 w-6 text-cyan-500" /></div>
            <div><p className="text-sm font-medium mb-1">Crypto Arb Chat</p><p className="text-xs text-muted-foreground mb-4">Ask about crypto spot vs prediction market pricing and arbitrage strategy</p></div>
            <div className="flex flex-wrap gap-2 justify-center">
              {STARTERS.map(s => (<button key={s} onClick={() => setInput(s)} className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-colors text-left">{s}</button>))}
            </div>
          </div>)}
        {messages.map(msg => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && <div className="w-7 h-7 rounded-full bg-cyan-500/10 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5"><Bitcoin className="h-3.5 w-3.5 text-cyan-500" /></div>}
            <div className={cn("max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed", msg.role === "user" ? "bg-cyan-500/15 text-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm")}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="text-[9px] text-muted-foreground/50 mt-1 text-right">{fmtHKT(new Date(msg.created_at), { hour: "numeric", minute: "2-digit" })} HKT</p>
            </div>
          </div>))}
        {sending && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-cyan-500/10 flex items-center justify-center mr-2"><Bitcoin className="h-3.5 w-3.5 text-cyan-500" /></div>
            <div className="bg-muted rounded-xl rounded-bl-sm px-4 py-3"><div className="flex gap-1">{[0, 1, 2].map(i => (<div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />))}</div></div>
          </div>)}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <Textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask about crypto arb opportunities or spot pricing..." className="resize-none text-sm min-h-[44px] max-h-[120px]" rows={1} />
        <Button onClick={send} disabled={sending || !input.trim()} size="icon" className="bg-cyan-500 hover:bg-cyan-600 text-white flex-shrink-0 self-end h-11 w-11"><Send className="h-4 w-4" /></Button>
      </div>
    </div>);
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CryptoArbPage() {
  const [stats, setStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [spotPrices, setSpotPrices] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<"overview" | "opportunities" | "trades" | "chat" | "settings">("overview");
  const [usage, setUsage] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, cfg, sp, u] = await Promise.all([
        fetch("/api/crypto-arb/stats").then(r => r.json()),
        fetch("/api/crypto-arb/settings").then(r => r.json()),
        fetch("/api/crypto-arb/spot-prices").then(r => r.json()),
        fetch("/api/predictor/usage?module=crypto-arb").then(r => r.json()).catch(() => null),
      ]);
      setStats(s);
      setSettings(cfg);
      setSpotPrices(Array.isArray(sp) ? sp : []);
      if (u) setUsage(u);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { const t = setInterval(loadData, 30000); return () => clearInterval(t); }, [loadData]);

  const loadOpps = useCallback(async () => {
    try {
      const d = await fetch("/api/crypto-arb/opportunities").then(r => r.json());
      setOpportunities(Array.isArray(d) ? d : []);
    } catch {}
  }, []);

  const loadTrades = useCallback(async () => {
    try {
      const d = await fetch("/api/crypto-arb/trades").then(r => r.json());
      setTrades(Array.isArray(d) ? d : []);
    } catch {}
  }, []);

  useEffect(() => { if (tab === "opportunities") loadOpps(); }, [tab, loadOpps]);
  useEffect(() => { if (tab === "trades") loadTrades(); }, [tab, loadTrades]);

  const runScan = async () => {
    setScanning(true);
    try { await fetch("/api/crypto-arb/scan", { method: "POST" }); await loadOpps(); await loadData(); } catch {}
    setScanning(false);
  };

  const executeArb = async (id: string) => {
    try { await fetch(`/api/crypto-arb/execute/${id}`, { method: "POST" }); await loadOpps(); await loadData(); } catch {}
  };

  const updateSetting = async (key: string, value: string) => {
    await fetch("/api/crypto-arb/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSettings((s: any) => ({ ...s, [key]: value }));
  };

  const [saved, setSaved] = useState<string | null>(null);
  const saveSetting = async (key: string, value: string) => {
    await updateSetting(key, value);
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  };

  const TABS = [
    { id: "overview"       as const, label: "Overview",       Icon: Eye },
    { id: "opportunities"  as const, label: "Opportunities",  Icon: Zap },
    { id: "trades"         as const, label: "Trades",         Icon: DollarSign },
    { id: "chat"           as const, label: "Chat",           Icon: MessageSquare },
    { id: "settings"       as const, label: "Settings",       Icon: Settings },
  ];

  return (
    <AdminLayout>
      <div>
        <TraderNav active="/admin/trader/crypto-arb" />

        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Crypto vs Prediction Markets</p>
          <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Bitcoin className="h-6 w-6 text-cyan-500" />
            Crypto Arb
          </h1>
          <p className="text-muted-foreground text-sm">Spot price vs Kalshi prediction market arbitrage</p>
        </div>

        <div className="flex gap-1 flex-wrap mb-5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors",
                tab === t.id
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
              <t.Icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <DollarSign className="h-3 w-3" /><span className="font-medium">API Credits</span>
              </div>
              <div className="flex items-center gap-4 font-mono">
                <span>Today: <strong>${(usage?.today?.cost || 0).toFixed(4)}</strong></span>
                <span>Week: <strong>${(usage?.week?.cost || 0).toFixed(4)}</strong></span>
                <span>Month: <strong>${(usage?.month?.cost || 0).toFixed(4)}</strong></span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total Trades", value: stats?.total_trades ?? "—",  cls: "text-foreground" },
                { label: "Active",       value: stats?.active ?? "—",        cls: "text-blue-500" },
                { label: "Win Rate",     value: stats?.win_rate != null ? `${stats.win_rate.toFixed(0)}%` : "—", cls: (stats?.win_rate || 0) >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500" },
                { label: "Total P&L",    value: stats?.total_pnl != null ? fmtUSD(stats.total_pnl) : "—", cls: clrPnl(stats?.total_pnl || 0) },
                { label: "Avg Edge",     value: stats?.avg_edge != null ? `${(stats.avg_edge * 100).toFixed(1)}%` : "—", cls: "text-cyan-500" },
                { label: "ROI",          value: stats?.roi != null ? fmtPct(stats.roi) : "—", cls: clrPnl(stats?.roi || 0) },
              ].map(m => (
                <Card key={m.label} className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                  <p className={cn("text-lg font-bold font-mono", m.cls)}>{m.value}</p>
                </Card>
              ))}
            </div>

            {spotPrices.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2"><Bitcoin className="h-4 w-4 text-cyan-500" />Current Spot Prices</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{spotPrices.map((sp: any) => (
                    <div key={sp.symbol} className="flex items-center gap-2 p-2.5 rounded-lg border border-cyan-500/10 bg-cyan-500/5">
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase">{sp.symbol}</p>
                        <p className="text-sm font-bold font-mono text-foreground">{fmtUSD(sp.price)}</p>
                      </div>
                      {sp.change_24h != null && (
                        <Badge variant="outline" className={cn("text-[10px]", sp.change_24h >= 0 ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "border-red-500/20 text-red-500")}>
                          {sp.change_24h >= 0 ? "+" : ""}{sp.change_24h.toFixed(1)}%
                        </Badge>)}
                    </div>))}</div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4 text-cyan-500" />Market Scanner
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <Button size="sm" variant="outline" onClick={runScan} disabled={scanning}
                  className="text-xs border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20">
                  {scanning ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Search className="h-3 w-3 mr-1.5" />}
                  {scanning ? "Scanning..." : "Scan Markets"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── OPPORTUNITIES ── */}
        {tab === "opportunities" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{opportunities.length} opportunities found</p>
              <Button size="sm" variant="outline" onClick={runScan} disabled={scanning} className="text-xs">
                {scanning ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                Refresh
              </Button>
            </div>
            {opportunities.length === 0 ? (
              <div className="py-16 text-center">
                <Bitcoin className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No crypto arb opportunities found. Run a market scan.</p>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-4 pb-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 text-muted-foreground font-medium">Kalshi Market</th>
                          <th className="text-left py-2 text-muted-foreground font-medium">Crypto</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Kalshi</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Spot</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Target</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Edge</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Status</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {opportunities.map((opp: any) => (
                          <tr key={opp.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2.5 pr-2 max-w-[180px] truncate font-medium">{opp.kalshi_market}</td>
                            <td className="py-2.5 pr-2">
                              <Badge variant="outline" className="text-[10px] border-cyan-500/20 text-cyan-500">{opp.crypto_symbol}</Badge>
                            </td>
                            <td className="py-2.5 text-right font-mono">{((opp.kalshi_price || 0) * 100).toFixed(0)}c</td>
                            <td className="py-2.5 text-right font-mono">{fmtUSD(opp.spot_price)}</td>
                            <td className="py-2.5 text-right font-mono text-muted-foreground">{fmtUSD(opp.implied_target)}</td>
                            <td className={cn("py-2.5 text-right font-mono font-bold", "text-cyan-500")}>
                              {((opp.edge_pct || 0) * 100).toFixed(1)}%
                            </td>
                            <td className="py-2.5 text-center">
                              <Badge variant="outline" className={cn("text-[10px]",
                                opp.status === "executed" ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                : opp.status === "expired" ? "border-red-500/20 text-red-500"
                                : "border-amber-500/20 text-amber-500")}>
                                {opp.status || "open"}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-right">
                              {(!opp.status || opp.status === "open") && (
                                <Button size="sm" variant="outline" onClick={() => executeArb(opp.id)}
                                  className="text-[10px] h-6 px-2 border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/10">
                                  <Play className="h-2.5 w-2.5 mr-1" />Execute
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── TRADES ── */}
        {tab === "trades" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{trades.length} trades</p>
            {trades.length === 0 ? (
              <div className="py-16 text-center">
                <DollarSign className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No crypto arb trades yet. Execute an opportunity to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">{trades.map((trade: any) => {
                const pnl = trade.pnl != null ? parseFloat(trade.pnl) : null;
                return (
                  <Card key={trade.id} className={cn("border", pnl != null && pnl > 0 ? "border-emerald-500/30" : pnl != null && pnl < 0 ? "border-red-500/30" : "border-border")}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="outline" className="text-[10px] border-cyan-500/20 text-cyan-500">{trade.crypto_symbol || "CRYPTO"}</Badge>
                            <span className="text-xs font-mono text-muted-foreground">{trade.kalshi_market}</span>
                          </div>
                          <p className="text-sm font-semibold leading-tight mb-1">{trade.kalshi_market}</p>
                          <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                            <span>Edge: {((trade.edge_pct || 0) * 100).toFixed(1)}%</span>
                            <span>Spot: {fmtUSD(parseFloat(trade.spot_price || 0))}</span>
                            <span>Cost: {fmtUSD(parseFloat(trade.cost || 0))}</span>
                            {trade.logged_at && <span>{fmtHKT(new Date(trade.logged_at), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} HKT</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {pnl == null ? <p className="text-sm font-mono text-muted-foreground/50">—</p>
                            : <p className={cn("text-lg font-bold font-mono", clrPnl(pnl))}>{pnl >= 0 ? "+" : ""}{fmtUSD(pnl)}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>);
              })}</div>
            )}
          </div>
        )}

        {/* ── CHAT ── */}
        {tab === "chat" && <ChatTab />}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <div className="max-w-2xl space-y-5">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Crypto Arb Thresholds</CardTitle>
                <CardDescription className="text-xs">Controls when the engine executes crypto-prediction arb trades</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Minimum Edge</Label>
                    {saved === "min_edge" && <span className="text-[10px] text-emerald-500">Saved</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Only execute when spot-vs-implied edge exceeds this threshold</p>
                  <div className="flex gap-1 flex-wrap">
                    {["0.03", "0.05", "0.08", "0.10", "0.15", "0.20"].map(v => (
                      <button key={v} onClick={() => saveSetting("min_edge", v)}
                        className={cn("text-[10px] px-2.5 py-1 rounded-md border transition-colors",
                          settings.min_edge === v ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-500" : "border-border text-muted-foreground hover:text-foreground")}>
                        {(parseFloat(v) * 100).toFixed(0)}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Max Bet Size (USD)</Label>
                    {saved === "max_bet" && <span className="text-[10px] text-emerald-500">Saved</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Maximum amount to risk per crypto arb trade</p>
                  <div className="flex gap-1 flex-wrap">
                    {["25", "50", "100", "200", "500"].map(v => (
                      <button key={v} onClick={() => saveSetting("max_bet", v)}
                        className={cn("text-[10px] px-2.5 py-1 rounded-md border transition-colors",
                          settings.max_bet === v ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-500" : "border-border text-muted-foreground hover:text-foreground")}>
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Scanning & Schedule</CardTitle>
              </CardHeader>
              <CardContent className="pb-4 space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-xs font-medium">Auto-Scan (every 15 min)</p>
                    <p className="text-[10px] text-muted-foreground">Automatically compare crypto spot prices against Kalshi prediction markets</p>
                  </div>
                  <button onClick={() => saveSetting("cron_enabled", settings.cron_enabled === "true" ? "false" : "true")}
                    className={cn("text-xs px-3 py-1 rounded-md border transition-colors",
                      settings.cron_enabled === "true" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground")}>
                    {settings.cron_enabled === "true" ? "ON" : "OFF"}
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
