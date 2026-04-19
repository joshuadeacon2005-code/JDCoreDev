import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Send, Bot, User, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Zap, RefreshCw, ChevronDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── Re-usable TraderNav (duplicated here to avoid cross-page import) ────────
const MODES = [
  { value: "general",   label: "All Agents",  color: "#6b7280",  bg: "bg-gray-500/10",   text: "text-gray-600 dark:text-gray-400" },
  { value: "day",       label: "Day",         color: "#008080",  bg: "bg-teal-500/10",   text: "text-teal-600 dark:text-teal-400" },
  { value: "swing",     label: "Swing",       color: "#8b5cf6",  bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" },
  { value: "portfolio", label: "Portfolio",   color: "#16a34a",  bg: "bg-green-500/10",  text: "text-green-600 dark:text-green-400" },
  { value: "crypto",    label: "Crypto",      color: "#f97316",  bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400" },
];

function modeCfg(m: string) {
  return MODES.find(x => x.value === m) || MODES[0];
}

// ── Action confirmation card ─────────────────────────────────────────────────
function ActionCard({
  action, mode, onExecute, onDismiss, isPending,
}: {
  action: { type: string; symbol: string; amount_usd?: number; reason?: string; confidence?: string };
  mode: string;
  onExecute: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const cfg = modeCfg(mode);
  const isBuy = action.type === "buy";
  return (
    <div className={cn("rounded-lg border p-4 mt-2 space-y-3", isBuy ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
      <div className="flex items-center gap-2">
        {isBuy ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
        <span className="font-semibold text-sm">
          Proposed Action: {action.type.toUpperCase()} {action.symbol}
          {isBuy && action.amount_usd ? ` · $${action.amount_usd.toLocaleString()}` : " · close position"}
        </span>
        {action.confidence && (
          <Badge variant="outline" className="text-[10px] ml-auto capitalize">{action.confidence} confidence</Badge>
        )}
      </div>
      {action.reason && <p className="text-xs text-muted-foreground">{action.reason}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={onExecute} disabled={isPending}
          className={isBuy ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}>
          {isPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Execute via Alpaca
        </Button>
        <Button size="sm" variant="outline" onClick={onDismiss} disabled={isPending}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  msg, mode, onExecute, onDismiss, executingId, executedIds,
}: {
  msg: any;
  mode: string;
  onExecute: (id: number, action: any) => void;
  onDismiss: (id: number) => void;
  executingId: number | null;
  executedIds: Set<number>;
}) {
  const isUser = msg.role === "user";
  const cfg = modeCfg(msg.mode || mode);
  const action = msg.metadata?.action;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-0.5",
        isUser ? "bg-primary/10 text-primary" : "bg-muted"
      )}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>

      {/* Content */}
      <div className={cn("max-w-[80%] space-y-1", isUser ? "items-end" : "items-start")}>
        <div className={cn(
          "rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted rounded-tl-sm"
        )}>
          {msg.content}
        </div>

        {/* Action card for assistant messages */}
        {!isUser && action && !executedIds.has(msg.id) && (
          <ActionCard
            action={action}
            mode={mode}
            onExecute={() => onExecute(msg.id, action)}
            onDismiss={() => onDismiss(msg.id)}
            isPending={executingId === msg.id}
          />
        )}
        {!isUser && executedIds.has(msg.id) && action && (
          <div className="flex items-center gap-1 text-[11px] text-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Order submitted
          </div>
        )}

        <p className={cn("text-[10px] text-muted-foreground px-1", isUser ? "text-right" : "")}>
          {msg.created_at ? formatDistanceToNow(new Date(msg.created_at), { addSuffix: true }) : "just now"}
          {!isUser && msg.mode && msg.mode !== "general" && (
            <span className={cn("ml-2 font-medium", modeCfg(msg.mode).text)}>
              {modeCfg(msg.mode).label}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTED = [
  "Why are we still holding our current positions?",
  "Which holdings have underperformed their original thesis?",
  "What's your current outlook for the day trading mode?",
  "I heard Nvidia is releasing major news — should we increase exposure?",
  "Run me through the last pipeline decision and its rationale.",
  "Are there any positions I should consider closing?",
];

// ── Main page ────────────────────────────────────────────────────────────────
export default function TraderChat() {
  const [mode, setMode] = useState("general");
  const [input, setInput] = useState("");
  const [pendingActions, setPendingActions] = useState<Set<number>>(new Set());
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [executedIds, setExecutedIds] = useState<Set<number>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/trader/chat", mode],
    queryFn: async () => {
      const r = await fetch(`/api/trader/chat?mode=${mode}&limit=100`);
      return r.json();
    },
    refetchInterval: 10000,
  });

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const r = await fetch("/api/trader/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, mode }),
      });
      if (!r.ok) throw new Error("Failed to send message");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trader/chat", mode] });
      refetch();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (params: { msgId: number; action: any }) => {
      const r = await fetch("/api/trader/chat/execute-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: params.action.symbol,
          type: params.action.type,
          amount_usd: params.action.amount_usd,
          reason: params.action.reason,
          mode,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Execution failed");
      }
      return { ...(await r.json()), msgId: params.msgId };
    },
    onSuccess: (data) => {
      setExecutedIds(prev => new Set(prev).add(data.msgId));
      setExecutingId(null);
      toast({ title: "Order submitted", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/trader/chat", mode] });
    },
    onError: (e: Error) => {
      setExecutingId(null);
      toast({ title: "Execution failed", description: e.message, variant: "destructive" });
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMutation.isPending]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExecute = (msgId: number, action: any) => {
    setExecutingId(msgId);
    executeMutation.mutate({ msgId, action });
  };

  const handleDismiss = (msgId: number) => {
    setDismissedIds(prev => new Set(prev).add(msgId));
  };

  const visibleMessages = messages.filter((m: any) => !dismissedIds.has(m.id));

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Agent Chat
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ask the AI why it made decisions, discuss trade ideas, and execute actions
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>

        {/* Mode filter */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {MODES.map(m => (
            <button key={m.value} onClick={() => setMode(m.value)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-all font-medium",
                mode === m.value
                  ? `${m.bg} ${m.text} border-current/30`
                  : "border-border text-muted-foreground hover:text-foreground"
              )}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
          {/* Chat panel */}
          <Card className="flex flex-col" style={{ height: "calc(100vh - 280px)", minHeight: 480 }}>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Start a conversation</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                      Ask about current holdings, past decisions, or new investment ideas. The AI has full context of all trades and pipeline runs.
                    </p>
                  </div>
                </div>
              ) : (
                visibleMessages.map((msg: any) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    mode={mode}
                    onExecute={handleExecute}
                    onDismiss={handleDismiss}
                    executingId={executingId}
                    executedIds={executedIds}
                  />
                ))
              )}

              {/* Typing indicator */}
              {sendMutation.isPending && (
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="bg-muted rounded-xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    {[0, 0.2, 0.4].map((delay, i) => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                        style={{ animationDelay: `${delay}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3 space-y-2">
              <div className="flex gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about a position, suggest a trade idea, or discuss strategy… (Enter to send)"
                  className="min-h-[60px] max-h-[120px] resize-none text-sm"
                  data-testid="input-chat-message"
                  disabled={sendMutation.isPending}
                />
                <Button onClick={handleSend} disabled={!input.trim() || sendMutation.isPending}
                  size="sm" className="self-end h-9 w-9 p-0" data-testid="button-send-message">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                <AlertTriangle className="h-2.5 w-2.5 inline mr-1" />
                Trade actions require confirmation before execution via Alpaca.
              </p>
            </div>
          </Card>

          {/* Sidebar: suggested prompts */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Suggested Questions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1.5">
                {SUGGESTED.map((s, i) => (
                  <button key={i} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="w-full text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors border border-transparent hover:border-border"
                    data-testid={`button-suggested-${i}`}>
                    {s}
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {[
                  { icon: <Bot className="h-3 w-3" />, text: "Full pipeline context" },
                  { icon: <TrendingUp className="h-3 w-3" />, text: "Trade history & rationale" },
                  { icon: <Zap className="h-3 w-3" />, text: "Execute via Alpaca" },
                  { icon: <MessageSquare className="h-3 w-3" />, text: "Persistent conversation" },
                ].map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-primary">{c.icon}</span>
                    {c.text}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
