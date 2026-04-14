import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Target, Brain, Users, Shield, TrendingUp, TrendingDown,
  Play, RefreshCw, AlertTriangle, CheckCircle2, Clock, DollarSign,
  ChevronDown, ChevronRight, Search, Gavel, Eye, Zap,
  Scale, Flame, BookOpen, BarChart2, MessageSquare, Send, Trash2,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { fmtHKT } from "@/lib/hkt";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtUSD = (n: any) =>
  typeof n === "number"
    ? (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
const fmtPct = (n: any) =>
  typeof n !== "number" ? "—" : (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const clrPnl = (n: any) =>
  n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-500" : "text-muted-foreground";

const COUNCIL_AGENTS = [
  { key: "bull",         label: "Bull",             Icon: TrendingUp,   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { key: "bear",         label: "Bear",             Icon: TrendingDown, color: "text-red-500",                           bg: "bg-red-500/10",     border: "border-red-500/20"     },
  { key: "historian",    label: "Historian",        Icon: BookOpen,     color: "text-blue-500",                          bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
  { key: "devil",        label: "Devil's Advocate", Icon: Flame,        color: "text-amber-500",                         bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
  { key: "risk_manager", label: "Risk Manager",     Icon: Shield,       color: "text-purple-500",                        bg: "bg-purple-500/10",  border: "border-purple-500/20"  },
];

const STAGES = [
  { id: 1, name: "Market Scan",    icon: Search  },
  { id: 2, name: "Deep Research",  icon: BookOpen },
  { id: 3, name: "Council Debate", icon: Users   },
  { id: 4, name: "Execution",      icon: Gavel   },
];

function StagePill({ status }: { status?: string }) {
  if (!status) return <span className="text-[10px] text-muted-foreground/40 font-mono">WAIT</span>;
  const cls: any = { done: "text-emerald-600 dark:text-emerald-400", running: "text-amber-500", error: "text-red-500" };
  return <span className={cn("text-[10px] font-mono font-bold uppercase", cls[status] || "text-muted-foreground")}>{status}</span>;
}

// ── Council Transcript Viewer ─────────────────────────────────────────────────

function CouncilViewer({ transcript, marketTitle }: { transcript: any; marketTitle: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!transcript) return <p className="text-xs text-muted-foreground">No transcript available</p>;

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
        <Users className="h-3 w-3" /> Council Debate: {marketTitle}
      </p>
      {COUNCIL_AGENTS.map((agent) => {
        const data = transcript[agent.key];
        if (!data) return null;
        const isOpen = expanded === agent.key;
        return (
          <div key={agent.key} className={cn("rounded-lg border p-3", agent.border, agent.bg)}>
            <button onClick={() => setExpanded(isOpen ? null : agent.key)}
              className="w-full flex items-center justify-between text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <agent.Icon className={cn("h-4 w-4", agent.color)} />
                <span className={cn("text-sm font-semibold", agent.color)}>{agent.label}</span>
                {data.confidence && (
                  <Badge variant="outline" className={cn("text-[10px]", agent.border, agent.color)}>
                    Conf: {data.confidence}/10
                  </Badge>
                )}
                {data.probability_estimate != null && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    P(YES): {(data.probability_estimate * 100).toFixed(0)}%
                  </span>
                )}
                {data.verdict && (
                  <Badge variant="outline" className={cn("text-[10px]",
                    data.verdict?.includes("YES") ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : data.verdict?.includes("NO") ? "border-red-500/30 text-red-500"
                    : "border-amber-500/30 text-amber-500")}>
                    {data.verdict}
                  </Badge>
                )}
              </div>
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {isOpen && (
              <div className="mt-3 space-y-2">
                {data.argument && <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">{data.argument}</p>}
                {data.reasoning && <p className="text-xs text-foreground/80 leading-relaxed">{data.reasoning}</p>}
                {data.key_evidence && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Key Evidence</p>
                    {data.key_evidence.map((e: string, i: number) => (
                      <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5 mb-0.5">
                        <span className={agent.color}>•</span> {e}
                      </p>
                    ))}
                  </div>
                )}
                {data.precedents && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Historical Precedents</p>
                    {data.precedents.map((p: any, i: number) => (
                      <div key={i} className="text-[11px] text-muted-foreground mb-1.5 pl-3 border-l-2 border-blue-500/20">
                        <span className="font-medium text-foreground">{p.event}</span>
                        {p.year && <span className="text-[10px] ml-1 text-muted-foreground/60">({p.year})</span>}
                        {p.outcome && <p className="text-[10px]">{p.outcome}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {data.blind_spots && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Blind Spots</p>
                    {data.blind_spots.map((b: string, i: number) => (
                      <p key={i} className="text-[11px] text-amber-500 flex items-start gap-1.5 mb-0.5">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" /> {b}
                      </p>
                    ))}
                  </div>
                )}
                {data.kelly_fraction != null && (
                  <div className="flex gap-4 mt-2 pt-2 border-t border-purple-500/10">
                    {[
                      { label: "Final P(YES)", value: `${(data.final_probability * 100).toFixed(0)}%` },
                      { label: "Edge",         value: `${(data.edge * 100).toFixed(1)}pp` },
                      { label: "Kelly %",      value: `${(data.kelly_fraction * 100).toFixed(1)}%` },
                      { label: "Max Risk",     value: `$${data.max_risk_usd?.toFixed(2)}` },
                    ].map(m => (
                      <div key={m.label}>
                        <p className="text-[10px] text-muted-foreground">{m.label}</p>
                        <p className="text-sm font-bold font-mono text-purple-500">{m.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Bet Card ──────────────────────────────────────────────────────────────────

function BetCard({ bet }: { bet: any }) {
  const [showCouncil, setShowCouncil] = useState(false);
  const transcript = typeof bet.council_transcript === "string"
    ? JSON.parse(bet.council_transcript)
    : bet.council_transcript;
  const pnl = bet.pnl != null ? parseFloat(bet.pnl) : null;

  return (
    <Card className={cn("border",
      pnl != null && pnl > 0 ? "border-emerald-500/30"
      : pnl != null && pnl < 0 ? "border-red-500/30"
      : "border-border")}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className={cn("text-[10px]",
                bet.side === "yes" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 text-red-500")}>
                {bet.side?.toUpperCase()}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground">{bet.market_ticker}</span>
              <Badge variant="outline" className={cn("text-[10px]",
                bet.confidence >= 0.8 ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : bet.confidence >= 0.6 ? "border-amber-500/20 text-amber-500"
                : "border-muted text-muted-foreground")}>
                {bet.confidence >= 0.8 ? "High" : bet.confidence >= 0.6 ? "Med" : "Low"} conf
              </Badge>
              {pnl == null && (
                <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-500">
                  <Clock className="h-2.5 w-2.5 mr-1" />Pending
                </Badge>
              )}
            </div>
            <p className="text-sm font-semibold leading-tight mb-1">{bet.market_title}</p>
            <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              <span>{bet.contracts} contracts @ ${parseFloat(bet.price).toFixed(2)}</span>
              <span>Cost: {fmtUSD(parseFloat(bet.cost))}</span>
              <span>Edge: {((parseFloat(bet.edge) || 0) * 100).toFixed(1)}pp</span>
              <span>{fmtHKT(new Date(bet.logged_at), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} HKT</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            {pnl == null
              ? <p className="text-sm font-mono text-muted-foreground/50">—</p>
              : <p className={cn("text-lg font-bold font-mono", clrPnl(pnl))}>{pnl >= 0 ? "+" : ""}{fmtUSD(pnl)}</p>
            }
          </div>
        </div>
        {transcript && (
          <div className="mt-3">
            <button onClick={() => setShowCouncil(!showCouncil)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <Users className="h-3 w-3" />
              {showCouncil ? "Hide" : "View"} Council Debate
              {showCouncil ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {showCouncil && (
              <div className="mt-3 pt-3 border-t">
                <CouncilViewer transcript={transcript} marketTitle={bet.market_title} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/predictor/history?type=bets")
      .then(r => r.json())
      .then(d => { setBets(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading analytics…</p>;

  const settled = bets.filter(b => b.pnl != null).map(b => ({ ...b, pnlNum: parseFloat(b.pnl), costNum: parseFloat(b.cost) }));

  if (!settled.length) {
    return (
      <div className="py-16 text-center">
        <BarChart2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No settled bets yet — analytics will populate once bets resolve.</p>
      </div>
    );
  }

  const sorted = [...settled].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
  let cumPnl = 0;
  const pnlCurve = sorted.map(b => {
    cumPnl += b.pnlNum;
    return { date: new Date(b.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), pnl: parseFloat(cumPnl.toFixed(2)) };
  });

  const wins   = settled.filter(b => b.pnlNum > 0).length;
  const losses = settled.filter(b => b.pnlNum < 0).length;
  const pushes = settled.filter(b => b.pnlNum === 0).length;
  const pieDist = [
    { name: "Win",  value: wins,   fill: "#10b981" },
    { name: "Loss", value: losses, fill: "#ef4444" },
    ...(pushes > 0 ? [{ name: "Push", value: pushes, fill: "#6b7280" }] : []),
  ].filter(d => d.value > 0);

  const edgeBuckets: Record<string, { wins: number; losses: number }> = {};
  settled.forEach(b => {
    const edge = Math.floor((parseFloat(b.edge) || 0) * 100 / 5) * 5;
    const key = `${edge}-${edge + 5}pp`;
    if (!edgeBuckets[key]) edgeBuckets[key] = { wins: 0, losses: 0 };
    if (b.pnlNum > 0) edgeBuckets[key].wins++; else edgeBuckets[key].losses++;
  });
  const edgeData = Object.entries(edgeBuckets)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([label, v]) => ({ label, ...v }));

  const confBands = [
    { label: "Low (<60%)",   min: 0,   max: 0.6 },
    { label: "Med (60-80%)", min: 0.6, max: 0.8 },
    { label: "High (>80%)",  min: 0.8, max: 1   },
  ];
  const confData = confBands.map(band => {
    const group = settled.filter(b => b.confidence >= band.min && b.confidence < band.max);
    const totalPnl = group.reduce((s, b) => s + b.pnlNum, 0);
    const wr = group.length ? (group.filter(b => b.pnlNum > 0).length / group.length) * 100 : 0;
    return { label: band.label, pnl: parseFloat(totalPnl.toFixed(2)), winRate: parseFloat(wr.toFixed(1)), bets: group.length };
  });

  const totalCost = settled.reduce((s, b) => s + b.costNum, 0);
  const totalPnl  = settled.reduce((s, b) => s + b.pnlNum, 0);
  const avgEdge   = settled.reduce((s, b) => s + (parseFloat(b.edge) || 0), 0) / settled.length;
  const roi       = totalCost ? (totalPnl / totalCost) * 100 : 0;
  const maxWin    = Math.max(...settled.map(b => b.pnlNum));
  const maxLoss   = Math.min(...settled.map(b => b.pnlNum));
  const bestBet   = settled.find(b => b.pnlNum === maxWin) ?? null;
  const worstBet  = settled.find(b => b.pnlNum === maxLoss) ?? null;

  // Streak calculation
  let curStreak = 0, maxStreak = 0, curType = "";
  for (const b of sorted) {
    const t = b.pnlNum > 0 ? "W" : "L";
    if (t === curType) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else { curType = t; curStreak = 1; }
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "Settled Bets",   value: settled.length.toString(),     cls: "text-foreground" },
          { label: "Win Rate",        value: `${((wins / settled.length) * 100).toFixed(0)}%`, cls: wins / settled.length >= 0.5 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500" },
          { label: "Total P&L",      value: fmtUSD(totalPnl),               cls: clrPnl(totalPnl) },
          { label: "ROI",            value: fmtPct(roi),                    cls: clrPnl(roi) },
          { label: "Avg Edge",       value: `${(avgEdge * 100).toFixed(1)}pp`, cls: "text-purple-500" },
          { label: "Best Streak",    value: maxStreak.toString(),            cls: "text-amber-500" },
        ].map(m => (
          <Card key={m.label} className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
            <p className={cn("text-lg font-bold font-mono", m.cls)}>{m.value}</p>
          </Card>
        ))}
      </div>

      {/* P&L curve */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Cumulative P&L</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={pnlCurve} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={totalPnl >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={totalPnl >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${v}`} />
              <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => [fmtUSD(v), "Cumulative P&L"]} />
              <Area type="monotone" dataKey="pnl" stroke={totalPnl >= 0 ? "#10b981" : "#ef4444"} strokeWidth={2} fill="url(#pnlGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Outcome pie + Edge breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Outcome Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieDist.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm">Wins vs Losses by Edge</CardTitle>
            <CardDescription className="text-xs">5pp buckets — confirms edge ↑ = win rate ↑</CardDescription>
          </CardHeader>
          <CardContent>
            {edgeData.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={edgeData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="wins"   name="Wins"   fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="losses" name="Losses" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground text-center py-8">Not enough data</p>}
          </CardContent>
        </Card>
      </div>

      {/* Confidence breakdown */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">P&L by Confidence Band</CardTitle>
          <CardDescription className="text-xs">How each confidence tier performs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {confData.filter(d => d.bets > 0).map(d => (
            <div key={d.label} className="flex items-center gap-4">
              <p className="text-xs text-muted-foreground w-28 flex-shrink-0">{d.label}</p>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full", d.pnl >= 0 ? "bg-emerald-500" : "bg-red-500")}
                  style={{ width: `${Math.min(Math.abs(d.pnl) / Math.max(...confData.map(x => Math.abs(x.pnl)), 1) * 100, 100)}%` }} />
              </div>
              <p className={cn("text-xs font-mono font-bold w-20 text-right", clrPnl(d.pnl))}>{fmtUSD(d.pnl)}</p>
              <p className="text-xs text-muted-foreground w-16 text-right">{d.winRate.toFixed(0)}% WR</p>
              <p className="text-xs text-muted-foreground w-12 text-right">{d.bets}b</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Notable bets */}
      {(bestBet || worstBet) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bestBet && (
            <div>
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> Best Bet
              </p>
              <BetCard bet={bestBet} />
            </div>
          )}
          {worstBet && worstBet.id !== bestBet?.id && (
            <div>
              <p className="text-xs font-semibold text-red-500 flex items-center gap-1 mb-2">
                <AlertTriangle className="h-3.5 w-3.5" /> Worst Bet
              </p>
              <BetCard bet={worstBet} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const d = await fetch("/api/predictor/chat").then(r => r.json());
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
      const d = await fetch("/api/predictor/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      }).then(r => r.json());
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", content: d.content, created_at: new Date().toISOString() }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", content: "Error — could not reach the AI. Check your OpenAI integration.", created_at: new Date().toISOString() }]);
    }
    setSending(false);
  };

  const clearHistory = async () => {
    await fetch("/api/predictor/chat", { method: "DELETE" });
    setMessages([]);
  };

  const STARTERS = [
    "Why did you bet YES on the last market?",
    "Which categories are performing best?",
    "Should I raise or lower the min edge threshold?",
    "What's our ROI on high-confidence bets?",
    "Explain the last council debate",
  ];

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">Ask about bet decisions, strategy, council debates, or settings optimisation</p>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearHistory} className="text-xs text-muted-foreground h-7 px-2">
            <Trash2 className="h-3 w-3 mr-1" />Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
        {loading && <p className="text-xs text-muted-foreground text-center py-8">Loading history…</p>}

        {!loading && messages.length === 0 && (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto">
              <Scale className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Claude Predictor Chat</p>
              <p className="text-xs text-muted-foreground mb-4">Ask about prediction strategy, bet reasoning, or performance analysis</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {STARTERS.map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                <Scale className="h-3.5 w-3.5 text-purple-500" />
              </div>
            )}
            <div className={cn("max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
              msg.role === "user"
                ? "bg-purple-500/15 text-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm")}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="text-[9px] text-muted-foreground/50 mt-1 text-right">
                {fmtHKT(new Date(msg.created_at), { hour: "numeric", minute: "2-digit" })} HKT
              </p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center mr-2">
              <Scale className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <div className="bg-muted rounded-xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about a bet decision, council debate, or strategy…"
          className="resize-none text-sm min-h-[44px] max-h-[120px]"
          rows={1}
        />
        <Button onClick={send} disabled={sending || !input.trim()} size="icon"
          className="bg-purple-500 hover:bg-purple-600 text-white flex-shrink-0 self-end h-11 w-11">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Bets Tab ──────────────────────────────────────────────────────────────────

function BetsTab() {
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/predictor/history?type=bets")
      .then(r => r.json())
      .then(d => { setBets(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading bets…</p>;
  if (!bets.length) return <p className="text-sm text-muted-foreground py-8 text-center">No bets yet. Run the pipeline to get started.</p>;

  const pending = bets.filter(b => b.pnl == null);
  const settled = bets.filter(b => b.pnl != null);

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-blue-500 mb-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Open Positions ({pending.length})
          </p>
          <div className="space-y-3">{pending.map(bet => <BetCard key={bet.id} bet={bet} />)}</div>
        </div>
      )}
      {settled.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-3">Settled ({settled.length})</p>
          <div className="space-y-3">{settled.map(bet => <BetCard key={bet.id} bet={bet} />)}</div>
        </div>
      )}
    </div>
  );
}

// ── Councils Tab ──────────────────────────────────────────────────────────────

function CouncilsTab() {
  const [councils, setCouncils] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/predictor/history?type=councils")
      .then(r => r.json())
      .then(d => { setCouncils(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading councils…</p>;
  if (!councils.length) return <p className="text-sm text-muted-foreground py-8 text-center">No council debates yet.</p>;

  return (
    <div className="space-y-4">
      {councils.map((c: any) => {
        const transcript = typeof c.transcript === "string" ? JSON.parse(c.transcript) : c.transcript;
        return (
          <Card key={c.id}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <p className="text-sm font-semibold">{c.market_title}</p>
                  <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                    <span>Market: {(c.market_probability * 100).toFixed(0)}%</span>
                    <span className="text-purple-500">Ours: {(c.our_probability * 100).toFixed(0)}%</span>
                    <span className="font-bold text-amber-500">Edge: {(c.edge * 100).toFixed(1)}pp</span>
                  </div>
                </div>
                <Badge variant="outline" className={cn("text-xs flex-shrink-0",
                  c.verdict?.includes("YES") ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : c.verdict?.includes("NO") ? "border-red-500/30 text-red-500"
                  : "border-amber-500/30 text-amber-500")}>
                  {c.verdict}
                </Badge>
              </div>
              <CouncilViewer transcript={transcript} marketTitle={c.market_title} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ settings, onUpdate }: { settings: any; onUpdate: (k: string, v: string) => void }) {
  const [saved, setSaved] = useState<string | null>(null);

  const save = async (key: string, value: string) => {
    await onUpdate(key, value);
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  };

  const FieldRow = ({ k, label, desc, type = "text", placeholder = "" }: { k: string; label: string; desc: string; type?: string; placeholder?: string }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {saved === k && <span className="text-[10px] text-emerald-500">Saved</span>}
      </div>
      <p className="text-[10px] text-muted-foreground">{desc}</p>
      <Input
        type={type}
        defaultValue={settings[k] || ""}
        placeholder={placeholder}
        onBlur={e => { if (e.target.value !== (settings[k] || "")) save(k, e.target.value); }}
        className="text-xs font-mono h-8"
      />
    </div>
  );

  const ToggleRow = ({ k, label, desc }: { k: string; label: string; desc: string }) => (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] text-muted-foreground">{desc}</p>
      </div>
      <button onClick={() => save(k, settings[k] === "true" ? "false" : "true")}
        className={cn("text-xs px-3 py-1 rounded-md border transition-colors",
          settings[k] === "true" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground")}>
        {settings[k] === "true" ? "ON" : "OFF"}
      </button>
    </div>
  );

  const ChoiceRow = ({ k, label, choices, fmt = (v: string) => v }: { k: string; label: string; choices: string[]; fmt?: (v: string) => string }) => (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{label}</p>
      <div className="flex gap-1 flex-wrap">
        {choices.map(v => (
          <button key={v} onClick={() => save(k, v)}
            className={cn("text-[10px] px-2.5 py-1 rounded-md border transition-colors",
              settings[k] === v ? "border-purple-500/30 bg-purple-500/10 text-purple-500" : "border-border text-muted-foreground hover:text-foreground")}>
            {fmt(v)}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">

      {/* Pipeline thresholds */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Pipeline Thresholds</CardTitle>
          <CardDescription className="text-xs">Controls when the agent places bets</CardDescription>
        </CardHeader>
        <CardContent className="pb-4 space-y-4">
          <ChoiceRow k="min_edge" label="Minimum Edge Threshold"
            choices={["0.05", "0.10", "0.15", "0.20", "0.25", "0.30"]}
            fmt={v => `${(parseFloat(v) * 100).toFixed(0)}pp`} />
          <ChoiceRow k="max_bet_usd" label="Max Bet Size (USD)"
            choices={["10", "25", "50", "75", "100", "200"]}
            fmt={v => `$${v}`} />
          <ChoiceRow k="kelly_fraction" label="Kelly Fraction"
            choices={["0.10", "0.15", "0.25", "0.33", "0.50"]}
            fmt={v => `${(parseFloat(v) * 100).toFixed(0)}%`} />
          <FieldRow k="max_positions" label="Max Open Positions" desc="Maximum number of concurrent open bets" placeholder="10" />
        </CardContent>
      </Card>

      {/* Scanning & schedule */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Scanning & Schedule</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-3">
          <ToggleRow k="cron_enabled" label="Auto-Scan (every 2 hours)" desc="Automatically scan Kalshi markets and place bets when edge is found" />
          <Separator />
          <ChoiceRow k="mode" label="Trading Mode"
            choices={["demo", "live"]}
            fmt={v => v === "live" ? "⚠ LIVE" : "Demo"} />
          <p className="text-[10px] text-amber-500 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Live mode places real money bets on Kalshi. Use Demo until you're confident.
          </p>
        </CardContent>
      </Card>

      {/* Market filters */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Market Filters</CardTitle>
          <CardDescription className="text-xs">Customise which markets the scanner targets</CardDescription>
        </CardHeader>
        <CardContent className="pb-4 space-y-4">
          <FieldRow k="min_volume" label="Minimum Market Volume" desc="Skip markets with fewer contracts traded (0 = no filter)" placeholder="0" />
          <FieldRow k="max_close_time_days" label="Max Days Until Expiry" desc="Only bet markets resolving within this many days" placeholder="90" />
          <FieldRow k="min_confidence_score" label="Minimum Confidence Score (0-1)" desc="Council agents must reach this confidence to trigger a bet" placeholder="0.6" />
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Kalshi Credentials</CardTitle>
          <CardDescription className="text-xs">Set these as Replit Secrets (environment variables)</CardDescription>
        </CardHeader>
        <CardContent className="pb-4 space-y-2 text-xs text-muted-foreground">
          {[
            ["KALSHI_EMAIL_DEMO",       "Demo account email"],
            ["KALSHI_PASSWORD_DEMO",    "Demo account password"],
            ["KALSHI_KEY_ID_LIVE",      "Production API key ID"],
            ["KALSHI_PRIVATE_KEY_LIVE", "Production RSA private key"],
          ].map(([k, desc]) => (
            <div key={k} className="flex items-start justify-between gap-2">
              <span className="font-mono text-foreground text-[11px]">{k}</span>
              <span className="text-right text-[11px]">{desc}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Edge categories */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Edge Categories</CardTitle>
          <CardDescription className="text-xs">Markets in these categories are scanned for mispricing</CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex flex-wrap gap-1.5">
            {["Politics", "Economics", "Technology", "Science", "Regulation", "AI",
              "Climate", "Federal Reserve", "Supreme Court", "Congress", "Geopolitics",
              "Crypto Regulation", "Space", "Health Policy"].map(cat => (
              <Badge key={cat} variant="secondary" className="text-[10px] px-2 py-0.5">{cat}</Badge>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Category filtering is applied in the pipeline's market scan stage.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const [stats, setStats]             = useState<any>(null);
  const [settings, setSettings]       = useState<any>({});
  const [loading, setLoading]         = useState(true);
  const [running, setRunning]         = useState(false);
  const [scanning, setScanning]       = useState(false);
  const [stageStatus, setStageStatus] = useState<any>({});
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [tab, setTab]                 = useState<"overview" | "bets" | "analytics" | "chat" | "councils" | "settings">("overview");

  const loadStats = useCallback(async () => {
    try {
      const [s, cfg] = await Promise.all([
        fetch("/api/predictor/stats").then(r => r.json()),
        fetch("/api/predictor/settings").then(r => r.json()),
      ]);
      setStats(s);
      setSettings(cfg);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    const t = setInterval(loadStats, 30000);
    return () => clearInterval(t);
  }, [loadStats]);

  const runPipeline = async () => {
    setRunning(true); setStageStatus({});
    try {
      const r = await fetch("/api/predictor/run", { method: "POST" });
      const d = await r.json();
      if (d.log) {
        const parsed: any = {};
        for (const line of d.log) {
          const m = line.match(/S(\d)\[(\w+)\]: (.+)/);
          if (m) parsed[m[1]] = { status: m[2], log: m[3] };
        }
        setStageStatus(parsed);
      }
      await loadStats();
    } catch {}
    setRunning(false);
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await fetch("/api/predictor/scan", { method: "POST" });
      const d = await r.json();
      setScanResults(d.candidates || []);
    } catch {}
    setScanning(false);
  };

  const updateSetting = async (key: string, value: string) => {
    await fetch("/api/predictor/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSettings((s: any) => ({ ...s, [key]: value }));
  };

  const TABS = [
    { id: "overview"  as const, label: "Overview",  Icon: Eye         },
    { id: "bets"      as const, label: "Bets",       Icon: DollarSign  },
    { id: "analytics" as const, label: "Analytics",  Icon: BarChart2   },
    { id: "chat"      as const, label: "Chat",       Icon: MessageSquare },
    { id: "councils"  as const, label: "Councils",   Icon: Users       },
    { id: "settings"  as const, label: "Settings",   Icon: Shield      },
  ];

  return (
    <AdminLayout>
      <div>
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Prediction Markets</p>
          <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Scale className="h-6 w-6 text-purple-500" />
            Claude Predictor
          </h1>
          <p className="text-muted-foreground text-sm">Multi-agent council debate system for Kalshi prediction markets</p>
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
                { label: "Total Bets",  value: stats?.total_bets ?? "—",      cls: "text-foreground" },
                { label: "Win Rate",    value: stats?.win_rate != null ? `${stats.win_rate.toFixed(0)}%` : "—", cls: (stats?.win_rate || 0) >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500" },
                { label: "Total P&L",  value: stats?.total_pnl != null ? fmtUSD(stats.total_pnl) : "—", cls: clrPnl(stats?.total_pnl || 0) },
                { label: "ROI",        value: stats?.roi != null ? fmtPct(stats.roi) : "—", cls: clrPnl(stats?.roi || 0) },
                { label: "Avg Edge",   value: stats?.avg_edge != null ? `${(stats.avg_edge * 100).toFixed(1)}pp` : "—", cls: "text-purple-500" },
                { label: "Active",     value: stats?.active_positions ?? "—", cls: "text-blue-500" },
              ].map(m => (
                <Card key={m.label} className="p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                  <p className={cn("text-lg font-bold font-mono", m.cls)}>{m.value}</p>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-500" />AI Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="flex gap-2 mb-4">
                    <Button size="sm" variant="outline" onClick={runPipeline} disabled={running}
                      className="text-xs border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20">
                      {running ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Play className="h-3 w-3 mr-1.5" />}
                      {running ? "Running…" : "Run Full Pipeline"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={runScan} disabled={scanning} className="text-xs">
                      {scanning ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Search className="h-3 w-3 mr-1.5" />}
                      Scan Only
                    </Button>
                  </div>
                  <div className="space-y-0">
                    {STAGES.map((s, i) => {
                      const st = stageStatus[s.id];
                      return (
                        <div key={s.id} className={cn("flex items-center gap-3 py-2.5", i < STAGES.length - 1 ? "border-b border-border/50" : "")}>
                          <s.icon className={cn("h-3.5 w-3.5 flex-shrink-0",
                            st?.status === "done" ? "text-emerald-500" : st?.status === "running" ? "text-amber-500" : "text-muted-foreground/30")} />
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-xs font-medium", st?.status ? "text-foreground" : "text-muted-foreground")}>{s.name}</p>
                            {st?.log && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{st.log}</p>}
                          </div>
                          <StagePill status={st?.status} />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Scale className="h-4 w-4 text-muted-foreground" />Quick Config
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Min Edge</p>
                    <div className="flex gap-1 flex-wrap">
                      {["0.10", "0.15", "0.20", "0.25"].map(v => (
                        <button key={v} onClick={() => updateSetting("min_edge", v)}
                          className={cn("text-[10px] px-2 py-1 rounded border transition-colors",
                            settings.min_edge === v ? "border-purple-500/30 bg-purple-500/10 text-purple-500" : "border-border text-muted-foreground hover:text-foreground")}>
                          {(parseFloat(v) * 100).toFixed(0)}pp
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Max Bet</p>
                    <div className="flex gap-1 flex-wrap">
                      {["10", "25", "50", "100"].map(v => (
                        <button key={v} onClick={() => updateSetting("max_bet_usd", v)}
                          className={cn("text-[10px] px-2 py-1 rounded border transition-colors",
                            settings.max_bet_usd === v ? "border-purple-500/30 bg-purple-500/10 text-purple-500" : "border-border text-muted-foreground hover:text-foreground")}>
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Auto-scan</span>
                    <button onClick={() => updateSetting("cron_enabled", settings.cron_enabled === "true" ? "false" : "true")}
                      className={cn("text-xs px-2 py-0.5 rounded border transition-colors",
                        settings.cron_enabled === "true" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground")}>
                      {settings.cron_enabled === "true" ? "ON" : "OFF"}
                    </button>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Mode</span>
                    <div className="flex gap-1">
                      {["demo", "live"].map(v => (
                        <button key={v} onClick={() => updateSetting("mode", v)}
                          className={cn("text-[10px] px-2 py-0.5 rounded border transition-colors capitalize",
                            settings.mode === v
                              ? v === "live" ? "border-red-500/30 bg-red-500/10 text-red-500" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "border-border text-muted-foreground hover:text-foreground")}>
                          {v === "live" ? "⚠ Live" : v}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {scanResults.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />Scan Results ({scanResults.length} opportunities)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-2">
                  {scanResults.map((m: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-muted-foreground">{m.ticker}</span>
                          <Badge variant="outline" className="text-[10px] border-amber-500/20 text-amber-500">Score: {m.score}</Badge>
                        </div>
                        <p className="text-sm font-semibold">{m.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{m.why}</p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-0.5">
                        <p className="text-xs text-muted-foreground">Market: <span className="font-mono">{(m.yes_price * 100).toFixed(0)}%</span></p>
                        <p className="text-xs text-purple-500">Ours: <span className="font-mono">{(m.your_estimate * 100).toFixed(0)}%</span></p>
                        <p className="text-xs font-bold font-mono text-amber-500">Edge: {((m.your_estimate - m.yes_price) * 100).toFixed(1)}pp</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {stats?.recent_bets?.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-3">Recent Bets</p>
                <div className="space-y-3">
                  {stats.recent_bets.slice(0, 5).map((bet: any) => <BetCard key={bet.id} bet={bet} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "bets"      && <BetsTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "chat"      && <ChatTab />}
        {tab === "councils"  && <CouncilsTab />}
        {tab === "settings"  && <SettingsTab settings={settings} onUpdate={updateSetting} />}
      </div>
    </AdminLayout>
  );
}
