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
  Search, Play, Trash2, Send, Zap, Scale,
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
              ? "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400"
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
      const d = await fetch("/api/arbitrage/chat").then(r => r.json());
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
      const d = await fetch("/api/arbitrage/chat", {
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
    await fetch("/api/arbitrage/chat", { method: "DELETE" });
    setMessages([]);
  };

  const STARTERS = ["What arb opportunities are open right now?", "Explain the last executed arb trade", "What is the average spread across markets?", "Should I adjust the min spread threshold?"];
  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">Ask about arbitrage opportunities, spreads, or strategy</p>
        {messages.length > 0 && <Button size="sm" variant="ghost" onClick={clearHistory} className="text-xs text-muted-foreground h-7 px-2"><Trash2 className="h-3 w-3 mr-1" />Clear</Button>}
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
        {loading && <p className="text-xs text-muted-foreground text-center py-8">Loading history...</p>}
        {!loading && messages.length === 0 && (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto"><Scale className="h-6 w-6 text-purple-500" /></div>
            <div><p className="text-sm font-medium mb-1">Arb Engine Chat</p><p className="text-xs text-muted-foreground mb-4">Ask about cross-platform arbitrage strategy and spread analysis</p></div>
            <div className="flex flex-wrap gap-2 justify-center">
              {STARTERS.map(s => (<button key={s} onClick={() => setInput(s)} className="text-xs px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors text-left">{s}</button>))}
            </div>
          </div>)}
        {messages.map(msg => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && <div className="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5"><Scale className="h-3.5 w-3.5 text-purple-500" /></div>}
            <div className={cn("max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed", msg.role === "user" ? "bg-purple-500/15 text-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm")}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="text-[9px] text-muted-foreground/50 mt-1 text-right">{fmtHKT(new Date(msg.created_at), { hour: "numeric", minute: "2-digit" })} HKT</p>
            </div>
          </div>))}
        {sending && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center mr-2"><Scale className="h-3.5 w-3.5 text-purple-500" /></div>
            <div className="bg-muted rounded-xl rounded-bl-sm px-4 py-3"><div className="flex gap-1">{[0, 1, 2].map(i => (<div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />))}</div></div>
          </div>)}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <Textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask about an arb opportunity or spread analysis..." className="resize-none text-sm min-h-[44px] max-h-[120px]" rows={1} />
        <Button onClick={send} disabled={sending || !input.trim()} size="icon" className="bg-purple-500 hover:bg-purple-600 text-white flex-shrink-0 self-end h-11 w-11"><Send className="h-4 w-4" /></Button>
      </div>
    </div>);
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ArbitragePage() {
  const [stats, setStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<"overview" | "opportunities" | "trades" | "chat" | "settings">("overview");

  const loadData = useCallback(async () => {
    try {
      const [s, cfg] = await Promise.all([
        fetch("/api/arbitrage/stats").then(r => r.json()),
        fetch("/api/arbitrage/settings").then(r => r.json()),
      ]);
      setStats(s);
      setSettings(cfg);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { const t = setInterval(loadData, 30000); return () => clearInterval(t); }, [loadData]);

  const loadOpps = useCallback(async () => {
    try {
      const d = await fetch("/api/arbitrage/opportunities").then(r => r.json());
      setOpportunities(Array.isArray(d) ? d : []);
    } catch {}
  }, []);

  const loadTrades = useCallback(async () => {
    try {
      const d = await fetch("/api/arbitrage/trades").then(r => r.json());
      setTrades(Array.isArray(d) ? d : []);
    } catch {}
  }, []);

  useEffect(() => { if (tab === "opportunities") loadOpps(); }, [tab, loadOpps]);
  useEffect(() => { if (tab === "trades") loadTrades(); }, [tab, loadTrades]);

  const runScan = async () => {
    setScanning(true);
    try { await fetch("/api/arbitrage/scan", { method: "POST" }); await loadOpps(); await loadData(); } catch {}
    setScanning(false);
  };

  const executeArb = async (id: string) => {
    try { await fetch(`/api/arbitrage/execute/${id}`, { method: "POST" }); await loadOpps(); await loadData(); } catch {}
  };

  const updateSetting = async (key: string, value: string) => {
    await fetch("/api/arbitrage/settings", {
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
        <TraderNav active="/admin/trader/arbitrage" />

        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Cross-Platform Arbitrage</p>
          <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Scale className="h-6 w-6 text-purple-500" />
            Arb Engine
          </h1>
          <p className="text-muted-foreground text-sm">Kalshi vs Polymarket spread detection and execution</p>
        </div>

        <div className="flex gap-1 flex-wrap mb-5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors",
                tab === t.id
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
              <t.Icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total Arbs",  value: stats?.total_arbs ?? "—",   cls: "text-foreground" },
                { label: "Active",      value: stats?.active ?? "—",       cls: "text-blue-500" },
                { label: "Win Rate",    value: stats?.win_rate != null ? `${stats.win_rate.toFixed(0)}%` : "—", cls: (stats?.win_rate || 0) >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500" },
                { label: "Total P&L",   value: stats?.total_pnl != null ? fmtUSD(stats.total_pnl) : "—", cls: clrPnl(stats?.total_pnl || 0) },
                { label: "Avg Spread",  value: stats?.avg_spread != null ? `${(stats.avg_spread * 100).toFixed(1)}%` : "—", cls: "text-purple-500" },
                { label: "ROI",         value: stats?.roi != null ? fmtPct(stats.roi) : "—", cls: clrPnl(stats?.roi || 0) },
              ].map(m => (
                <Card key={m.label} className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                  <p className={cn("text-lg font-bold font-mono", m.cls)}>{m.value}</p>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4 text-purple-500" />Market Scanner
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <Button size="sm" variant="outline" onClick={runScan} disabled={scanning}
                  className="text-xs border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20">
                  {scanning ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Search className="h-3 w-3 mr-1.5" />}
                  {scanning ? "Scanning..." : "Scan Markets"}
                </Button>
              </CardContent>
            </Card>

            {stats?.recent_opportunities?.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />Recent Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-2">
                  {stats.recent_opportunities.slice(0, 5).map((opp: any, i: number) => (
                    <div key={opp.id || i} className="flex items-center gap-3 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{opp.kalshi_market}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{opp.poly_market}</p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-0.5">
                        <p className="text-xs font-bold font-mono text-purple-500">Spread: {((opp.spread || 0) * 100).toFixed(1)}%</p>
                        <Badge variant="outline" className={cn("text-[10px]",
                          opp.status === "executed" ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : opp.status === "expired" ? "border-red-500/20 text-red-500"
                          : "border-amber-500/20 text-amber-500")}>
                          {opp.status || "open"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
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
                <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No opportunities found. Run a market scan to detect spreads.</p>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-4 pb-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 text-muted-foreground font-medium">Kalshi Market</th>
                          <th className="text-left py-2 text-muted-foreground font-medium">Polymarket</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Kalshi</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Poly</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Spread</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Status</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {opportunities.map((opp: any) => (
                          <tr key={opp.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2.5 pr-2 max-w-[200px] truncate font-medium">{opp.kalshi_market}</td>
                            <td className="py-2.5 pr-2 max-w-[200px] truncate text-muted-foreground">{opp.poly_market}</td>
                            <td className="py-2.5 text-right font-mono">{((opp.kalshi_price || 0) * 100).toFixed(0)}c</td>
                            <td className="py-2.5 text-right font-mono">{((opp.poly_price || 0) * 100).toFixed(0)}c</td>
                            <td className={cn("py-2.5 text-right font-mono font-bold", "text-purple-500")}>
                              {((opp.spread || 0) * 100).toFixed(1)}%
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
                                  className="text-[10px] h-6 px-2 border-purple-500/30 text-purple-500 hover:bg-purple-500/10">
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
                <p className="text-sm text-muted-foreground">No arb trades yet. Execute an opportunity to get started.</p>
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
                            <Badge variant="outline" className="text-[10px] border-purple-500/20 text-purple-500">ARB</Badge>
                            <span className="text-xs font-mono text-muted-foreground">{trade.kalshi_market}</span>
                          </div>
                          <p className="text-sm font-semibold leading-tight mb-1">{trade.poly_market || trade.kalshi_market}</p>
                          <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                            <span>Spread: {((trade.spread || 0) * 100).toFixed(1)}%</span>
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
                <CardTitle className="text-sm">Arb Thresholds</CardTitle>
                <CardDescription className="text-xs">Controls when the engine executes arbitrage trades</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Minimum Spread</Label>
                    {saved === "min_spread" && <span className="text-[10px] text-emerald-500">Saved</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Only execute arbs with at least this spread</p>
                  <div className="flex gap-1 flex-wrap">
                    {["0.02", "0.03", "0.05", "0.08", "0.10", "0.15"].map(v => (
                      <button key={v} onClick={() => saveSetting("min_spread", v)}
                        className={cn("text-[10px] px-2.5 py-1 rounded-md border transition-colors",
                          settings.min_spread === v ? "border-purple-500/30 bg-purple-500/10 text-purple-500" : "border-border text-muted-foreground hover:text-foreground")}>
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
                  <p className="text-[10px] text-muted-foreground">Maximum amount to risk per arb trade</p>
                  <div className="flex gap-1 flex-wrap">
                    {["25", "50", "100", "200", "500"].map(v => (
                      <button key={v} onClick={() => saveSetting("max_bet", v)}
                        className={cn("text-[10px] px-2.5 py-1 rounded-md border transition-colors",
                          settings.max_bet === v ? "border-purple-500/30 bg-purple-500/10 text-purple-500" : "border-border text-muted-foreground hover:text-foreground")}>
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
                    <p className="text-xs font-medium">Auto-Scan (every 30 min)</p>
                    <p className="text-[10px] text-muted-foreground">Automatically scan for cross-platform spread opportunities</p>
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
