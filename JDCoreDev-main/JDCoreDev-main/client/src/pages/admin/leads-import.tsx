import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Target, Users, ChevronDown, ChevronRight, RefreshCw, Search,
  Phone, Mail, Globe, Copy, ExternalLink, Send, Archive, Star,
  Download, Clock, TrendingUp, CalendarCheck, Trophy, AlertCircle,
  Instagram, Facebook, MapPin, Building2, BarChart2, Sparkles,
  Eye, Trash2, RotateCcw, CheckCircle2, XCircle, MessageSquare,
} from "lucide-react";

// ── Helpers ──
const API = "/api/leads";
const AUTH_KEY = ""; // Set via env or local storage in production

async function apiFetch(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { "x-auth-key": AUTH_KEY, ...((opts.headers as Record<string, string>) || {}) };
  if (opts.body && typeof opts.body === "string") headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...opts, headers, credentials: "include" });
  return res;
}

async function apiJson(path: string, opts: RequestInit = {}) {
  const res = await apiFetch(path, opts);
  return res.json();
}

function relTime(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function scoreColor(s: number) {
  if (s >= 7) return "text-emerald-500";
  if (s >= 4) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(s: number) {
  if (s >= 7) return "bg-emerald-500";
  if (s >= 4) return "bg-amber-500";
  return "bg-red-500";
}

function priorityDot(p: string) {
  if (p === "HIGH") return "bg-red-500";
  if (p === "LOW") return "bg-blue-400";
  return "bg-amber-500";
}

function statusBadge(s: string) {
  const map: Record<string, { cls: string; label: string }> = {
    new: { cls: "bg-blue-500/15 text-blue-500 border-blue-500/30", label: "New" },
    contacted: { cls: "bg-amber-500/15 text-amber-500 border-amber-500/30", label: "Contacted" },
    responded: { cls: "bg-purple-500/15 text-purple-500 border-purple-500/30", label: "Responded" },
    meeting_booked: { cls: "bg-teal-500/15 text-teal-500 border-teal-500/30", label: "Meeting" },
    won: { cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", label: "Won" },
    lost: { cls: "bg-red-500/15 text-red-500 border-red-500/30", label: "Lost" },
    no_response: { cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", label: "No Response" },
  };
  const b = map[s] || map.new;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${b.cls}`}>{b.label}</span>;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "responded", label: "Responded" },
  { value: "meeting_booked", label: "Meeting Booked" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "no_response", label: "No Response" },
];

const SORT_OPTIONS = [
  { value: "imported_at:desc", label: "Newest First" },
  { value: "imported_at:asc", label: "Oldest First" },
  { value: "overall_score:desc", label: "Highest Score" },
  { value: "overall_score:asc", label: "Lowest Score" },
  { value: "google_rating:desc", label: "Best Rated" },
];

// ── Main Page ──
export default function LeadsImportPage() {
  const { toast } = useToast();

  const [stats, setStats] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sortBy, setSortBy] = useState("imported_at:desc");
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  // Expansion & selection
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetchStats = useCallback(async () => {
    try {
      const d = await apiJson("/stats");
      setStats(d);
    } catch {}
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const [field, order] = sortBy.split(":");
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      params.set("sort", field);
      params.set("order", order);
      params.set("limit", String(LIMIT));
      params.set("offset", String(page * LIMIT));
      const d = await apiJson(`/?${params}`);
      setLeads(d.leads || []);
      setTotal(d.total || 0);
    } catch {
      setLeads([]);
    }
    setLoading(false);
  }, [search, statusFilter, priorityFilter, sortBy, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Auto-refresh stats every 60s
  useEffect(() => {
    const iv = setInterval(fetchStats, 60_000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  const searchTimer = useRef<any>(null);
  const handleSearch = (v: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(0); }, 400);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map(l => l.id)));
  };

  const bulkUpdate = async (updates: Record<string, any>) => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await apiFetch(`/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
    }
    setSelected(new Set());
    fetchLeads();
    fetchStats();
  };

  const bulkArchive = async () => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await apiFetch(`/${id}`, { method: "DELETE" });
    }
    setSelected(new Set());
    fetchLeads();
    fetchStats();
  };

  const exportCSV = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search) params.set("search", search);
    const url = `${API}/export?${params}`;
    window.open(url, "_blank");
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Lead Engine</h1>
              <p className="text-sm text-muted-foreground">AI-discovered leads from Cowork automation</p>
            </div>
          </div>
        </div>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Leads", value: stats?.total ?? "—", cls: "text-foreground", icon: Users },
            { label: "New This Week", value: stats?.this_week ?? "—", cls: "text-blue-500", icon: Clock },
            { label: "Contacted", value: stats?.contacted ?? "—", cls: "text-amber-500", icon: Send },
            { label: "Response Rate", value: stats ? `${stats.response_rate}%` : "—", cls: "text-purple-500", icon: TrendingUp },
            { label: "Meetings", value: stats?.meeting_booked ?? "—", cls: "text-teal-500", icon: CalendarCheck },
            { label: "Won", value: stats?.won ?? "—", cls: "text-emerald-500 font-bold", icon: Trophy },
          ].map(c => (
            <Card key={c.label} className="border-border/40 bg-card/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</span>
                  <c.icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>
                <p className={`text-2xl font-semibold tabular-nums ${c.cls}`}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Filter Bar ── */}
        <Card className="border-border/40 bg-card/50">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  className="pl-9 h-9 text-sm"
                  onChange={e => handleSearch(e.target.value)}
                />
              </div>

              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <div className="flex gap-1">
                {["", "HIGH", "MEDIUM", "LOW"].map(p => (
                  <button
                    key={p}
                    onClick={() => { setPriorityFilter(p); setPage(0); }}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      priorityFilter === p
                        ? p === "HIGH" ? "bg-red-500/15 text-red-500 border-red-500/30"
                          : p === "LOW" ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
                          : p === "MEDIUM" ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                          : "bg-primary/10 text-primary border-primary/30"
                        : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                  >
                    {p || "All"}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value); setPage(0); }}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <Button variant="ghost" size="sm" onClick={() => { fetchLeads(); fetchStats(); }} className="h-9">
                <RefreshCw className="h-4 w-4" />
              </Button>

              <Button variant="ghost" size="sm" onClick={exportCSV} className="h-9">
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Leads Table ── */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading...</div>
        ) : leads.length === 0 ? (
          <Card className="border-border/40 bg-card/50">
            <CardContent className="py-16 text-center">
              <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-2">No leads yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Set up the Cowork automation to discover and import leads automatically. The automation browses the web,
                audits websites, and generates personalised outreach for potential clients.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <div className="w-6">
                <Checkbox
                  checked={selected.size === leads.length && leads.length > 0}
                  onCheckedChange={selectAll}
                />
              </div>
              <div className="w-5"></div>
              <div className="flex-1 min-w-0">Business</div>
              <div className="w-28 hidden md:block">Location</div>
              <div className="w-24 hidden lg:block">Industry</div>
              <div className="w-14 text-center">Score</div>
              <div className="w-16 text-center hidden sm:block">Rating</div>
              <div className="w-24 text-center">Status</div>
              <div className="w-20 text-right hidden sm:block">Imported</div>
            </div>

            {leads.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                expanded={expandedId === lead.id}
                onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                isSelected={selected.has(lead.id)}
                onSelect={() => toggleSelect(lead.id)}
                onUpdate={() => { fetchLeads(); fetchStats(); }}
                toast={toast}
              />
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 pt-3">
                <span className="text-xs text-muted-foreground">{total} leads total</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <span className="flex items-center px-3 text-xs text-muted-foreground">
                    {page + 1} / {totalPages}
                  </span>
                  <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Bulk Action Bar ── */}
        {selected.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-xl px-5 py-3 flex items-center gap-4 shadow-2xl">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Separator orientation="vertical" className="h-5" />
            <Button size="sm" variant="ghost" onClick={() => bulkUpdate({ status: "contacted" })} className="text-amber-500 hover:text-amber-400">
              <Send className="h-3.5 w-3.5 mr-1" /> Mark Contacted
            </Button>
            <Button size="sm" variant="ghost" onClick={bulkArchive} className="text-red-400 hover:text-red-300">
              <Archive className="h-3.5 w-3.5 mr-1" /> Archive
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-muted-foreground">
              <XCircle className="h-3.5 w-3.5 mr-1" /> Deselect
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// ── Lead Row Component ──
function LeadRow({ lead, expanded, onToggle, isSelected, onSelect, onUpdate, toast }: {
  lead: any; expanded: boolean; onToggle: () => void; isSelected: boolean;
  onSelect: () => void; onUpdate: () => void; toast: any;
}) {
  const [notes, setNotes] = useState(lead.notes || "");
  const [auditing, setAuditing] = useState(false);
  const [sending, setSending] = useState(false);

  const scores: Record<string, number> = typeof lead.scores_json === "string" ? JSON.parse(lead.scores_json) : (lead.scores_json || {});
  const missing: string[] = typeof lead.missing_features === "string" ? JSON.parse(lead.missing_features) : (lead.missing_features || []);
  const opportunities: any[] = typeof lead.ai_opportunities === "string" ? JSON.parse(lead.ai_opportunities) : (lead.ai_opportunities || []);

  const updateStatus = async (status: string) => {
    await apiFetch(`/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    toast({ title: `Status updated to ${status}` });
    onUpdate();
  };

  const saveNotes = async () => {
    await apiFetch(`/${lead.id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
    toast({ title: "Notes saved" });
  };

  const runAudit = async () => {
    setAuditing(true);
    const r = await apiJson(`/${lead.id}/audit`, { method: "POST" });
    setAuditing(false);
    toast({ title: r.ok ? "Audit complete" : r.error, variant: r.ok ? "default" : "destructive" });
    if (r.ok) onUpdate();
  };

  const sendEmail = async () => {
    if (!confirm(`Send outreach email to ${lead.email}?`)) return;
    setSending(true);
    const r = await apiJson(`/${lead.id}/send-email`, { method: "POST" });
    setSending(false);
    toast({ title: r.ok ? "Email sent" : r.error, variant: r.ok ? "default" : "destructive" });
    if (r.ok) onUpdate();
  };

  const archiveLead = async () => {
    if (!confirm(`Archive "${lead.business_name}"?`)) return;
    await apiFetch(`/${lead.id}`, { method: "DELETE" });
    toast({ title: "Lead archived" });
    onUpdate();
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const stars = (rating: number) => {
    const full = Math.floor(rating);
    return "★".repeat(full) + (rating % 1 >= 0.5 ? "½" : "") + "☆".repeat(5 - Math.ceil(rating));
  };

  return (
    <Card className={`border-border/40 transition-all ${expanded ? "bg-card shadow-lg" : "bg-card/50 hover:bg-card/80"}`}>
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onToggle}
      >
        <div className="w-6" onClick={e => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={onSelect} />
        </div>
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${priorityDot(lead.priority)}`} title={lead.priority} />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate">{lead.business_name}</span>
        </div>
        <div className="w-28 text-xs text-muted-foreground truncate hidden md:block">{lead.location}</div>
        <div className="w-24 text-xs text-muted-foreground truncate hidden lg:block">{lead.industry || "—"}</div>
        <div className="w-14 text-center">
          <span className={`text-sm font-semibold tabular-nums ${scoreColor(lead.overall_score)}`}>
            {lead.overall_score?.toFixed(1)}
          </span>
        </div>
        <div className="w-16 text-center hidden sm:block">
          {lead.google_rating ? (
            <span className="text-xs text-amber-500">{lead.google_rating.toFixed(1)} <Star className="inline h-3 w-3 -mt-0.5" /></span>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </div>
        <div className="w-24 text-center">{statusBadge(lead.status)}</div>
        <div className="w-20 text-right text-xs text-muted-foreground hidden sm:block">{relTime(lead.imported_at)}</div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-5 space-y-5 border-t border-border/30">
          {/* ── Contact Info ── */}
          <div className="pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact Details</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {lead.owner_name && (
                <ContactField icon={Users} label="Owner" value={lead.owner_name} onCopy={() => copyToClipboard(lead.owner_name, "Name")} />
              )}
              {lead.phone && (
                <ContactField icon={Phone} label="Phone" value={lead.phone} href={`tel:${lead.phone}`} onCopy={() => copyToClipboard(lead.phone, "Phone")} />
              )}
              {lead.email && (
                <ContactField icon={Mail} label="Email" value={lead.email} href={`mailto:${lead.email}`} onCopy={() => copyToClipboard(lead.email, "Email")} />
              )}
              {lead.website && (
                <ContactField icon={Globe} label="Website" value={lead.website.replace(/^https?:\/\//, "")} href={lead.website} external onCopy={() => copyToClipboard(lead.website, "Website")} />
              )}
              {lead.instagram && (
                <ContactField icon={Instagram} label="Instagram" value={lead.instagram} onCopy={() => copyToClipboard(lead.instagram, "Instagram")} />
              )}
              {lead.facebook && (
                <ContactField icon={Facebook} label="Facebook" value={lead.facebook} onCopy={() => copyToClipboard(lead.facebook, "Facebook")} />
              )}
            </div>
            {lead.google_rating && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-amber-500" />
                <span className="text-amber-500 font-medium">{lead.google_rating.toFixed(1)}</span>
                <span className="text-muted-foreground">({lead.google_review_count ?? 0} reviews)</span>
              </div>
            )}
          </div>

          <Separator className="opacity-30" />

          {/* ── Audit Scores ── */}
          {Object.keys(scores).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audit Scores</h4>
                <span className={`text-lg font-bold tabular-nums ${scoreColor(lead.overall_score)}`}>{lead.overall_score?.toFixed(1)}/10</span>
              </div>
              <div className="space-y-2">
                {Object.entries(scores).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16 capitalize">{key}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                      <div className={`h-full rounded-full ${scoreBg(val)} transition-all`} style={{ width: `${(val / 10) * 100}%` }} />
                    </div>
                    <span className={`text-xs font-medium tabular-nums w-6 text-right ${scoreColor(val)}`}>{val}</span>
                  </div>
                ))}
              </div>
              {lead.audit_html && (
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => {
                  const w = window.open("", "_blank");
                  if (w) { w.document.write(lead.audit_html); w.document.close(); }
                }}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> View Full Audit
                </Button>
              )}
            </div>
          )}

          {/* ── Missing Features ── */}
          {missing.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Missing Features</h4>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((f, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── AI Opportunities ── */}
          {opportunities.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-teal-500" /> AI Opportunities
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {opportunities.map((opp, i) => (
                  <div key={i} className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3">
                    <p className="text-sm font-medium text-teal-400">{opp.feature}</p>
                    <p className="text-xs text-muted-foreground mt-1">{opp.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Competitor Intel ── */}
          {lead.competitor_intel && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Competitor Intel</h4>
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
                <p className="text-sm text-muted-foreground">{lead.competitor_intel}</p>
              </div>
            </div>
          )}

          <Separator className="opacity-30" />

          {/* ── Draft Email ── */}
          {lead.draft_email_subject && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Draft Email</h4>
              <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-2">
                <p className="text-sm font-medium">{lead.draft_email_subject}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.draft_email_body}</p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => copyToClipboard(`Subject: ${lead.draft_email_subject}\n\n${lead.draft_email_body}`, "Email")}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy Email
                </Button>
                {lead.email && (
                  <>
                    <Button variant="ghost" size="sm" className="text-xs text-emerald-500" onClick={sendEmail} disabled={sending}>
                      <Send className="h-3.5 w-3.5 mr-1" /> {sending ? "Sending..." : "Send Email"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs" asChild>
                      <a href={`mailto:${lead.email}?subject=${encodeURIComponent(lead.draft_email_subject)}&body=${encodeURIComponent(lead.draft_email_body)}`}>
                        <Mail className="h-3.5 w-3.5 mr-1" /> Open in Mail
                      </a>
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Draft DM ── */}
          {lead.draft_dm && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Draft DM</h4>
              <div className="rounded-lg border border-border/50 bg-muted/10 p-4">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.draft_dm}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs mt-2" onClick={() => copyToClipboard(lead.draft_dm, "DM")}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy DM
              </Button>
            </div>
          )}

          <Separator className="opacity-30" />

          {/* ── Notes ── */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</h4>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Add notes about this lead..."
              className="min-h-[80px] text-sm resize-none"
            />
          </div>

          {/* ── Action Buttons ── */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => updateStatus("contacted")}>
              <Send className="h-3.5 w-3.5 mr-1" /> Mark Contacted
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => updateStatus("responded")}>
              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Responded
            </Button>
            <Button size="sm" variant="outline" className="text-xs text-teal-500 border-teal-500/30" onClick={() => updateStatus("meeting_booked")}>
              <CalendarCheck className="h-3.5 w-3.5 mr-1" /> Book Meeting
            </Button>
            <Button size="sm" variant="outline" className="text-xs text-emerald-500 border-emerald-500/30" onClick={() => updateStatus("won")}>
              <Trophy className="h-3.5 w-3.5 mr-1" /> Won
            </Button>
            <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-500/30" onClick={() => updateStatus("lost")}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Lost
            </Button>
            <Separator orientation="vertical" className="h-7 mx-1" />
            {lead.website && (
              <Button size="sm" variant="outline" className="text-xs" onClick={runAudit} disabled={auditing}>
                <BarChart2 className="h-3.5 w-3.5 mr-1" /> {auditing ? "Auditing..." : "Run Audit"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={archiveLead}>
              <Archive className="h-3.5 w-3.5 mr-1" /> Archive
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Contact Field Component ──
function ContactField({ icon: Icon, label, value, href, external, onCopy }: {
  icon: any; label: string; value: string; href?: string; external?: boolean; onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground/70">{label}</p>
        {href ? (
          <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
            className="text-sm text-primary hover:underline truncate block">
            {value}
          </a>
        ) : (
          <p className="text-sm truncate">{value}</p>
        )}
      </div>
      <button onClick={onCopy} className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0">
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}
