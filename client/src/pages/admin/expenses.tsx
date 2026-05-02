import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Receipt, Check, X, ExternalLink, Mail, Plus, RefreshCw, AlertTriangle,
  TrendingDown, Inbox, Tag, Play,
} from "lucide-react";

type Expense = {
  id: number;
  vendor: string;
  amount: string;
  currency: string;
  category: string | null;
  frequency: string;
  dated_at: string;
  notes: string | null;
  source: string;
  gmail_account: string | null;
  gmail_message_id: string | null;
  gmail_message_url: string | null;
  ai_confidence: number | null;
  possible_duplicate_of: number | null;
  created_at: string;
};

type QueueItem = {
  id: number;
  vendor: string;
  amount: string;
  currency: string;
  suggested_category: string | null;
  dated_at: string;
  notes: string | null;
  gmail_account: string | null;
  gmail_message_id: string | null;
  gmail_message_url: string | null;
  raw_excerpt: string | null;
  ai_confidence: number | null;
  ai_rationale: string | null;
  possible_duplicate_of_expense: number | null;
  possible_duplicate_of_queue: number | null;
  status: string;
  created_at: string;
};

type Summary = {
  byMonth: { month: string; currency: string; total: string }[];
  byCategory: { category: string; currency: string; total: string }[];
  totalsByFrequency: { frequency: string; n: number; total: string }[];
  queuePending: number;
};

const fmtCurrency = (amount: string | number, currency: string) => {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function AdminExpenses() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"confirmed" | "undecided" | "add">("undecided");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [newExpense, setNewExpense] = useState<any>({ vendor: "", amount: "", currency: "HKD", category: "", frequency: "one_off", dated_at: new Date().toISOString().slice(0, 10), notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, qRes, sRes] = await Promise.all([
        fetch("/api/expenses").then(r => r.json()),
        fetch("/api/expenses/queue").then(r => r.json()),
        fetch("/api/expenses/summary").then(r => r.json()),
      ]);
      setExpenses(eRes.expenses || []);
      setQueue(qRes.queue || []);
      setSummary(sRes);
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const fireScanner = async () => {
    setScanning(true);
    try {
      const r = await fetch("/api/expenses/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "manual fire from /admin/expenses" }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: "Could not fire scanner", description: d?.hint || d?.error || `HTTP ${r.status}`, variant: "destructive" });
      } else {
        toast({ title: "Scanner dispatched", description: "Check back in a few minutes for new expenses + queue items." });
      }
    } catch (e: any) {
      toast({ title: "Dispatch error", description: e.message, variant: "destructive" });
    }
    setScanning(false);
  };

  const approve = async (id: number) => {
    setActingId(id);
    try {
      const r = await fetch(`/api/expenses/queue/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: "Approve failed", description: d?.error || `HTTP ${r.status}`, variant: "destructive" });
      } else {
        toast({ title: "Approved", description: `${d.expense?.vendor} → business_expenses` });
        await load();
      }
    } catch (e: any) {
      toast({ title: "Approve error", description: e.message, variant: "destructive" });
    }
    setActingId(null);
  };

  const reject = async (id: number) => {
    setActingId(id);
    try {
      const r = await fetch(`/api/expenses/queue/${id}/reject`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: "Reject failed", description: d?.error || `HTTP ${r.status}`, variant: "destructive" });
      } else {
        toast({ title: "Rejected", description: "Vendor remembered as personal — future receipts will skip the queue." });
        await load();
      }
    } catch (e: any) {
      toast({ title: "Reject error", description: e.message, variant: "destructive" });
    }
    setActingId(null);
  };

  const deleteExpense = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const submitNewExpense = async () => {
    try {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newExpense),
      });
      const d = await r.json();
      if (!r.ok) {
        toast({ title: "Add failed", description: d?.error || `HTTP ${r.status}`, variant: "destructive" });
        return;
      }
      toast({ title: "Added", description: `${d.expense?.vendor}` });
      setNewExpense({ ...newExpense, vendor: "", amount: "", category: "", notes: "" });
      await load();
    } catch (e: any) {
      toast({ title: "Add error", description: e.message, variant: "destructive" });
    }
  };

  const thisMonthTotal = useMemo(() => {
    if (!summary?.byMonth) return 0;
    const yyyymm = new Date().toISOString().slice(0, 7);
    return summary.byMonth
      .filter(r => r.month === yyyymm)
      .reduce((s, r) => s + parseFloat(r.total), 0);
  }, [summary]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Receipt className="h-6 w-6 text-violet-500" />
              Business Expenses
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Auto-scanned from Gmail by the Expense Scanner routine. Confirm undecided items below.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 text-xs">
              <RefreshCw className={cn("h-3 w-3 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={fireScanner} disabled={scanning} className="h-8 text-xs bg-violet-600 hover:bg-violet-700">
              <Play className="h-3 w-3 mr-1.5" />
              {scanning ? "Dispatching…" : "Run scanner now"}
            </Button>
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3" /> This month
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-2xl font-bold font-mono">HKD {thisMonthTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Confirmed business expenses</p>
            </CardContent>
          </Card>

          <Card className={cn(summary?.queuePending && summary.queuePending > 0 && "border-amber-500/30 bg-amber-500/5")}>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Inbox className="h-3 w-3" /> Undecided
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <p className={cn("text-2xl font-bold", summary?.queuePending && summary.queuePending > 0 ? "text-amber-600 dark:text-amber-400" : "")}>
                {summary?.queuePending ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Awaiting your ✅/❌</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3 w-3" /> Top categories
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {summary?.byCategory?.slice(0, 3).map((c, i) => (
                <p key={i} className="text-[11px] flex justify-between">
                  <span className="text-muted-foreground">{c.category}</span>
                  <span className="font-mono">{fmtCurrency(c.total, c.currency)}</span>
                </p>
              )) || <p className="text-xs text-muted-foreground">—</p>}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="undecided" className="text-xs">
              Undecided
              {summary?.queuePending ? (
                <Badge variant="outline" className="ml-2 h-4 text-[9px] border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5">
                  {summary.queuePending}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="confirmed" className="text-xs">Confirmed ({expenses.length})</TabsTrigger>
            <TabsTrigger value="add" className="text-xs">Add manually</TabsTrigger>
          </TabsList>

          {/* Undecided */}
          <TabsContent value="undecided" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {queue.length === 0 ? (
                  <div className="text-center py-10">
                    <Check className="h-8 w-8 mx-auto text-emerald-500/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Inbox zero — no items awaiting review.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {queue.map(q => (
                      <div key={q.id} className="p-4 flex items-start justify-between gap-3 hover:bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{q.vendor}</p>
                            <span className="font-mono text-sm">{fmtCurrency(q.amount, q.currency)}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {Math.round((q.ai_confidence ?? 0) * 100)}% confidence
                            </Badge>
                            {(q.possible_duplicate_of_expense || q.possible_duplicate_of_queue) && (
                              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5">
                                <AlertTriangle className="h-2.5 w-2.5 mr-1" />Possible duplicate
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {fmtDate(q.dated_at)} · {q.gmail_account || "—"} · {q.suggested_category || "uncategorised"}
                          </p>
                          {q.ai_rationale && (
                            <p className="text-[11px] text-muted-foreground mt-1 italic">"{q.ai_rationale}"</p>
                          )}
                          {q.gmail_message_url && (
                            <a href={q.gmail_message_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-violet-500 hover:underline mt-1">
                              <Mail className="h-2.5 w-2.5" />Open in Gmail<ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="sm" className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => approve(q.id)} disabled={actingId === q.id}>
                            <Check className="h-3 w-3 mr-1" />Yes
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 border-red-500/30 text-red-500 hover:bg-red-500/10"
                            onClick={() => reject(q.id)} disabled={actingId === q.id}>
                            <X className="h-3 w-3 mr-1" />No
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Confirmed */}
          <TabsContent value="confirmed" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {expenses.length === 0 ? (
                  <div className="text-center py-10">
                    <Receipt className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {expenses.map(e => (
                      <div key={e.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 text-sm">
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                          <div>
                            <p className="font-semibold truncate">{e.vendor}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {fmtDate(e.dated_at)} · {e.category || "uncategorised"} · {e.frequency} · via {e.source}
                            </p>
                          </div>
                          <span className="font-mono text-sm shrink-0">{fmtCurrency(e.amount, e.currency)}</span>
                          <div className="flex gap-1.5 shrink-0">
                            {e.gmail_message_url && (
                              <a href={e.gmail_message_url} target="_blank" rel="noreferrer" className="text-[11px] text-violet-500 hover:underline inline-flex items-center gap-1">
                                <Mail className="h-2.5 w-2.5" />
                              </a>
                            )}
                            {e.possible_duplicate_of && (
                              <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-600 dark:text-amber-400">
                                dup of #{e.possible_duplicate_of}
                              </Badge>
                            )}
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-red-500" onClick={() => deleteExpense(e.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Add manually */}
          <TabsContent value="add" className="mt-4">
            <Card>
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />Add expense manually
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="vendor" className="text-xs">Vendor</Label>
                    <Input id="vendor" value={newExpense.vendor} onChange={e => setNewExpense({ ...newExpense, vendor: e.target.value })} placeholder="Railway, Cloudflare, …" />
                  </div>
                  <div>
                    <Label htmlFor="amount" className="text-xs">Amount</Label>
                    <div className="flex gap-2">
                      <Input id="amount" type="number" step="0.01" value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} placeholder="0.00" />
                      <select className="border rounded-md px-2 text-xs bg-background" value={newExpense.currency} onChange={e => setNewExpense({ ...newExpense, currency: e.target.value })}>
                        <option>HKD</option><option>USD</option><option>SGD</option><option>GBP</option><option>EUR</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="category" className="text-xs">Category</Label>
                    <Input id="category" value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })} placeholder="infra, saas, hardware, …" />
                  </div>
                  <div>
                    <Label htmlFor="frequency" className="text-xs">Frequency</Label>
                    <select className="w-full border rounded-md px-2 py-2 text-sm bg-background" value={newExpense.frequency} onChange={e => setNewExpense({ ...newExpense, frequency: e.target.value })}>
                      <option value="one_off">One-off</option>
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                      <option value="quarterly">Quarterly</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="dated_at" className="text-xs">Date</Label>
                    <Input id="dated_at" type="date" value={newExpense.dated_at} onChange={e => setNewExpense({ ...newExpense, dated_at: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="notes" className="text-xs">Notes</Label>
                    <Input id="notes" value={newExpense.notes} onChange={e => setNewExpense({ ...newExpense, notes: e.target.value })} />
                  </div>
                </div>
                <Button onClick={submitNewExpense} disabled={!newExpense.vendor || !newExpense.amount} className="bg-violet-600 hover:bg-violet-700">
                  <Plus className="h-3 w-3 mr-1.5" />Add expense
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
