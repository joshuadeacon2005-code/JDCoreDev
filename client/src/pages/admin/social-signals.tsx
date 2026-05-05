import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Users, Plus, Trash2, ExternalLink, RefreshCw, Check, X, Sparkles, Instagram } from "lucide-react";

type Trader = {
  id: number;
  platform: string;
  handle: string;
  display_name: string | null;
  focus: string | null;
  notes: string | null;
  is_active: boolean;
  added_at: string;
};

type Signal = {
  id: number;
  trader_id: number | null;
  handle: string | null;
  display_name: string | null;
  trader_platform: string | null;
  platform: string;
  post_url: string | null;
  raw_text: string;
  ticker: string | null;
  market_type: string;
  direction: string;
  entry_hint: string | null;
  size_hint: string | null;
  time_horizon: string | null;
  ai_confidence: number | null;
  ai_rationale: string | null;
  status: string;
  action_notes: string | null;
  logged_at: string;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });

export default function AdminSocialSignals() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"queue" | "ingest" | "traders">("queue");
  const [traders, setTraders] = useState<Trader[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  // Add trader form
  const [newTrader, setNewTrader] = useState({ platform: "instagram", handle: "", displayName: "", focus: "", notes: "" });

  // Ingest paste-in form
  const [ingest, setIngest] = useState({ traderId: "", postUrl: "", text: "" });
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Acting on signals
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch("/api/social-signals/traders").then(r => r.json()),
        fetch("/api/social-signals?status=pending").then(r => r.json()),
      ]);
      setTraders(tRes.traders || []);
      setSignals(sRes.signals || []);
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const addTrader = async () => {
    if (!newTrader.handle.trim()) {
      toast({ title: "Handle required", variant: "destructive" });
      return;
    }
    try {
      const r = await fetch("/api/social-signals/traders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTrader),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      toast({ title: `Tracking ${d.trader.display_name || d.trader.handle}` });
      setNewTrader({ platform: "instagram", handle: "", displayName: "", focus: "", notes: "" });
      await load();
    } catch (e: any) {
      toast({ title: "Add failed", description: e.message, variant: "destructive" });
    }
  };

  const deleteTrader = async (id: number) => {
    if (!confirm("Stop tracking this trader? Existing signals stay in the queue.")) return;
    try {
      await fetch(`/api/social-signals/traders/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const extractSignal = async () => {
    if (!ingest.text.trim() && !ingest.postUrl.trim()) {
      toast({ title: "Paste post text or a URL", variant: "destructive" });
      return;
    }
    setExtracting(true);
    setExtracted(null);
    try {
      const r = await fetch("/api/social-signals/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ingest.text,
          postUrl: ingest.postUrl,
          traderId: ingest.traderId ? parseInt(ingest.traderId) : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setExtracted(d.extracted);
    } catch (e: any) {
      toast({ title: "Extraction failed", description: e.message, variant: "destructive" });
    }
    setExtracting(false);
  };

  const saveSignal = async () => {
    if (!extracted) return;
    setSaving(true);
    try {
      const r = await fetch("/api/social-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traderId: ingest.traderId ? parseInt(ingest.traderId) : null,
          platform: "instagram",
          postUrl: ingest.postUrl || null,
          rawText: ingest.text,
          ...extracted,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      toast({ title: "Saved to queue", description: `${extracted.ticker || "signal"} — ${extracted.direction}` });
      setIngest({ traderId: "", postUrl: "", text: "" });
      setExtracted(null);
      setTab("queue");
      await load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const updateSignalStatus = async (id: number, status: "placed" | "dismissed" | "expired", notes?: string) => {
    setActingId(id);
    try {
      await fetch(`/api/social-signals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actionNotes: notes || null }),
      });
      await load();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
    setActingId(null);
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-violet-500" />
              Trader Signals
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Follow Instagram (and other) traders. Paste a post → Claude extracts the trade signal → review queue.
              Auto-scraping not yet wired up; manual paste-in only for now.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 text-xs">
            <RefreshCw className={cn("h-3 w-3 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="queue" className="text-xs">
              Pending signals
              {signals.length > 0 && (
                <Badge variant="outline" className="ml-2 h-4 text-[9px] border-amber-500/30 text-amber-600 dark:text-amber-400">
                  {signals.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ingest" className="text-xs">Paste a post</TabsTrigger>
            <TabsTrigger value="traders" className="text-xs">Traders ({traders.length})</TabsTrigger>
          </TabsList>

          {/* Pending signal queue */}
          <TabsContent value="queue" className="mt-4 space-y-3">
            {signals.length === 0 ? (
              <Card><CardContent className="text-center py-10">
                <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No pending signals. Paste a post from a tracked trader to see it here.</p>
              </CardContent></Card>
            ) : signals.map(s => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {s.handle ? (
                          <Badge variant="outline" className="text-[10px]">
                            <Instagram className="h-2.5 w-2.5 mr-1" />@{s.handle}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Unknown trader</Badge>
                        )}
                        {s.ticker && (
                          <Badge variant="outline" className="text-[10px] font-mono border-violet-500/30 text-violet-500">
                            {s.ticker}
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn("text-[10px]",
                          s.direction === "long" || s.direction === "yes" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                          s.direction === "short" || s.direction === "no" ? "border-red-500/30 text-red-500" :
                          "border-muted text-muted-foreground"
                        )}>
                          {s.direction.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{s.market_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {Math.round((s.ai_confidence ?? 0) * 100)}%
                        </Badge>
                      </div>
                      {s.ai_rationale && (
                        <p className="text-xs text-foreground/80 italic">"{s.ai_rationale}"</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
                        {s.entry_hint && <span>Entry: <span className="font-mono">{s.entry_hint}</span></span>}
                        {s.size_hint && <span>Size: {s.size_hint}</span>}
                        {s.time_horizon && <span>Horizon: {s.time_horizon}</span>}
                        <span>{fmtDate(s.logged_at)}</span>
                      </div>
                      {s.post_url && (
                        <a href={s.post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-violet-500 hover:underline mt-1">
                          <Instagram className="h-2.5 w-2.5" />Open original post<ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => updateSignalStatus(s.id, "placed")} disabled={actingId === s.id}>
                        <Check className="h-3 w-3 mr-1" />Placed
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 border-red-500/30 text-red-500 hover:bg-red-500/10"
                        onClick={() => updateSignalStatus(s.id, "dismissed")} disabled={actingId === s.id}>
                        <X className="h-3 w-3 mr-1" />Pass
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Paste a post */}
          <TabsContent value="ingest" className="mt-4">
            <Card>
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />Paste an Instagram post
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Paste the post URL and/or the caption text. Claude extracts the structured trade signal — ticker, direction,
                  market type, entry hint. Nothing is saved until you click "Save to queue".
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Trader (optional)</Label>
                  <select value={ingest.traderId} onChange={e => setIngest({ ...ingest, traderId: e.target.value })}
                    className="w-full text-sm border rounded-md px-2 py-2 bg-background">
                    <option value="">— unattributed —</option>
                    {traders.filter(t => t.is_active).map(t => (
                      <option key={t.id} value={t.id}>@{t.handle}{t.display_name ? ` (${t.display_name})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Post URL</Label>
                  <Input value={ingest.postUrl} onChange={e => setIngest({ ...ingest, postUrl: e.target.value })}
                    placeholder="https://www.instagram.com/p/..." />
                </div>
                <div>
                  <Label className="text-xs">Caption text (paste it — IG doesn't allow scraping)</Label>
                  <Textarea value={ingest.text} onChange={e => setIngest({ ...ingest, text: e.target.value })}
                    rows={5} placeholder="Buying NVDA above $850. Stop $820. Target $920…" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={extractSignal} disabled={extracting} className="bg-violet-600 hover:bg-violet-700">
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    {extracting ? "Extracting…" : "Extract signal"}
                  </Button>
                </div>

                {extracted && (
                  <div className="rounded-md border p-3 space-y-2 mt-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Extracted signal</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div><p className="text-muted-foreground text-[10px]">Ticker</p><p className="font-mono font-semibold">{extracted.ticker || "—"}</p></div>
                      <div><p className="text-muted-foreground text-[10px]">Market</p><p>{extracted.marketType}</p></div>
                      <div><p className="text-muted-foreground text-[10px]">Direction</p><p className="font-semibold">{extracted.direction}</p></div>
                      <div><p className="text-muted-foreground text-[10px]">Confidence</p><p>{Math.round((extracted.aiConfidence ?? 0) * 100)}%</p></div>
                      {extracted.entryHint && <div><p className="text-muted-foreground text-[10px]">Entry</p><p className="font-mono">{extracted.entryHint}</p></div>}
                      {extracted.sizeHint && <div><p className="text-muted-foreground text-[10px]">Size</p><p>{extracted.sizeHint}</p></div>}
                      {extracted.timeHorizon && <div><p className="text-muted-foreground text-[10px]">Horizon</p><p>{extracted.timeHorizon}</p></div>}
                    </div>
                    {extracted.aiRationale && (
                      <p className="text-xs text-muted-foreground italic">"{extracted.aiRationale}"</p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button onClick={saveSignal} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                        {saving ? "Saving…" : "Save to queue"}
                      </Button>
                      <Button variant="ghost" onClick={() => setExtracted(null)}>Discard</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Traders */}
          <TabsContent value="traders" className="mt-4 space-y-3">
            <Card>
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />Track a new trader
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Platform</Label>
                    <select value={newTrader.platform} onChange={e => setNewTrader({ ...newTrader, platform: e.target.value })}
                      className="w-full text-sm border rounded-md px-2 py-2 bg-background">
                      <option value="instagram">Instagram</option>
                      <option value="twitter">X / Twitter</option>
                      <option value="telegram">Telegram</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Handle</Label>
                    <Input value={newTrader.handle} onChange={e => setNewTrader({ ...newTrader, handle: e.target.value })} placeholder="username (no @)" />
                  </div>
                  <div>
                    <Label className="text-xs">Display name (optional)</Label>
                    <Input value={newTrader.displayName} onChange={e => setNewTrader({ ...newTrader, displayName: e.target.value })} placeholder="e.g. Alex Trades" />
                  </div>
                  <div>
                    <Label className="text-xs">Focus (optional)</Label>
                    <Input value={newTrader.focus} onChange={e => setNewTrader({ ...newTrader, focus: e.target.value })} placeholder="stocks / crypto / Kalshi / options…" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea value={newTrader.notes} onChange={e => setNewTrader({ ...newTrader, notes: e.target.value })} rows={2}
                    placeholder="What's their track record / style / why follow them" />
                </div>
                <Button onClick={addTrader} disabled={!newTrader.handle.trim()} className="bg-violet-600 hover:bg-violet-700">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Add trader
                </Button>
              </CardContent>
            </Card>

            {traders.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {traders.map(t => (
                      <div key={t.id} className="p-4 flex items-start justify-between gap-3 hover:bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">
                              {t.platform === "instagram" ? <Instagram className="h-2.5 w-2.5 mr-1" /> : null}
                              @{t.handle}
                            </Badge>
                            {t.display_name && <span className="text-sm font-medium">{t.display_name}</span>}
                            {!t.is_active && <Badge variant="outline" className="text-[10px] text-muted-foreground">paused</Badge>}
                          </div>
                          {t.focus && <p className="text-[11px] text-muted-foreground mt-1">Focus: {t.focus}</p>}
                          {t.notes && <p className="text-[11px] text-muted-foreground mt-1 italic">"{t.notes}"</p>}
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground hover:text-red-500"
                          onClick={() => deleteTrader(t.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
