import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { TraderLayout } from "@/components/TraderLayout";
import { TradingPageHeader, pnlColor } from "@/components/TradingPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Target, Brain, Users, Shield, TrendingUp, TrendingDown,
  Play, RefreshCw, AlertTriangle, CheckCircle2, Clock, DollarSign,
  ChevronDown, ChevronRight, Search, Gavel, Eye, Zap,
  Scale, Flame, BookOpen, BarChart2, MessageSquare, Send, Trash2,
  Wallet, UserX, ExternalLink, Info, Globe, Loader2, X,
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

function BetCard({ bet, onCancelled }: { bet: any; onCancelled?: () => void }) {
  const [showCouncil, setShowCouncil]     = useState(false);
  const [confirming, setConfirming]       = useState(false);
  const [cancelling, setCancelling]       = useState(false);
  const [cancelError, setCancelError]     = useState<string | null>(null);

  const transcript = typeof bet.council_transcript === "string"
    ? JSON.parse(bet.council_transcript)
    : bet.council_transcript;
  const pnl = bet.pnl != null ? parseFloat(bet.pnl) : null;

  // Can only cancel resting/pending bets that have a Kalshi order ID
  const canCancel = bet.order_id &&
    !["cancelled", "failed", "filled", "settled"].includes(bet.status) &&
    pnl == null;

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const r = await fetch(`/api/predictor/bets/${encodeURIComponent(bet.id)}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok || d.error) { setCancelError(d.error || "Cancel failed"); setConfirming(false); }
      else { onCancelled?.(); }
    } catch { setCancelError("Network error"); }
    setCancelling(false);
  };

  return (
    <Card className={cn("border",
      bet.status === "cancelled" ? "border-muted opacity-60"
      : pnl != null && pnl > 0 ? "border-emerald-500/30"
      : pnl != null && pnl < 0 ? "border-red-500/30"
      : "border-border")}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className={cn("text-[10px]",
                bet.platform === "polymarket" ? "border-blue-500/30 text-blue-500" : "border-purple-500/30 text-purple-500")}>
                {bet.platform === "polymarket" ? "Polymarket" : "Kalshi"}
              </Badge>
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
              {bet.status === "cancelled" ? (
                <Badge variant="outline" className="text-[10px] border-muted text-muted-foreground">Cancelled</Badge>
              ) : pnl == null ? (
                <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-500">
                  <Clock className="h-2.5 w-2.5 mr-1" />{bet.status === "resting" ? "Open" : "Pending"}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm font-semibold leading-tight mb-1">{bet.market_title}</p>
            <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              <span>{bet.contracts} contracts @ ${parseFloat(bet.price).toFixed(2)}</span>
              <span>Cost: {fmtUSD(parseFloat(bet.cost))}</span>
              <span>Edge: {((parseFloat(bet.edge) || 0) * 100).toFixed(1)}pp</span>
              <span>{fmtHKT(new Date(bet.logged_at), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} HKT</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
            {pnl == null
              ? <p className="text-sm font-mono text-muted-foreground/50">—</p>
              : <p className={cn("text-lg font-bold font-mono", clrPnl(pnl))}>{pnl >= 0 ? "+" : ""}{fmtUSD(pnl)}</p>
            }
            {canCancel && !confirming && (
              <button onClick={() => setConfirming(true)}
                className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1">
                <Trash2 className="h-3 w-3" />Cancel
              </button>
            )}
            {confirming && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Sure?</span>
                <button onClick={handleCancel} disabled={cancelling}
                  className="text-[10px] text-red-500 hover:text-red-600 font-semibold disabled:opacity-50">
                  {cancelling ? "…" : "Yes"}
                </button>
                <button onClick={() => { setConfirming(false); setCancelError(null); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground">
                  No
                </button>
              </div>
            )}
          </div>
        </div>
        {cancelError && (
          <p className="text-[10px] text-red-500 mt-2">{cancelError}</p>
        )}
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

// ── Notable Traders data ──────────────────────────────────────────────────────

const NOTABLE_TRADERS = [
  {
    name: "The 2024 Election Whale",
    subtitle: "Anonymous French trader on Polymarket/Kalshi",
    reputation: "controversial" as const,
    focus: ["US Politics", "Presidential Elections"],
    summary: "Placed $30M+ bets on Trump winning the 2024 US election, single-handedly moving market prices by 10+ percentage points. Identity later confirmed as Frédéric Baguelin. Accused of coordinated manipulation; the bets proved correct but the method drew SEC scrutiny.",
    signal: "Large anonymous whale positions in political markets may signal either informed trading or coordinated manipulation. Check for corresponding moves on correlated markets.",
    trackRecord: "Correct on 2024 election. Known for concentrated single-outcome bets, not diversified strategy.",
    link: "https://www.wsj.com/finance/polymarket-trump-bets-whale",
  },
  {
    name: "Nate Silver",
    subtitle: "@NateSilver538 — FiveThirtyEight founder",
    reputation: "declining" as const,
    focus: ["US Politics", "Sports", "Economics"],
    summary: "Once considered the gold standard of election forecasting. Accuracy has declined significantly post-2016, with critics noting his models increasingly lag markets rather than lead them. His 2024 presidential forecasts were significantly off on key swing state margins.",
    signal: "His public probability estimates now frequently trade at a premium on Kalshi. Many traders find value fading his published probabilities, especially in late-stage election markets.",
    trackRecord: "Excellent 2008–2012. Mixed 2016, poor 2020 & 2024 directional calls. Better as commentary than edge.",
    link: "https://www.natesilver.net",
  },
  {
    name: "Jim Cramer",
    subtitle: "@JimCramer — CNBC Mad Money host",
    reputation: "inverse" as const,
    focus: ["Federal Reserve", "Economics", "Markets", "Crypto"],
    summary: "Wall Street's most famous inverse indicator. Academic studies have shown that an inverse portfolio of Cramer's stock picks outperforms the market. The same 'Cramer Effect' extends to his macroeconomic calls: Fed pivot timing, recession predictions, and crypto bottom calls.",
    signal: "If Cramer confidently declares an economic outcome on TV, the opposite Kalshi position historically has positive expected value. Best used for Fed rate, recession, and CPI markets.",
    trackRecord: "Called crypto bottom at $36K (BTC hit $15K). Called \"no recession\" 3 months before 2022 slowdown. Called top of rate hikes 6 months early.",
    link: "https://en.wikipedia.org/wiki/Jim_Cramer",
  },
  {
    name: "Metaculus Community",
    subtitle: "metaculus.com — crowd forecasting platform",
    reputation: "mixed" as const,
    focus: ["Science", "Technology", "AI", "Geopolitics", "Health"],
    summary: "Aggregated crowd-sourced forecasting platform. Genuinely excellent on long-horizon science and technology questions. Notoriously slow to update on fast-moving political and financial events — crowds anchor too heavily to base rates and are slow to incorporate new information.",
    signal: "If Metaculus is 80%+ on a political question, check if markets have already priced it. They often lag live prediction markets by days. Good as a sanity-check baseline, not as a trading signal.",
    trackRecord: "Top-tier on AI capability forecasts, pandemic timelines, and space milestones. Below average on election outcomes and financial surprises.",
    link: "https://www.metaculus.com",
  },
  {
    name: "Samotsvety Forecasting",
    subtitle: "@Samotsvety — elite superforecaster team",
    reputation: "high" as const,
    focus: ["AI Risk", "Geopolitics", "Nuclear", "Science", "Economics"],
    summary: "One of the most accurate forecasting teams in existence. Consistently outperforms both prediction markets and individual expert consensus. When their published estimates diverge from live Kalshi prices by more than 10pp, that divergence is historically exploitable.",
    signal: "USE AS BENCHMARK. If Samotsvety disagrees with a current Kalshi market price by >10pp, this is worth deeper research. They tend to be right on geopolitics, AI milestones, and tail-risk events.",
    trackRecord: "Top-1% accuracy across Metaculus, Manifold, and Polymarket. Known for AI risk forecasts, Ukraine war timeline predictions, pandemic end-date calls.",
    link: "https://samotsvety.org",
  },
  {
    name: "Peter Thiel Network",
    subtitle: "Thiel Capital / Founders Fund political bets",
    reputation: "biased" as const,
    focus: ["US Politics", "Crypto Regulation", "AI Regulation", "Silicon Valley"],
    summary: "Thiel-affiliated entities have been documented making large politically-motivated prediction market bets aligned with candidates they fund. The bets serve dual purposes: financial upside and creating positive narrative momentum ('the smart money thinks X will win').",
    signal: "Large pro-libertarian, anti-regulation political market positions may be politically motivated rather than purely probabilistic. Useful for sentiment analysis but discount as pure edge signal.",
    trackRecord: "Won big on 2016 Trump (early backer). Positions in crypto regulation markets tend to over-estimate deregulation likelihood.",
    link: "https://en.wikipedia.org/wiki/Peter_Thiel",
  },
];

const REPUTATION_CONFIG: Record<string, { label: string; className: string }> = {
  controversial: { label: "⚠ Controversial",    className: "border-amber-500/30 text-amber-500 bg-amber-500/10"       },
  declining:     { label: "↘ Declining Edge",   className: "border-orange-500/30 text-orange-500 bg-orange-500/10"     },
  inverse:       { label: "↔ Inverse Indicator", className: "border-red-500/30 text-red-500 bg-red-500/10"             },
  mixed:         { label: "≈ Mixed Record",      className: "border-blue-500/30 text-blue-500 bg-blue-500/10"          },
  high:          { label: "✓ High Credibility",  className: "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" },
  biased:        { label: "⊘ Ideologically Biased", className: "border-purple-500/30 text-purple-500 bg-purple-500/10" },
};

// ── Portfolio Section (Overview) ──────────────────────────────────────────────

function PortfolioSection({ portfolio, onRefresh }: { portfolio: any; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  if (!portfolio) return null;

  const hasPositions = portfolio.positions?.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-purple-500" />Kalshi Portfolio
          </CardTitle>
          <button onClick={refresh} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {/* Balance row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Available Balance", value: fmtUSD(portfolio.available_usd),            cls: "text-emerald-600 dark:text-emerald-400" },
            { label: "Total at Stake",    value: fmtUSD(portfolio.total_at_stake_usd),        cls: "text-amber-500" },
            { label: "Max Payout",        value: fmtUSD(portfolio.total_max_payout_usd),      cls: "text-blue-500" },
            { label: "Potential Profit",  value: fmtUSD(portfolio.total_potential_profit_usd), cls: clrPnl(portfolio.total_potential_profit_usd) },
          ].map(m => (
            <div key={m.label} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
              <p className={cn("text-base font-bold font-mono", m.cls)}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Active filled positions */}
        {hasPositions && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              Active Positions ({portfolio.positions.length})
            </p>
            {portfolio.positions.map((pos: any, i: number) => {
              const closeDate = pos.close_time ? new Date(pos.close_time) : null;
              const daysLeft = closeDate ? Math.ceil((closeDate.getTime() - Date.now()) / 86400000) : null;
              const currentPrice = pos.side === "yes" ? pos.yes_bid : pos.no_bid;
              return (
                <div key={i} className={cn("rounded-lg border p-3",
                  pos.side === "yes" ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className={cn("text-[10px]",
                          pos.side === "yes" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 text-red-500")}>
                          {pos.side.toUpperCase()}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">{pos.ticker}</span>
                        {daysLeft !== null && (
                          <span className={cn("text-[10px]", daysLeft <= 3 ? "text-red-500 font-semibold" : "text-muted-foreground")}>
                            <Clock className="h-2.5 w-2.5 inline mr-0.5" />{daysLeft}d left
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold leading-tight mb-1.5">{pos.title}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                        <span>{pos.contracts} contracts</span>
                        <span>Cost: <span className="text-foreground font-mono">{fmtUSD(pos.cost_usd)}</span></span>
                        <span>Max payout: <span className="text-blue-500 font-mono">{fmtUSD(pos.max_payout_usd)}</span></span>
                        {currentPrice != null && (
                          <span>Current: <span className="font-mono">{(currentPrice * 100).toFixed(0)}¢</span></span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn("text-sm font-bold font-mono", clrPnl(pos.potential_profit_usd))}>
                        {pos.potential_profit_usd >= 0 ? "+" : ""}{fmtUSD(pos.potential_profit_usd)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">if win</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pending limit orders — placed on Kalshi, awaiting match */}
        {portfolio.pending_orders?.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Pending Orders — awaiting match ({portfolio.pending_orders.length})
            </p>
            {portfolio.pending_orders.map((order: any, i: number) => (
              <div key={i} className={cn("rounded-lg border p-3 opacity-80",
                order.side === "yes" ? "border-emerald-500/20 bg-emerald-500/5" : "border-blue-500/20 bg-blue-500/5")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className={cn("text-[10px]",
                        order.side === "yes" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-blue-500/30 text-blue-500")}>
                        {order.side.toUpperCase()}
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">{order.ticker}</span>
                      <Badge variant="secondary" className="text-[10px] border border-yellow-500/30 bg-yellow-500/10 text-yellow-600">
                        ⏳ Awaiting match
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold leading-tight mb-1.5">{order.title}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                      {order.contracts && <span>{order.contracts} contracts</span>}
                      {order.price && <span>Limit: <span className="text-foreground font-mono">{(order.price * 100).toFixed(0)}¢</span></span>}
                      {order.cost_usd > 0 && <span>Max cost: <span className="text-foreground font-mono">{fmtUSD(order.cost_usd)}</span></span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] font-mono text-muted-foreground">{order.status}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasPositions && !portfolio.pending_orders?.length && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">No open Kalshi positions or pending orders</p>
          </div>
        )}

        {portfolio.error && (
          <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />{portfolio.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Polymarket Portfolio Section ──────────────────────────────────────────────

function PolyPortfolioSection({ polyBalance, onRefresh }: { polyBalance: any; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  if (!polyBalance) return null;

  const positions: any[] = polyBalance.positions || [];

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-500" />Polymarket Portfolio
          </CardTitle>
          <button onClick={refresh} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {/* Balance row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: "USDC Balance",     value: fmtUSD(polyBalance.usdc_balance),     cls: "text-emerald-600 dark:text-emerald-400" },
            { label: "Total at Stake",   value: fmtUSD(polyBalance.at_stake),          cls: "text-amber-500" },
            { label: "Max Payout",       value: fmtUSD(polyBalance.max_payout),        cls: "text-blue-500" },
            { label: "Potential Profit", value: fmtUSD(polyBalance.potential_profit),  cls: clrPnl(polyBalance.potential_profit ?? 0) },
          ].map(m => (
            <div key={m.label} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
              <p className={cn("text-base font-bold font-mono", m.cls)}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Active positions from DB */}
        {positions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              Active Positions ({positions.length})
            </p>
            {positions.map((pos: any, i: number) => (
              <div key={i} className={cn("rounded-lg border p-3",
                pos.side === "yes" ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className={cn("text-[10px]",
                        pos.side === "yes" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 text-red-500")}>
                        {pos.side.toUpperCase()}
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">{pos.ticker}</span>
                      <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-500">Polymarket</Badge>
                    </div>
                    <p className="text-sm font-semibold leading-tight mb-1.5">{pos.title}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                      {pos.contracts && <span>{pos.contracts} contracts</span>}
                      <span>Cost: <span className="text-foreground font-mono">{fmtUSD(pos.cost_usd)}</span></span>
                      <span>Max payout: <span className="text-blue-500 font-mono">{fmtUSD(pos.max_payout_usd)}</span></span>
                      {pos.price != null && (
                        <span>Price: <span className="font-mono">{(pos.price * 100).toFixed(0)}¢</span></span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn("text-sm font-bold font-mono", clrPnl(pos.potential_profit))}>
                      {pos.potential_profit >= 0 ? "+" : ""}{fmtUSD(pos.potential_profit)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">if win</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {positions.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">No open Polymarket positions</p>
          </div>
        )}

        {polyBalance.error && (
          <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />{polyBalance.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Notable Traders Tab ───────────────────────────────────────────────────────

function NotableTradersTab() {
  const [research, setResearch] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState("");
  const [customResult, setCustomResult] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchResearch = async (name: string) => {
    if (research[name] || loading[name]) return;
    setLoading(l => ({ ...l, [name]: true }));
    try {
      const d = await fetch("/api/predictor/research-trader", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then(r => r.json());
      setResearch(r => ({ ...r, [name]: d.content || "No data available." }));
    } catch {
      setResearch(r => ({ ...r, [name]: "Research failed — check AI configuration." }));
    }
    setLoading(l => ({ ...l, [name]: false }));
  };

  const fetchCustom = async () => {
    const name = custom.trim();
    if (!name || customLoading) return;
    setCustomLoading(true);
    setCustomResult(null);
    try {
      const d = await fetch("/api/predictor/research-trader", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then(r => r.json());
      setCustomResult(d.content || "No data available.");
    } catch {
      setCustomResult("Research failed — check AI configuration.");
    }
    setCustomLoading(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-muted-foreground mb-4">
          Intelligence profiles on well-known prediction market participants. Useful for understanding market sentiment and spotting coordinated or biased trading activity.
        </p>

        <div className="space-y-3">
          {NOTABLE_TRADERS.map(trader => {
            const repCfg = REPUTATION_CONFIG[trader.reputation];
            const isExpanded = expanded === trader.name;
            const hasResearch = !!research[trader.name];
            const isLoading = loading[trader.name];
            return (
              <Card key={trader.name}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h3 className="text-sm font-semibold">{trader.name}</h3>
                        <Badge variant="outline" className={cn("text-[10px]", repCfg.className)}>
                          {repCfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{trader.subtitle}</p>
                    </div>
                    <a href={trader.link} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground flex-shrink-0">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {trader.focus.map(f => (
                      <Badge key={f} variant="secondary" className="text-[10px] px-1.5 py-0">{f}</Badge>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">{trader.summary}</p>

                  <div className="rounded-md border border-purple-500/20 bg-purple-500/5 px-3 py-2 mb-3">
                    <p className="text-[10px] text-purple-500 font-semibold uppercase tracking-wide mb-0.5">Trading Signal</p>
                    <p className="text-xs text-muted-foreground">{trader.signal}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        if (!hasResearch) fetchResearch(trader.name);
                        setExpanded(isExpanded ? null : trader.name);
                      }}
                      className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors border border-border rounded px-2 py-1"
                    >
                      {isLoading
                        ? <><Loader2 className="h-3 w-3 animate-spin" />Researching…</>
                        : hasResearch
                          ? <><Info className="h-3 w-3" />{isExpanded ? "Hide" : "View"} AI Research</>
                          : <><Brain className="h-3 w-3" />Get AI Research</>
                      }
                    </button>
                    <span className="text-[10px] text-muted-foreground">Track record: {trader.trackRecord}</span>
                  </div>

                  {isExpanded && hasResearch && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Brain className="h-3 w-3 text-purple-500" /> AI Intelligence Report
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{research[trader.name]}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Custom trader research */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-purple-500" />Research Any Trader
          </CardTitle>
          <CardDescription className="text-xs">Enter a name to get an AI-generated intelligence profile</CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex gap-2 mb-3">
            <Input
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="e.g. Manifold Markets, Robin Hanson, Superforecasters…"
              className="text-sm h-8"
              onKeyDown={e => e.key === "Enter" && fetchCustom()}
            />
            <Button size="sm" variant="outline" onClick={fetchCustom} disabled={customLoading || !custom.trim()} className="h-8 text-xs shrink-0">
              {customLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            </Button>
          </div>
          {customResult && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{customResult}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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

function PlatformBetsSection({
  platform, bets, onLoad, color,
}: {
  platform: "kalshi" | "polymarket";
  bets: any[];
  onLoad: () => void;
  color: string;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [msg, setMsg]               = useState<string | null>(null);

  const isCancelled = (b: any) => b.status === "cancelled" || b.status === "canceled";
  const open      = bets.filter(b => b.pnl == null && !isCancelled(b));
  const settled   = bets.filter(b => b.pnl != null);
  const cancelled = bets.filter(b => isCancelled(b));

  const handleSync = async () => {
    setSyncing(true); setMsg(null);
    try {
      const r = await fetch("/api/predictor/sync-orders", { method: "POST" });
      const d = await r.json();
      setMsg(d.error ? `Error: ${d.error}` : d.message);
      onLoad();
    } catch { setMsg("Network error"); }
    setSyncing(false);
  };

  const handleCancelAll = async () => {
    if (!confirm(`Cancel ALL open ${platform === "kalshi" ? "Kalshi" : "Polymarket"} limit orders? This cannot be undone.`)) return;
    setCancelling(true); setMsg(null);
    try {
      const r = await fetch("/api/predictor/bets", { method: "DELETE" });
      const d = await r.json();
      setMsg(d.error ? `Error: ${d.error}` : `Cancelled ${d.cancelled} of ${d.total} open order(s).`);
      onLoad();
    } catch { setMsg("Network error"); }
    setCancelling(false);
  };

  const isKalshi = platform === "kalshi";
  const label = isKalshi ? "Kalshi" : "Polymarket";
  const borderColor = isKalshi ? "border-purple-500/20" : "border-blue-500/20";
  const headColor = isKalshi ? "text-purple-500" : "text-blue-500";

  return (
    <Card className={`border ${borderColor}`}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className={`text-sm flex items-center gap-2 ${headColor}`}>
            {isKalshi ? <Scale className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            {label}
            <Badge variant="outline" className={`text-[10px] ${isKalshi ? "border-purple-500/30 text-purple-500" : "border-blue-500/30 text-blue-500"}`}>
              {bets.length} bet{bets.length !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>
          <div className="flex gap-1.5 flex-wrap">
            {msg && <p className="text-[10px] text-muted-foreground">{msg}</p>}
            {isKalshi && (
              <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} className="h-7 text-xs">
                <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync"}
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={handleCancelAll} disabled={cancelling} className="h-7 text-xs">
              <X className="h-3 w-3 mr-1" />{cancelling ? "Cancelling…" : "Cancel All"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 space-y-4">
        {!bets.length && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No {label} bets yet.{isKalshi ? " Run the pipeline or Sync to import." : " Run the pipeline to place Polymarket bets."}
          </p>
        )}
        {open.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-blue-500 mb-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Open ({open.length})
            </p>
            <div className="space-y-2">{open.map(bet => <BetCard key={bet.id} bet={bet} onCancelled={onLoad} />)}</div>
          </div>
        )}
        {settled.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Settled ({settled.length})</p>
            <div className="space-y-2">{settled.map(bet => <BetCard key={bet.id} bet={bet} />)}</div>
          </div>
        )}
        {cancelled.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground/50 mb-2">Cancelled ({cancelled.length})</p>
            <div className="space-y-2">{cancelled.map(bet => <BetCard key={bet.id} bet={bet} />)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BetsTab() {
  const [bets, setBets]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/predictor/history?type=bets")
      .then(r => r.json())
      .then(d => { setBets(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading bets…</p>;

  const kalshiBets = bets.filter(b => !b.platform || b.platform === "kalshi");
  const polyBets   = bets.filter(b => b.platform === "polymarket");

  return (
    <div className="space-y-4">
      <PlatformBetsSection platform="kalshi"     bets={kalshiBets} onLoad={load} color="purple" />
      <PlatformBetsSection platform="polymarket" bets={polyBets}   onLoad={load} color="blue" />
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
        const isPoly = c.platform === "polymarket";
        return (
          <Card key={c.id}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold">{c.market_title}</p>
                    <Badge variant="outline" className={cn("text-[10px] flex-shrink-0", isPoly ? "border-blue-500/30 text-blue-500" : "border-purple-500/30 text-purple-500")}>
                      {isPoly ? "Polymarket" : "Kalshi"}
                    </Badge>
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                    <span>Market: {(c.market_probability * 100).toFixed(0)}%</span>
                    <span className={isPoly ? "text-blue-500" : "text-purple-500"}>Ours: {(c.our_probability * 100).toFixed(0)}%</span>
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

// ── Runs History Tab ──────────────────────────────────────────────────────────

function RunsTab() {
  const [runs, setRuns]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/predictor/runs")
      .then(r => r.json())
      .then(d => { setRuns(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading run history…</p>;
  if (!runs.length) return (
    <div className="py-12 text-center space-y-2">
      <Clock className="h-8 w-8 mx-auto text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No runs yet. Press <strong>Start Pipeline</strong> to begin.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {runs.map((run: any) => {
        const councils = run.scan_json?.councils || [];
        const betsPlaced = run.bets_placed || 0;
        const isOpen = expanded === run.id;

        return (
          <Card key={run.id} className={cn("border", betsPlaced > 0 ? "border-emerald-500/30" : "border-border")}>
            <CardContent className="pt-4 pb-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {betsPlaced > 0 ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />{betsPlaced} bet{betsPlaced > 1 ? "s" : ""} placed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-muted text-muted-foreground">
                        No bets placed
                      </Badge>
                    )}
                    {(run.rounds || 1) > 1 && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/20 text-amber-500">
                        <RefreshCw className="h-2.5 w-2.5 mr-1" />{run.rounds} rounds
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmtHKT(new Date(run.logged_at), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} HKT
                    &nbsp;·&nbsp; {run.candidates_found || 0} markets analysed &nbsp;·&nbsp; {run.markets_scanned || 0} scanned
                  </p>
                </div>
              </div>

              {/* Result summary */}
              {run.result_summary && (
                <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">{run.result_summary}</p>
              )}

              {/* Council verdict pills */}
              {councils.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {councils.map((c: any) => {
                    const isPoly = c.platform === "polymarket";
                    return (
                    <span key={c.ticker} className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md border",
                      c.verdict === "BET_YES" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                      : c.verdict === "BET_NO" ? "border-red-500/30 text-red-500 bg-red-500/5"
                      : "border-border text-muted-foreground"
                    )}>
                      <span className={cn("text-[9px] px-0.5 rounded", isPoly ? "text-blue-500" : "text-purple-500")}>{isPoly ? "PY" : "KX"}</span>
                      {c.ticker?.split("-").slice(-2).join("-") || c.ticker}
                      <span className="opacity-60">
                        {c.verdict === "BET_YES" ? "YES" : c.verdict === "BET_NO" ? "NO" : "PASS"}
                        {c.edge != null ? ` ${(c.edge * 100).toFixed(1)}pp` : ""}
                      </span>
                    </span>
                    );
                  })}
                </div>
              )}

              {/* Expand toggle */}
              {councils.length > 0 && (
                <button onClick={() => setExpanded(isOpen ? null : run.id)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1">
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {isOpen ? "Hide" : "Show"} council details
                </button>
              )}

              {/* Expanded council detail */}
              {isOpen && councils.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-3">
                  {councils.map((c: any) => (
                    <div key={c.ticker} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold">{c.title || c.ticker}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{c.ticker}</p>
                        </div>
                        <div className="text-right text-[10px] space-y-0.5">
                          <p className={cn("font-bold",
                            c.verdict === "BET_YES" ? "text-emerald-600 dark:text-emerald-400"
                            : c.verdict === "BET_NO" ? "text-red-500" : "text-muted-foreground")}>
                            {c.verdict}
                          </p>
                          {c.edge != null && <p className="text-muted-foreground">Edge: {(c.edge * 100).toFixed(1)}pp</p>}
                          {c.confidence && <p className="text-muted-foreground capitalize">{c.confidence} conf.</p>}
                        </div>
                      </div>
                      {c.reasoning && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-border pl-3">{c.reasoning}</p>
                      )}
                      <div className="flex gap-3 text-[10px] text-muted-foreground">
                        {c.yes_price != null && <span>Market: {(c.yes_price * 100).toFixed(0)}%</span>}
                        {c.final_probability != null && <span className="text-purple-500">Ours: {(c.final_probability * 100).toFixed(0)}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {/* ── Kalshi ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mt-1">
        <Scale className="h-4 w-4 text-purple-500" />
        <p className="text-xs font-semibold text-purple-500 uppercase tracking-wider">Kalshi</p>
        <div className="flex-1 h-px bg-purple-500/20" />
      </div>

      {/* Kalshi thresholds */}
      <Card className="border-purple-500/15">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Bet Sizing</CardTitle>
          <CardDescription className="text-xs">Controls when and how much the agent bets on Kalshi</CardDescription>
        </CardHeader>
        <CardContent className="pb-4 space-y-4">
          <ChoiceRow k="min_edge" label="Minimum Edge Threshold"
            choices={["0.05", "0.10", "0.15", "0.20", "0.25", "0.30"]}
            fmt={v => `${(parseFloat(v) * 100).toFixed(0)}pp`} />
          <ChoiceRow k="max_bet_usd" label="Max Bet Per Market (USD)"
            choices={["10", "25", "50", "75", "100", "200"]}
            fmt={v => `$${v}`} />
          <ChoiceRow k="kelly_fraction" label="Kelly Fraction"
            choices={["0.10", "0.15", "0.25", "0.33", "0.50"]}
            fmt={v => `${(parseFloat(v) * 100).toFixed(0)}%`} />
          <FieldRow k="max_positions" label="Max Open Positions" desc="Maximum number of concurrent open bets across both platforms" placeholder="10" />
        </CardContent>
      </Card>

      {/* Kalshi mode & schedule */}
      <Card className="border-purple-500/15">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Trading Mode & Schedule</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-3">
          <ToggleRow k="cron_enabled" label="Auto-Scan (every 2 hours)" desc="Automatically scan Kalshi + Polymarket and place bets when edge is found" />
          <Separator />
          <ChoiceRow k="mode" label="Kalshi Mode"
            choices={["demo", "live"]}
            fmt={v => v === "live" ? "⚠ LIVE" : "Demo (paper)"} />
          <p className="text-[10px] text-amber-500 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Live mode places real money bets. Use Demo until you're confident.
          </p>
        </CardContent>
      </Card>

      {/* ── Polymarket ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mt-2">
        <Globe className="h-4 w-4 text-blue-500" />
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Polymarket</p>
        <div className="flex-1 h-px bg-blue-500/20" />
      </div>

      {/* Polymarket settings */}
      <Card className="border-blue-500/15">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Polymarket Settings</CardTitle>
          <CardDescription className="text-xs">Scan and bet on Polygon-based Polymarket prediction markets</CardDescription>
        </CardHeader>
        <CardContent className="pb-4 space-y-3">
          <ToggleRow k="poly_enabled" label="Enable Polymarket Scanning" desc="Include Polymarket markets in the prediction pipeline alongside Kalshi" />
          <Separator />
          <ChoiceRow k="poly_max_bet_usd" label="Max Bet Per Market (USD)"
            choices={["5", "10", "20", "50", "100"]}
            fmt={v => `$${v}`} />
          <p className="text-[10px] text-blue-500/80 flex items-center gap-1">
            <Info className="h-3 w-3" /> Bets placed in USDC on Polygon. Requires POLY_PRIVATE_KEY + POLY_API_KEY secrets.
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
          <ChoiceRow k="time_horizon_days" label="Time Horizon"
            choices={["7", "14", "30", "60", "90"]}
            fmt={v => v === "7" ? "1 week" : v === "14" ? "2 weeks" : v === "30" ? "1 month" : v === "60" ? "2 months" : "3 months"} />
          <p className="text-[10px] text-muted-foreground -mt-2">Politics & economics markets on Kalshi typically resolve in weeks to months. "1 month" is the sweet spot — enough candidates, close enough to judge accurately.</p>
          <FieldRow k="min_volume" label="Minimum Market Volume" desc="Skip markets with fewer contracts traded (0 = no filter)" placeholder="0" />
          <FieldRow k="min_confidence_score" label="Minimum Confidence Score (0-1)" desc="Council agents must reach this confidence to trigger a bet" placeholder="0.6" />
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Kalshi Credentials</CardTitle>
              <CardDescription className="text-xs">Stored as Replit Secrets — manage via the Secrets panel</CardDescription>
            </div>
            {settings.mode && (
              <Badge
                variant="outline"
                className={settings.mode === "live"
                  ? "text-[10px] border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                  : "text-[10px] border-yellow-500/40 text-yellow-600 bg-yellow-500/10"}
              >
                {settings.mode === "live" ? "● Live" : "○ Demo"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-4 space-y-3 text-xs">
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Live / Production</p>
            {[
              ["KALSHI_KEY_ID_LIVE",      "API key ID", settings.has_kalshi_creds],
              ["KALSHI_PRIVATE_KEY_LIVE", "RSA private key (PEM)", settings.has_kalshi_creds],
            ].map(([k, desc, set]) => (
              <div key={k as string} className="flex items-center justify-between gap-2">
                <span className="font-mono text-foreground text-[11px]">{k as string}</span>
                <div className="flex items-center gap-1.5 text-right text-[11px] text-muted-foreground">
                  <span>{desc as string}</span>
                  {(set as boolean) ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 pt-1 border-t">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Demo / Sandbox</p>
            {[
              ["KALSHI_EMAIL_DEMO",    "Demo account email"],
              ["KALSHI_PASSWORD_DEMO","Demo account password"],
            ].map(([k, desc]) => (
              <div key={k} className="flex items-start justify-between gap-2 opacity-60">
                <span className="font-mono text-foreground text-[11px]">{k}</span>
                <span className="text-right text-[11px] text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
          <div className="pt-1 border-t">
            <p className="text-[10px] text-muted-foreground">
              Active mode is controlled by the <span className="font-mono text-foreground">Mode</span> setting above. Live keys are always used when mode = live.
              Currently: <span className={`font-semibold ${settings.mode === "live" ? "text-emerald-600" : "text-yellow-600"}`}>{settings.mode || "live"}</span>
            </p>
          </div>
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
  const [portfolio, setPortfolio]     = useState<any>(null);
  const [polyBalance, setPolyBalance] = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [running, setRunning]         = useState(false);
  const [scanning, setScanning]       = useState(false);
  const [stageStatus, setStageStatus] = useState<any>({});
  const [runLog, setRunLog]           = useState<string[]>([]);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [tab, setTab]                 = useState<"overview" | "bets" | "runs" | "analytics" | "chat" | "councils" | "settings" | "traders">("overview");
  const [runsKey, setRunsKey]         = useState(0);

  const loadPortfolio = useCallback(async () => {
    try {
      const [d, pb] = await Promise.all([
        fetch("/api/predictor/portfolio").then(r => r.json()),
        fetch("/api/predictor/poly-balance").then(r => r.json()),
      ]);
      setPortfolio(d);
      setPolyBalance(pb);
    } catch {}
  }, []);

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

  useEffect(() => { loadStats(); loadPortfolio(); }, [loadStats, loadPortfolio]);
  useEffect(() => {
    const t = setInterval(() => { loadStats(); loadPortfolio(); }, 60000);
    return () => clearInterval(t);
  }, [loadStats, loadPortfolio]);

  const runPipeline = async () => {
    setRunning(true);
    setStageStatus({});
    setRunLog([]);
    try {
      const response = await fetch("/api/predictor/run", { method: "POST" });
      if (!response.body) { setRunning(false); return; }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim());
            if (ev.type === "stage") {
              setStageStatus((prev: any) => ({
                ...prev,
                [ev.stage]: { status: ev.status, log: ev.msg },
              }));
              setRunLog((prev) => [...prev, ev.msg]);
            } else if (ev.type === "done" || ev.type === "error") {
              await loadStats();
              await loadPortfolio();
              setRunsKey(k => k + 1);
            }
          } catch {}
        }
      }
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
    { id: "overview"  as const, label: "Overview",  Icon: Eye           },
    { id: "bets"      as const, label: "Bets",       Icon: DollarSign    },
    { id: "runs"      as const, label: "Runs",       Icon: RefreshCw     },
    { id: "analytics" as const, label: "Analytics",  Icon: BarChart2     },
    { id: "chat"      as const, label: "Chat",       Icon: MessageSquare },
    { id: "councils"  as const, label: "Councils",   Icon: Users         },
    { id: "traders"   as const, label: "Intel",      Icon: UserX         },
    { id: "settings"  as const, label: "Settings",   Icon: Shield        },
  ];

  const kalshiAvail   = portfolio?.available_usd ?? null;
  const kalshiAtStake = portfolio?.total_at_stake_usd ?? null;
  const kalshiPayout  = portfolio?.total_max_payout_usd ?? null;
  const polyAvail     = polyBalance?.usdc_balance ?? null;
  const polyAtStake   = polyBalance?.at_stake ?? null;
  const polyPayout    = polyBalance?.max_payout ?? null;

  return (
    <TraderLayout>
      <div>
        <TradingPageHeader
          title="Claude Predictor"
          subtitle="Multi-agent council debate system for Kalshi + Polymarket prediction markets"
          icon={<Scale className="h-6 w-6" />}
          accentClass="text-purple-500"
          loading={loading}
          balance={[
            { label: "Kalshi Balance",  value: kalshiAvail  != null ? `$${kalshiAvail.toFixed(2)}`  : "—", color: "purple" },
            { label: "Kalshi At Stake", value: kalshiAtStake != null ? `$${kalshiAtStake.toFixed(2)}` : "—", color: "amber"  },
            { label: "Kalshi Payout",   value: kalshiPayout != null ? `$${kalshiPayout.toFixed(2)}` : "—", color: "green"  },
            { label: "Poly USDC",       value: polyAvail    != null ? `$${polyAvail.toFixed(2)}`    : "—", color: "blue"   },
            { label: "Poly At Stake",   value: polyAtStake  != null ? `$${polyAtStake.toFixed(2)}`  : "—", color: "amber"  },
            { label: "Poly Payout",     value: polyPayout   != null ? `$${polyPayout.toFixed(2)}`   : "—", color: "blue"   },
          ]}
          stats={[
            { label: "Total Bets",   value: String(stats?.total_bets ?? "—") },
            { label: "Active",       value: String(stats?.active_positions ?? "—"), color: "blue"   },
            { label: "Win Rate",     value: stats?.win_rate != null ? `${stats.win_rate.toFixed(0)}%` : "—", color: (stats?.win_rate ?? 0) >= 50 ? "green" : "red" },
            { label: "ROI",          value: stats?.roi != null ? `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%` : "—", color: pnlColor(stats?.roi ?? 0) },
            { label: "Avg Edge",     value: stats?.avg_edge != null ? `${(stats.avg_edge * 100).toFixed(1)}pp` : "—", color: "blue" },
          ]}
          badges={<>
            {settings.mode && (
              <Badge variant="outline" className={cn("text-[10px]",
                settings.mode === "live" ? "border-red-500/30 text-red-500" : "border-muted text-muted-foreground")}>
                {settings.mode === "live" ? "🔴 LIVE" : "DEMO"} mode
              </Badge>
            )}
            {settings.poly_enabled === "true" && (
              <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-500">Polymarket ON</Badge>
            )}
            {settings.cron_enabled === "true" && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">Cron — 2h</Badge>
            )}
          </>}
        />

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
                    {settings.cron_enabled === "true" && (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 ml-auto">
                        Auto · every 2h
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  {/* Time horizon quick-switch */}
                  <div className="mb-4">
                    <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Resolves within:
                    </p>
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { v: "7",  label: "1 week",    note: "very few" },
                        { v: "14", label: "2 weeks",   note: "few" },
                        { v: "30", label: "1 month",   note: "most" },
                        { v: "60", label: "2 months",  note: "more" },
                        { v: "90", label: "3 months",  note: "widest" },
                      ].map(opt => (
                        <button key={opt.v}
                          onClick={() => updateSetting("time_horizon_days", opt.v)}
                          className={cn("text-[10px] px-2.5 py-1.5 rounded-md border transition-colors flex flex-col items-center gap-0.5",
                            settings.time_horizon_days === opt.v
                              ? "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              : "border-border text-muted-foreground hover:text-foreground")}>
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-[9px] opacity-60">{opt.note}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                      Politics/economics markets on Kalshi typically resolve in weeks–months, not days
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <Button size="sm" variant="outline" onClick={runPipeline} disabled={running}
                      className="text-xs border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20">
                      {running ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Play className="h-3 w-3 mr-1.5" />}
                      {running ? "Running…" : "Run Full Pipeline"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={runScan} disabled={scanning || running} className="text-xs">
                      {scanning ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Search className="h-3 w-3 mr-1.5" />}
                      Scan Only
                    </Button>
                    {settings.mode && (
                      <Badge variant="secondary"
                        className={settings.mode === "live"
                          ? "text-[10px] border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 animate-pulse"
                          : "text-[10px] border border-yellow-500/40 bg-yellow-500/10 text-yellow-600"}>
                        {settings.mode === "live" ? "● LIVE — real money" : "○ Demo mode"}
                      </Badge>
                    )}
                  </div>

                  {/* Progress bar — visible while running or after a run */}
                  {(running || Object.keys(stageStatus).length > 0) && (() => {
                    const doneCount = Object.values(stageStatus).filter((s: any) => s.status === "done").length;
                    const runningCount = Object.values(stageStatus).filter((s: any) => s.status === "running").length;
                    const pct = running
                      ? Math.round(((doneCount + runningCount * 0.5) / STAGES.length) * 100)
                      : doneCount === STAGES.length ? 100 : Math.round((doneCount / STAGES.length) * 100);
                    return (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {running ? `Stage ${Object.keys(stageStatus).length} / ${STAGES.length}` : doneCount === STAGES.length ? "Complete" : "Stopped"}
                          </span>
                          <span className="text-[10px] text-purple-500 font-mono font-bold">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5 [&>div]:bg-purple-500" />
                      </div>
                    );
                  })()}

                  <div className="space-y-0">
                    {STAGES.map((s, i) => {
                      const st = stageStatus[s.id];
                      return (
                        <div key={s.id} className={cn("flex items-center gap-3 py-2.5", i < STAGES.length - 1 ? "border-b border-border/50" : "")}>
                          {st?.status === "running"
                            ? <RefreshCw className="h-3.5 w-3.5 flex-shrink-0 text-amber-500 animate-spin" />
                            : <s.icon className={cn("h-3.5 w-3.5 flex-shrink-0",
                                st?.status === "done" ? "text-emerald-500" : "text-muted-foreground/30")} />}
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-xs font-medium", st?.status ? "text-foreground" : "text-muted-foreground")}>{s.name}</p>
                            {st?.log && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{st.log}</p>}
                          </div>
                          <StagePill status={st?.status} />
                        </div>
                      );
                    })}
                  </div>

                  {/* Live log feed — latest 5 messages while running */}
                  {running && runLog.length > 0 && (
                    <div className="mt-3 rounded-md border border-border/50 bg-muted/30 p-2.5 space-y-0.5 max-h-24 overflow-y-auto">
                      {runLog.slice(-5).map((line, i) => (
                        <p key={i} className="text-[10px] font-mono text-muted-foreground leading-relaxed">{line}</p>
                      ))}
                    </div>
                  )}
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
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Auto-scan</p>
                        <p className="text-[9px] text-muted-foreground/60">Runs every 2 hours</p>
                      </div>
                      <button onClick={() => updateSetting("cron_enabled", settings.cron_enabled === "true" ? "false" : "true")}
                        className={cn("text-xs px-2 py-0.5 rounded border transition-colors",
                          settings.cron_enabled === "true" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground")}>
                        {settings.cron_enabled === "true" ? "ON" : "OFF"}
                      </button>
                    </div>
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
                  {scanResults.map((m: any, i: number) => {
                    const isPoly = m.platform === "polymarket";
                    return (
                    <div key={i} className={cn("flex items-center gap-3 p-3 rounded-lg border", isPoly ? "border-blue-500/20 bg-blue-500/5" : "border-amber-500/20 bg-amber-500/5")}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">{m.ticker}</span>
                          <Badge variant="outline" className={cn("text-[10px]", isPoly ? "border-blue-500/20 text-blue-500" : "border-amber-500/20 text-amber-500")}>Score: {m.score}</Badge>
                          <Badge variant="outline" className={cn("text-[10px]", isPoly ? "border-blue-500/30 text-blue-500" : "border-purple-500/30 text-purple-500")}>{isPoly ? "Polymarket" : "Kalshi"}</Badge>
                        </div>
                        <p className="text-sm font-semibold">{m.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{m.why}</p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-0.5">
                        <p className="text-xs text-muted-foreground">Market: <span className="font-mono">{(m.yes_price * 100).toFixed(0)}%</span></p>
                        <p className={cn("text-xs", isPoly ? "text-blue-500" : "text-purple-500")}>Ours: <span className="font-mono">{(m.your_estimate * 100).toFixed(0)}%</span></p>
                        <p className="text-xs font-bold font-mono text-amber-500">Edge: {((m.your_estimate - m.yes_price) * 100).toFixed(1)}pp</p>
                      </div>
                    </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Portfolios — Kalshi + Polymarket side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PortfolioSection portfolio={portfolio} onRefresh={loadPortfolio} />
              <PolyPortfolioSection polyBalance={polyBalance} onRefresh={loadPortfolio} />
            </div>

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
        {tab === "runs"      && <RunsTab key={runsKey} />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "chat"      && <ChatTab />}
        {tab === "councils"  && <CouncilsTab />}
        {tab === "traders"   && <NotableTradersTab />}
        {tab === "settings"  && <SettingsTab settings={settings} onUpdate={updateSetting} />}
      </div>
    </TraderLayout>
  );
}
