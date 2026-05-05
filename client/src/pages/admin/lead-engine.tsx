import { useState, useEffect, useRef, Fragment } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Radar, Play, Mail, ExternalLink, CheckCircle, AlertCircle,
  Send, RefreshCw, Inbox, Settings, X, Plus, ChevronDown, ChevronUp, Clock, Eye, EyeOff, Globe, Trash2, MessageSquare, Copy, Sparkles,
} from "lucide-react";
import { SiWhatsapp, SiInstagram } from "react-icons/si";

const ENGINE_SECRET = "jdcd-engine-ai72shfgexau";
const API = "/api/lead-engine";

async function apiPost(endpoint: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { "x-engine-secret": ENGINE_SECRET, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiGet(endpoint: string) {
  const res = await fetch(`${API}${endpoint}`, { headers: { "x-engine-secret": ENGINE_SECRET } });
  return res.json();
}

async function apiDelete(endpoint: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${API}${endpoint}`, {
    method: "DELETE",
    headers: { "x-engine-secret": ENGINE_SECRET, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function statusStyle(status: string) {
  const map: Record<string, string> = {
    emailed:  "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    draft:    "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    no_reply: "bg-destructive/15 text-destructive",
    replied:  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    manual:     "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    expired:    "bg-muted text-muted-foreground",
    taken_down: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    emailed: "Emailed", draft: "Draft", no_reply: "No Reply",
    replied: "Replied", manual: "Manual", expired: "Expired", taken_down: "Offline",
  };
  return { cls: map[status] || map.draft, label: labels[status] || status };
}

const STAGE_LABELS = ["Research", "Audit", "Generate Page", "Outreach", "Save"];

function regenStageLabel(stage: string) {
  return {
    queued:      "Queued — waiting to start",
    researching: "Researching company…",
    generating:  "Generating audit page…",
    outreach:    "Writing outreach message…",
    saving:      "Saving to database…",
    done:        "Complete ✓",
    failed:      "Failed",
  }[stage] ?? stage;
}
function regenStageColor(stage: string) {
  if (stage === "done")   return "bg-emerald-500";
  if (stage === "failed") return "bg-destructive";
  if (stage === "queued") return "bg-muted-foreground/40";
  if (stage === "outreach") return "bg-teal-400";
  return "bg-teal-500";
}

interface Lead { id?: number; name: string; domain: string; status: string; channel: string; contactedAt: string; auditUrl: string; hasHtml?: boolean; }
interface Draft { id: number; company: string; email: string | null; instagram: string | null; whatsapp: string | null; subject: string; body: string; sent: boolean; sentAt?: string; date: string; auditUrl?: string | null; domain?: string | null; angle?: "creative" | "system" | "rebuild" | string | null; }

const ANGLE_STYLES: Record<string, string> = {
  creative: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  system:   "bg-blue-500/10 text-blue-500 border-blue-500/30",
  rebuild:  "bg-amber-500/10 text-amber-500 border-amber-500/30",
};
function AngleBadge({ angle }: { angle: string }) {
  const cls = ANGLE_STYLES[angle.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${cls}`}
      data-testid={`badge-angle-${angle}`}
    >
      {angle}
    </span>
  );
}
interface Progress { running: boolean; percent: number; stage: string; lines: string[]; done: boolean; }
interface EngineSettings {
  industries: string[]; count: number;
  fromEmail: string; replyTo: string; signals: string[]; exclusions: string[];
}

function TagEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  function add() {
    const val = input.trim();
    if (val && !items.includes(val)) onChange([...items, val]);
    setInput("");
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <span key={item} className="inline-flex items-center gap-1 bg-muted px-2.5 py-1 rounded-full text-xs">
            {item}
            <button onClick={() => onChange(items.filter(i => i !== item))} className="text-muted-foreground hover:text-foreground ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            className="bg-transparent border-b border-border text-xs outline-none w-28 py-0.5 placeholder:text-muted-foreground"
            placeholder="Add…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
          />
          <button onClick={add} className="text-teal-500 hover:text-teal-400"><Plus className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
}

export default function LeadEngine() {
  const { toast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"name" | "domain" | "status" | "channel" | "contactedAt">("contactedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"audits"|"drafts"|"sent">("audits");

  const [url, setUrl] = useState("");
  const [igHandle, setIgHandle] = useState("");
  const [optSendEmail, setOptSendEmail] = useState(true);
  const [optSaveDraft, setOptSaveDraft] = useState(true);
  const [auditRunning, setAuditRunning] = useState(false);
  const [stages, setStages] = useState<("idle"|"active"|"done"|"error")[]>(["idle","idle","idle","idle","idle"]);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const [engineRunning, setEngineRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({ running: false, percent: 0, stage: "", lines: [], done: false });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sendingDraftId, setSendingDraftId] = useState<number | null>(null);
  const [sendToOverride, setSendToOverride] = useState<Record<number, string>>({});
  const [expandedMessageId, setExpandedMessageId] = useState<number | null>(null);
  const [reAuditInputs, setReAuditInputs] = useState<Record<number, string>>({});
  const [reAuditLoading, setReAuditLoading] = useState<Record<number, boolean>>({});
  const [showAltUrl, setShowAltUrl] = useState<Record<number, boolean>>({});
  const [toneSelections, setToneSelections] = useState<Record<number, string>>({});
  const [rewriteLoading, setRewriteLoading] = useState<Record<number, boolean>>({});
  const [regeneratingAudits, setRegeneratingAudits] = useState<Set<string>>(new Set());
  const [regenProgressMap, setRegenProgressMap] = useState<Record<string, { name: string; domain: string; stage: string; percent: number; error?: string }>>({});
  const [regenAllLoading, setRegenAllLoading] = useState(false);
  const [dedupLoading, setDedupLoading] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<EngineSettings>({
    industries: ["Automotive", "Retail", "Fashion", "Lifestyle", "Hospitality"],
    count: 5,
    fromEmail: "joshuad@jdcoredev.com",
    replyTo: "joshuad@jdcoredev.com",
    signals: ["Active Instagram but no booking system or CRM", "Website on generic Shopify/Wix template", "Physical business with no digital loyalty tools"],
    exclusions: ["Enterprise companies", "Businesses with no web presence"],
  });
  const [savingSettings, setSavingSettings] = useState(false);

  async function loadStatus() {
    try {
      const data = await apiGet("/status");
      setLeads(data.contacted || []);
      setDrafts(data.drafts || []);
    } catch { toast({ title: "Failed to load status", variant: "destructive" }); }
    finally { setLoading(false); }
  }

  async function loadSettings() {
    try {
      const data = await apiGet("/settings");
      setSettings({
        industries: data.industries ?? settings.industries,
        signals:    data.signals    ?? settings.signals,
        exclusions: data.exclusions ?? settings.exclusions,
        count:      data.count      ?? settings.count,
        fromEmail:  data.fromEmail  ?? settings.fromEmail,
        replyTo:    data.replyTo    ?? settings.replyTo,
      });
    } catch {}
  }

  useEffect(() => { loadStatus(); loadSettings(); }, []);

  // Poll regen progress every 2s while any regeneration is in-flight
  useEffect(() => {
    const hasActive = regeneratingAudits.size > 0 || regenAllLoading;
    if (!hasActive) return;
    const interval = setInterval(async () => {
      try {
        const data: Array<{ name: string; domain: string; stage: string; percent: number; error?: string }> = await apiGet("/regen-progress");
        const map: typeof regenProgressMap = {};
        for (const item of data) map[item.domain] = item;
        setRegenProgressMap(map);
        // When all are finished, clear spinner states and refresh
        if (data.length === 0 || data.every(d => d.stage === "done" || d.stage === "failed")) {
          setRegeneratingAudits(new Set());
          setRegenAllLoading(false);
          setRegenProgressMap({});
          loadStatus();
        }
      } catch { /* ignore transient failures */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [regeneratingAudits.size, regenAllLoading]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progressLog]);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const p = await apiGet("/progress");
        setProgress(p);
        if (!p.running || p.done) {
          stopPolling();
          setEngineRunning(false);
          if (p.done) {
            loadStatus();
            toast({ title: "Engine run complete", description: "New leads have been added." });
          }
        }
      } catch {}
    }, 2500);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  const pendingDrafts = drafts.filter(d => !d.sent);
  const sentDrafts    = drafts.filter(d => d.sent);
  const filteredLeads = filter === "all" ? leads : leads.filter(l => (l.status || l.channel) === filter);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Sensible defaults: dates newest first, text fields A→Z
      setSortDir(key === "contactedAt" ? "desc" : "asc");
    }
  }

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "contactedAt") {
      const aT = a.contactedAt ? new Date(a.contactedAt).getTime() : 0;
      const bT = b.contactedAt ? new Date(b.contactedAt).getTime() : 0;
      return (aT - bT) * dir;
    }
    const aV = (a[sortKey] ?? "").toString().toLowerCase();
    const bV = (b[sortKey] ?? "").toString().toLowerCase();
    if (aV < bV) return -1 * dir;
    if (aV > bV) return  1 * dir;
    return 0;
  });

  const stats = [
    { label: "Total Audits", value: leads.length, sub: "all time", icon: Radar, color: "text-foreground" },
    { label: "Emails Sent", value: leads.filter(l => l.channel === "email").length, sub: "auto-delivered", icon: Mail, color: "text-teal-500" },
    { label: "Drafts Pending", value: pendingDrafts.length, sub: "need manual send", icon: Inbox, color: "text-yellow-500" },
    { label: "No Reply", value: leads.filter(l => l.status === "no_reply").length, sub: "expired · 30 days", icon: AlertCircle, color: "text-destructive" },
    { label: "Replies", value: leads.filter(l => l.status === "replied").length, sub: "inbound leads", icon: CheckCircle, color: "text-emerald-500" },
  ];

  async function runEngine() {
    setEngineRunning(true);
    setProgress({ running: true, percent: 2, stage: "Starting up…", lines: [], done: false });
    try {
      await apiPost("/run");
      toast({ title: "Lead engine started", description: "Progress will update below." });
      startPolling();
    } catch {
      toast({ title: "Failed to start engine", variant: "destructive" });
      setEngineRunning(false);
    }
  }

  async function stopEngine() {
    try {
      await apiPost("/stop");
      setEngineRunning(false);
      setProgress(p => ({ ...p, running: false, done: true, stage: "Stopped" }));
      toast({ title: "Engine stopped", description: "The current lead will finish, then the run will halt." });
    } catch {
      toast({ title: "Failed to stop engine", variant: "destructive" });
    }
  }

  async function reAuditDraft(draftId: number, url?: string) {
    setReAuditLoading(prev => ({ ...prev, [draftId]: true }));
    try {
      const body: Record<string, unknown> = { draftId };
      if (url && url.trim()) body.url = url.trim();
      const res = await apiPost("/re-audit-draft", body);
      // Hook into the regen progress system so the progress bar appears
      if (res.domain) {
        setRegeneratingAudits(prev => new Set(prev).add(res.domain));
        setRegenProgressMap(prev => ({
          ...prev,
          [res.domain]: { name: drafts.find(d => d.id === draftId)?.company ?? res.domain, domain: res.domain, stage: "researching", percent: 5 },
        }));
      }
      toast({ title: "Re-audit started", description: "Progress will appear below the card." });
      setReAuditInputs(prev => ({ ...prev, [draftId]: "" }));
      setShowAltUrl(prev => ({ ...prev, [draftId]: false }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Re-audit failed", description: msg, variant: "destructive" });
    } finally {
      setReAuditLoading(prev => ({ ...prev, [draftId]: false }));
    }
  }

  async function rewriteMessage(draft: Draft) {
    const tone = toneSelections[draft.id] || "casual";
    setRewriteLoading(prev => ({ ...prev, [draft.id]: true }));
    try {
      const result = await apiPost("/rewrite-message", { id: draft.id, tone });
      setDrafts(prev => prev.map(d =>
        d.id === draft.id ? { ...d, subject: result.subject, body: result.body } : d
      ));
      toast({ title: "Message rewritten", description: `Tone: ${tone}` });
    } catch {
      toast({ title: "Rewrite failed", variant: "destructive" });
    } finally {
      setRewriteLoading(prev => ({ ...prev, [draft.id]: false }));
    }
  }

  async function sendDigest() {
    try { await apiPost("/digest"); toast({ title: "Digest sent", description: "Check joshuad@jdcoredev.com" }); }
    catch { toast({ title: "Failed to send digest", variant: "destructive" }); }
  }

  async function sendTestEmail() {
    const to = window.prompt("Send test email to:", "joshuad@jdcoredev.com");
    if (!to) return;
    try {
      await apiPost("/test-email", { to });
      toast({ title: "Test email sent", description: `Delivered to ${to}` });
    } catch {
      toast({ title: "Failed to send test email", variant: "destructive" });
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await apiPost("/settings", settings as unknown as Record<string, unknown>);
      toast({ title: "Settings saved", description: "Will apply on the next engine run." });
      setSettingsOpen(false);
    } catch { toast({ title: "Failed to save settings", variant: "destructive" }); }
    finally { setSavingSettings(false); }
  }

  async function runManualAudit() {
    if (!url.trim() && !igHandle.trim()) { toast({ title: "Enter a website URL or Instagram handle" }); return; }
    setAuditRunning(true);
    setStages(["active","idle","idle","idle","idle"]);
    setProgressLog(["→ Researching company…"]);

    try {
      const body: Record<string, unknown> = { sendEmailOpt: optSendEmail, saveDraftOpt: optSaveDraft };
      if (url.trim()) body.url = url.trim();
      if (igHandle.trim()) body.instagram = igHandle.trim();
      const res = await apiPost("/manual-audit", body);
      if (res.error) throw new Error(res.error);

      const msgs = [
        "✓ Company found and researched",
        "✓ Audit complete",
        `✓ Audit page live at ${res.auditUrl || "…"}`,
        "✓ Outreach message drafted",
        res.emailed ? "✓ Email sent" : "✓ Draft saved to queue",
      ];
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 700));
        setStages(prev => { const n = [...prev] as typeof prev; n[i] = "done"; if (i < 4) n[i+1] = "active"; return n; });
        setProgressLog(prev => [...prev, msgs[i]]);
      }
      toast({ title: "Audit complete", description: res.auditUrl || "Check the dashboard" });
      setUrl("");
      setIgHandle("");
      setTimeout(loadStatus, 1000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setStages(prev => prev.map(s => s === "active" ? "error" : s) as typeof prev);
      setProgressLog(prev => [...prev, `✕ Error: ${msg}`]);
      toast({ title: "Audit failed", description: msg, variant: "destructive" });
    } finally { setAuditRunning(false); }
  }

  async function markReplied(domain: string) {
    try { await apiPost("/mark-replied", { domain }); toast({ title: `${domain} marked as replied` }); loadStatus(); }
    catch { toast({ title: "Failed to update", variant: "destructive" }); }
  }

  async function sendDraft(draft: Draft) {
    const to = sendToOverride[draft.id] || draft.email || "";
    if (!to) { toast({ title: "No email address", description: "Enter one first.", variant: "destructive" }); return; }
    setSendingDraftId(draft.id);
    try {
      const res = await apiPost("/send-draft", { id: draft.id, to });
      if (res.error) throw new Error(res.error);
      toast({ title: "Email sent", description: `Sent to ${res.to}` });
      loadStatus();
    } catch (e: unknown) {
      toast({ title: "Failed to send", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setSendingDraftId(null); }
  }

  async function deleteAudit(domain: string) {
    await apiDelete("/audit", { domain });
    toast({ title: "Audit deleted" });
    loadStatus();
  }

  async function takeOffline(domain: string, name: string) {
    if (!confirm(`Take the audit for "${name}" offline? The page will be replaced with a "no longer available" notice.`)) return;
    await apiPost("/take-offline", { domain });
    toast({ title: "Audit taken offline" });
    loadStatus();
  }

  async function regenerateAudit(lead: Lead) {
    if (!lead.id) return;
    setRegeneratingAudits(prev => new Set(prev).add(lead.domain));
    try {
      await apiPost("/regenerate-audit", { auditId: lead.id });
      // Progress polling starts automatically via the useEffect above
    } catch {
      setRegeneratingAudits(prev => { const s = new Set(prev); s.delete(lead.domain); return s; });
      toast({ title: "Failed to start regeneration", variant: "destructive" });
    }
  }

  async function dedupCleanup() {
    setDedupLoading(true);
    try {
      const res = await apiPost("/dedup-cleanup");
      if (res.removed > 0) {
        toast({ title: `Removed ${res.removed} duplicate${res.removed > 1 ? "s" : ""}`, description: res.removedNames?.join(", ") });
        loadStatus();
      } else {
        toast({ title: "No duplicates found", description: "All audit domains are already unique." });
      }
    } catch {
      toast({ title: "Cleanup failed", variant: "destructive" });
    } finally {
      setDedupLoading(false);
    }
  }

  async function regenerateAllMissing() {
    const missing = leads.filter(l => !l.hasHtml && l.id);
    if (!missing.length) { toast({ title: "All audits already have HTML stored" }); return; }
    if (!confirm(`Regenerate ${missing.length} audit(s) that are missing their pages? This will run the full AI audit pipeline for each and may take several minutes.`)) return;
    setRegenAllLoading(true);
    try {
      const res = await apiPost("/regenerate-all-missing");
      // Seed progress map immediately with queued state from response
      if (res.domains) {
        const map: typeof regenProgressMap = {};
        res.domains.forEach((d: string, idx: number) => { map[d] = { domain: d, name: res.names?.[idx] ?? d, stage: "queued", percent: 0 }; });
        setRegenProgressMap(map);
        // Also track all domains as "regenerating"
        setRegeneratingAudits(new Set(res.domains));
      }
    } catch {
      setRegenAllLoading(false);
    }
  }

  async function regenerateAll() {
    const targets = leads.filter(l => l.id && l.domain);
    if (!targets.length) { toast({ title: "No leads to regenerate" }); return; }
    if (!confirm(`Force-rebuild audits + outreach for ALL ${targets.length} lead(s)? Applies the latest audit template + outreach prompt to every existing lead. Burns AI credits — runs sequentially to avoid rate limits, may take 10+ minutes.`)) return;
    setRegenAllLoading(true);
    try {
      const res = await apiPost("/regenerate-all");
      if (res.domains) {
        const map: typeof regenProgressMap = {};
        res.domains.forEach((d: string, idx: number) => { map[d] = { domain: d, name: res.names?.[idx] ?? d, stage: "queued", percent: 0 }; });
        setRegenProgressMap(map);
        setRegeneratingAudits(new Set(res.domains));
      }
      toast({ title: `Regenerating ${res.queued} lead(s) sequentially…`, description: "Watch the progress chips on each card." });
    } catch {
      setRegenAllLoading(false);
    }
  }

  async function deleteDraftItem(id: number) {
    await apiDelete("/draft", { id });
    toast({ title: "Draft deleted — audit also removed" });
    loadStatus();
  }

  const stageColors = { idle: "bg-muted text-muted-foreground", active: "bg-teal-500/20 text-teal-500", done: "bg-emerald-500/15 text-emerald-500", error: "bg-destructive/15 text-destructive" };

  return (
    <AdminLayout>
      <div className="p-6 space-y-5 max-w-7xl">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 flex items-center justify-center">
              <Radar className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Lead Engine</h1>
              <p className="text-sm text-muted-foreground">Automated lead discovery, audit &amp; outreach</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(v => !v)} data-testid="button-toggle-settings">
              <Settings className="w-4 h-4 mr-2" /> Target Profile
            </Button>
            <Button variant="outline" size="sm" onClick={sendTestEmail} data-testid="button-test-email">
              <Mail className="w-4 h-4 mr-2" /> Test Email
            </Button>
            <Button variant="outline" size="sm" onClick={sendDigest} data-testid="button-send-digest">
              <Mail className="w-4 h-4 mr-2" /> Send Digest
            </Button>
            {engineRunning ? (
              <Button size="sm" onClick={stopEngine} className="bg-destructive hover:bg-destructive/90 text-white" data-testid="button-stop-engine">
                <X className="w-4 h-4 mr-2" /> Stop Engine
              </Button>
            ) : (
              <Button size="sm" onClick={runEngine} className="bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-run-engine">
                <Play className="w-4 h-4 mr-2" /> Run Engine
              </Button>
            )}
          </div>
        </div>

        {/* Engine Progress Bar */}
        {(engineRunning || progress.percent > 0) && (
          <Card className="border-teal-500/30 bg-teal-500/5">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-teal-600 dark:text-teal-400">
                  {progress.done ? "✓ Run complete" : progress.stage || "Starting…"}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{progress.percent}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              {progress.lines.length > 0 && (
                <p className="text-xs font-mono text-muted-foreground truncate">
                  {progress.lines[progress.lines.length - 1]}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Target Profile Settings */}
        {settingsOpen && (
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Target Profile
                </CardTitle>
                <button onClick={() => setSettingsOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">These parameters are passed to the AI to focus lead discovery. Changes apply on the next engine run.</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <TagEditor label="Target Industries" items={settings.industries} onChange={v => setSettings(s => ({ ...s, industries: v }))} />
                <TagEditor label="Good Lead Signals" items={settings.signals} onChange={v => setSettings(s => ({ ...s, signals: v }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <TagEditor label="Exclusions" items={settings.exclusions} onChange={v => setSettings(s => ({ ...s, exclusions: v }))} />
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border/50">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground">Leads per run</label>
                  <input
                    type="number" min={1} max={20}
                    value={settings.count}
                    onChange={e => setSettings(s => ({ ...s, count: Math.max(1, Math.min(20, parseInt(e.target.value) || 5)) }))}
                    className="w-16 bg-muted border border-border rounded-md px-2 py-1 text-sm text-center"
                    data-testid="input-lead-count"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground">Send from</label>
                  <input
                    type="email"
                    value={settings.fromEmail}
                    onChange={e => setSettings(s => ({ ...s, fromEmail: e.target.value }))}
                    className="bg-muted border border-border rounded-md px-2 py-1 text-sm w-52"
                    placeholder="joshuad@jdcoredev.com"
                    data-testid="input-from-email"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground">Reply-To</label>
                  <input
                    type="email"
                    value={settings.replyTo}
                    onChange={e => setSettings(s => ({ ...s, replyTo: e.target.value }))}
                    className="bg-muted border border-border rounded-md px-2 py-1 text-sm w-52"
                    placeholder="your@gmail.com"
                    data-testid="input-reply-to"
                  />
                </div>
                <Button size="sm" onClick={saveSettings} disabled={savingSettings} className="ml-auto bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-save-settings">
                  {savingSettings ? "Saving…" : "Save Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.map(s => (
            <Card key={s.label} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">{s.label}</p>
                  <s.icon className={`w-4 h-4 ${s.color} flex-shrink-0`} />
                </div>
                <p className={`text-3xl font-bold tracking-tight ${s.color}`}>{loading ? "—" : s.value}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Manual Audit Panel */}
        <Card className="border-border/60 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-transparent" />
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Manual Audit</CardTitle>
            <p className="text-sm text-muted-foreground">Enter a website URL and/or Instagram handle — at least one is required</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Input data-testid="input-audit-url" type="url" placeholder="https://example.com.hk (optional)" value={url}
                onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && !auditRunning && runManualAudit()}
                className="flex-1 min-w-[220px] font-mono text-sm" />
              <div className="relative flex-1 min-w-[180px]">
                <SiInstagram className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input data-testid="input-audit-instagram" placeholder="@handle (optional)" value={igHandle}
                  onChange={e => setIgHandle(e.target.value)} onKeyDown={e => e.key === "Enter" && !auditRunning && runManualAudit()}
                  className="pl-8 font-mono text-sm" />
              </div>
              <Button data-testid="button-run-audit" onClick={runManualAudit} disabled={auditRunning} className="bg-teal-600 hover:bg-teal-700 text-white shrink-0">
                {auditRunning ? "Auditing…" : "Audit →"}
              </Button>
            </div>
            <div className="flex gap-4 pt-2 border-t border-border/50 flex-wrap">
              {[["optSendEmail", "Auto-send email if found", optSendEmail, setOptSendEmail], ["optSaveDraft", "Save to draft queue", optSaveDraft, setOptSaveDraft]].map(([key, label, val, set]) => (
                <label key={key as string} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input type="checkbox" checked={val as boolean} onChange={e => (set as (v: boolean) => void)(e.target.checked)} className="accent-teal-500" />
                  {label as string}
                </label>
              ))}
            </div>
            {(auditRunning || progressLog.length > 0) && (
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {STAGE_LABELS.map((label, i) => (
                    <span key={i} className={`text-xs font-mono px-2.5 py-1 rounded-full transition-all ${stageColors[stages[i]]}`}>
                      {i + 1} · {label}
                    </span>
                  ))}
                </div>
                <div ref={logRef} className="bg-muted/50 border border-border/50 rounded-lg p-3 font-mono text-xs text-muted-foreground leading-relaxed max-h-28 overflow-y-auto whitespace-pre-wrap">
                  {progressLog.join("\n")}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tab bar */}
        <div className="flex border-b border-border/60 -mx-6 px-6">
          {([
            { id: "audits" as const, label: "Active Audits", count: leads.length, Icon: Radar },
            { id: "drafts" as const, label: "Drafts",        count: pendingDrafts.length, Icon: Inbox },
            { id: "sent"   as const, label: "Sent Outreach", count: sentDrafts.length,    Icon: Clock },
          ]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id ? "border-teal-500 text-teal-500" : "border-transparent text-muted-foreground hover:text-foreground"
              }`} data-testid={`tab-${tab.id}`}>
              <tab.Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.count > 0 && <span className="ml-0.5 text-xs font-mono bg-muted px-1.5 py-0.5 rounded-full">{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* ─── Audits tab ──────────────────────────────────────────── */}
        {activeTab === "audits" && (
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">Active Audits</CardTitle>
                  {leads.filter(l => !l.hasHtml && l.id).length > 0 && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-blue-500/30 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                      onClick={regenerateAllMissing} disabled={regenAllLoading} data-testid="button-regen-all-missing">
                      <RefreshCw className={`w-3 h-3 ${regenAllLoading ? "animate-spin" : ""}`} />
                      {regenAllLoading ? "Queuing…" : `Regenerate ${leads.filter(l => !l.hasHtml && l.id).length} Missing`}
                    </Button>
                  )}
                  {leads.filter(l => l.id && l.domain).length > 0 && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-violet-500/30 text-violet-500 hover:text-violet-400 hover:bg-violet-500/10"
                      onClick={regenerateAll} disabled={regenAllLoading} data-testid="button-regen-all">
                      <RefreshCw className={`w-3 h-3 ${regenAllLoading ? "animate-spin" : ""}`} />
                      Force-rebuild ALL ({leads.filter(l => l.id && l.domain).length})
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-orange-500/30 text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
                    onClick={dedupCleanup} disabled={dedupLoading} data-testid="button-dedup-cleanup">
                    <RefreshCw className={`w-3 h-3 ${dedupLoading ? "animate-spin" : ""}`} />
                    {dedupLoading ? "Cleaning…" : "Clean Duplicates"}
                  </Button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {["all","emailed","draft","no_reply","replied","manual","cowork-engine","taken_down"].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`text-xs font-mono px-3 py-1 rounded-full border transition-all ${filter === f ? "bg-teal-500/15 text-teal-500 border-teal-500/30" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {f === "no_reply" ? "No Reply"
                       : f === "taken_down" ? "Offline"
                       : f === "cowork-engine" ? "Cowork"
                       : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground text-sm">Loading audits…</div>
              ) : sortedLeads.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Radar className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm font-medium text-muted-foreground">No {filter === "all" ? "" : filter + " "}audits yet</p>
                  <p className="text-xs text-muted-foreground">Run the engine or paste a URL above to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        {([
                          { label: "Company", key: "name" },
                          { label: "Website", key: "domain" },
                          { label: "Status",  key: "status" },
                          { label: "Channel", key: "channel" },
                          { label: "Age",     key: "contactedAt" },
                          { label: "Audit",   key: null },
                          { label: "",        key: null },
                        ] as Array<{ label: string; key: typeof sortKey | null }>).map(h => {
                          const isActive = h.key && sortKey === h.key;
                          return (
                            <th key={h.label || "actions"} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30 font-mono">
                              {h.key ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSort(h.key as typeof sortKey)}
                                  className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${isActive ? "text-foreground" : ""}`}
                                  data-testid={`sort-${h.key}`}
                                >
                                  {h.label}
                                  {isActive && (sortDir === "asc"
                                    ? <ChevronUp className="w-3 h-3" />
                                    : <ChevronDown className="w-3 h-3" />)}
                                </button>
                              ) : h.label}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeads.map((lead, i) => {
                        const days = daysSince(lead.contactedAt);
                        const isOffline = lead.status === "no_reply" || lead.status === "taken_down";
                        const { cls, label } = statusStyle(lead.status || lead.channel);
                        const siteUrl = lead.domain ? `https://${lead.domain.replace(/^https?:\/\//, "")}` : null;
                        const regenProg = regenProgressMap[lead.domain];
                        return (
                          <Fragment key={i}>
                          <tr className={`border-b ${regenProg ? "border-border/10" : "border-border/30"} hover:bg-muted/20 transition-colors ${regenProg ? "opacity-60" : ""}`}>
                            <td className="px-4 py-3 font-medium">{lead.name}</td>
                            <td className="px-4 py-3">
                              {siteUrl ? (
                                <a href={siteUrl} target="_blank" rel="noopener noreferrer"
                                  className="font-mono text-xs text-teal-500 hover:text-teal-400 flex items-center gap-1.5 transition-colors"
                                  data-testid={`link-site-${i}`}>
                                  <Globe className="w-3.5 h-3.5 shrink-0" />{lead.domain}
                                </a>
                              ) : (
                                <span className="font-mono text-xs text-muted-foreground">{lead.domain || "—"}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{lead.channel || "—"}</td>
                            <td className={`px-4 py-3 font-mono text-xs ${days >= 25 && !isOffline ? "text-yellow-500" : "text-muted-foreground"}`}>
                              {days}d{days >= 25 && !isOffline ? " ⚠" : ""}
                            </td>
                            <td className="px-4 py-3">
                              {isOffline ? (
                                <span className="text-xs text-muted-foreground font-mono">{lead.status === "taken_down" ? "Offline" : "Expired"}</span>
                              ) : lead.auditUrl ? (
                                <div className="flex items-center gap-1.5">
                                  <Button variant="ghost" size="sm" className="h-7 text-xs text-teal-500 hover:text-teal-400 px-2"
                                    onClick={() => setPreviewUrl(previewUrl === lead.auditUrl ? null : lead.auditUrl)}
                                    data-testid={`button-preview-audit-${i}`}>
                                    <Eye className="w-3 h-3 mr-1" />Preview
                                  </Button>
                                  <a href={lead.auditUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-muted-foreground hover:text-foreground transition-colors" data-testid={`link-audit-${i}`}>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground font-mono">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {lead.status !== "replied" && !isOffline && (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                                    onClick={() => markReplied(lead.domain)} data-testid={`button-mark-replied-${i}`}>
                                    <CheckCircle className="w-3 h-3 mr-1" />Replied
                                  </Button>
                                )}
                                {!isOffline && lead.domain && (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-emerald-600 hover:text-orange-500"
                                    onClick={() => takeOffline(lead.domain, lead.name)} data-testid={`button-take-offline-${i}`}>
                                    <Eye className="w-3 h-3 mr-1" />Online
                                  </Button>
                                )}
                                {lead.id && (
                                  isOffline ? (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs px-2.5 bg-teal-600 hover:bg-teal-700 text-white"
                                      disabled={regeneratingAudits.has(lead.domain)}
                                      onClick={() => regenerateAudit(lead)}
                                      data-testid={`button-rerun-audit-${i}`}
                                    >
                                      <RefreshCw className={`w-3 h-3 mr-1 ${regeneratingAudits.has(lead.domain) ? "animate-spin" : ""}`} />
                                      {regeneratingAudits.has(lead.domain) ? "Running…" : "Re-run"}
                                    </Button>
                                  ) : (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-blue-500 hover:text-blue-400"
                                      disabled={regeneratingAudits.has(lead.domain)}
                                      onClick={() => regenerateAudit(lead)} data-testid={`button-regenerate-audit-${i}`}>
                                      <RefreshCw className={`w-3 h-3 mr-1 ${regeneratingAudits.has(lead.domain) ? "animate-spin" : ""}`} />
                                      {regeneratingAudits.has(lead.domain) ? "Running…" : "Re-run"}
                                    </Button>
                                  )
                                )}
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => { if (confirm(`Delete audit for ${lead.name}?`)) deleteAudit(lead.domain); }}
                                  data-testid={`button-delete-audit-${i}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {regenProg && (
                            <tr key={`${i}-prog`} className="border-b border-border/30 bg-muted/10">
                              <td colSpan={7} className="px-4 pb-3 pt-1">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className={`text-xs font-mono whitespace-nowrap ${regenProg.stage === "failed" ? "text-destructive" : regenProg.stage === "done" ? "text-emerald-500" : "text-teal-500"}`}>
                                      {regenProg.stage === "failed" && regenProg.error
                                        ? `✕ ${regenProg.error}`
                                        : regenStageLabel(regenProg.stage)}
                                    </span>
                                    <span className="text-xs font-mono text-muted-foreground/60 shrink-0">
                                      {regenProg.percent}%
                                    </span>
                                  </div>
                                  <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full transition-all duration-700 ${regenStageColor(regenProg.stage)} ${!["done","failed","queued"].includes(regenProg.stage) ? "animate-pulse" : ""}`}
                                      style={{ width: `${Math.max(regenProg.percent, 4)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Drafts tab ──────────────────────────────────────────── */}
        {activeTab === "drafts" && (
          pendingDrafts.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="py-12 text-center space-y-2">
                <Inbox className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">No pending drafts</p>
                <p className="text-xs text-muted-foreground">Run the engine to generate outreach drafts.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-yellow-500" />
                  Draft Queue
                  <Badge variant="secondary" className="ml-1">{pendingDrafts.length}</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Outreach messages waiting to be sent — deleting a draft also removes its audit page</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingDrafts.map(draft => (
                  <div key={draft.id} className="border border-border/60 rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium text-sm flex items-center gap-2 flex-wrap">
                          <span>{draft.company}</span>
                          {draft.angle && <AngleBadge angle={draft.angle} />}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{draft.subject}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {draft.domain && !draft.domain.startsWith("ig_") && (
                            <a
                              href={`https://${draft.domain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
                              data-testid={`link-website-${draft.id}`}
                            >
                              <Globe className="w-3 h-3" />
                              {draft.domain}
                            </a>
                          )}
                          {draft.auditUrl && (
                            <a
                              href={draft.auditUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                              data-testid={`link-audit-${draft.id}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              Audit page
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          {new Date(draft.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => { if (confirm(`Delete draft for ${draft.company}? This will also take down the audit page.`)) deleteDraftItem(draft.id); }}
                          data-testid={`button-delete-draft-${draft.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      <Input type="email" placeholder={draft.email || "recipient@company.com"}
                        value={sendToOverride[draft.id] ?? (draft.email || "")}
                        onChange={e => setSendToOverride(prev => ({ ...prev, [draft.id]: e.target.value }))}
                        className="flex-1 min-w-[200px] h-8 text-sm font-mono" data-testid={`input-draft-email-${draft.id}`} />
                      <Button size="sm" onClick={() => sendDraft(draft)} disabled={sendingDraftId === draft.id}
                        className="bg-teal-600 hover:bg-teal-700 text-white h-8" data-testid={`button-send-draft-${draft.id}`}>
                        {sendingDraftId === draft.id
                          ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Sending</>
                          : <><Send className="w-3 h-3 mr-1.5" />Send Email</>}
                      </Button>
                    </div>
                    {/* Re-audit section */}
                    <div className="pt-1 border-t border-border/40">
                      {draft.domain && !draft.domain.startsWith('ig_') ? (
                        /* Draft has a known domain — show simple Re-audit button */
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reAuditDraft(draft.id)}
                              disabled={reAuditLoading[draft.id]}
                              className="h-8 text-xs"
                              data-testid={`button-reaudit-${draft.id}`}
                            >
                              {reAuditLoading[draft.id]
                                ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Running…</>
                                : <><RefreshCw className="w-3 h-3 mr-1" />Re-audit</>}
                            </Button>
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                              onClick={() => setShowAltUrl(prev => ({ ...prev, [draft.id]: !prev[draft.id] }))}
                              data-testid={`toggle-alt-url-${draft.id}`}
                            >
                              {showAltUrl[draft.id] ? "Cancel" : "Different URL?"}
                            </button>
                          </div>
                          {showAltUrl[draft.id] && (
                            <div className="flex gap-2">
                              <Input
                                placeholder="https://new-domain.com"
                                value={reAuditInputs[draft.id] ?? ""}
                                onChange={e => setReAuditInputs(prev => ({ ...prev, [draft.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") reAuditDraft(draft.id, reAuditInputs[draft.id]); }}
                                className="flex-1 h-8 text-sm font-mono"
                                data-testid={`input-reaudit-url-${draft.id}`}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => reAuditDraft(draft.id, reAuditInputs[draft.id])}
                                disabled={reAuditLoading[draft.id] || !reAuditInputs[draft.id]?.trim()}
                                className="h-8 text-xs"
                                data-testid={`button-reaudit-url-${draft.id}`}
                              >
                                {reAuditLoading[draft.id]
                                  ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Running…</>
                                  : <><RefreshCw className="w-3 h-3 mr-1" />Re-audit</>}
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* No domain known — require URL input */
                        <>
                          <p className="text-xs text-muted-foreground mb-1.5">
                            No website found — add the URL to generate an audit:
                          </p>
                          <div className="flex gap-2">
                            <Input
                              placeholder="https://company.com"
                              value={reAuditInputs[draft.id] ?? ""}
                              onChange={e => setReAuditInputs(prev => ({ ...prev, [draft.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") reAuditDraft(draft.id, reAuditInputs[draft.id]); }}
                              className="flex-1 h-8 text-sm font-mono"
                              data-testid={`input-reaudit-url-${draft.id}`}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reAuditDraft(draft.id, reAuditInputs[draft.id])}
                              disabled={reAuditLoading[draft.id] || !reAuditInputs[draft.id]?.trim()}
                              className="h-8 text-xs"
                              data-testid={`button-reaudit-${draft.id}`}
                            >
                              {reAuditLoading[draft.id]
                                ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Running…</>
                                : <><RefreshCw className="w-3 h-3 mr-1" />Re-audit</>}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Re-audit progress bar */}
                    {draft.domain && !draft.domain.startsWith("ig_") && regenProgressMap[draft.domain] && (() => {
                      const prog = regenProgressMap[draft.domain];
                      return (
                        <div className="pt-2 border-t border-border/40 space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`text-xs font-mono whitespace-nowrap ${prog.stage === "failed" ? "text-destructive" : prog.stage === "done" ? "text-emerald-500" : "text-teal-500"}`}>
                              {prog.stage === "failed" && prog.error ? `✕ ${prog.error}` : regenStageLabel(prog.stage)}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground/60 shrink-0">{prog.percent}%</span>
                          </div>
                          <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-700 ${regenStageColor(prog.stage)} ${!["done","failed","queued"].includes(prog.stage) ? "animate-pulse" : ""}`}
                              style={{ width: `${Math.max(prog.percent, 4)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Tone rewrite section */}
                    <div className="pt-1 border-t border-border/40">
                      <p className="text-xs text-muted-foreground mb-1.5">Rewrite message in a different tone:</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(["casual","formal","direct","friendly","urgent"] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setToneSelections(prev => ({ ...prev, [draft.id]: t }))}
                            className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-bold border transition-colors ${
                              (toneSelections[draft.id] || "casual") === t
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-transparent text-muted-foreground border-border/60 hover:border-primary/50 hover:text-foreground"
                            }`}
                            data-testid={`button-tone-${t}-${draft.id}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rewriteMessage(draft)}
                        disabled={rewriteLoading[draft.id]}
                        className="h-8 text-xs"
                        data-testid={`button-rewrite-message-${draft.id}`}
                      >
                        {rewriteLoading[draft.id]
                          ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Rewriting…</>
                          : <><Sparkles className="w-3 h-3 mr-1" />Rewrite Message</>}
                      </Button>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-border/40">
                      <div className="flex gap-2 flex-wrap items-center">
                        {(draft.whatsapp || draft.instagram) && (
                          <span className="text-xs text-muted-foreground">Manual outreach:</span>
                        )}
                        {draft.whatsapp && (
                          <a href={`https://wa.me/${draft.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-600/30 hover:bg-green-500/10"
                              onClick={() => { navigator.clipboard.writeText(draft.body); toast({ title: "Message copied", description: "Paste it into WhatsApp" }); }}
                              data-testid={`button-whatsapp-${draft.id}`}>
                              <SiWhatsapp className="w-3 h-3 mr-1.5" />{draft.whatsapp}
                            </Button>
                          </a>
                        )}
                        {draft.instagram && (
                          <a href={`https://instagram.com/${draft.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-pink-600 border-pink-600/30 hover:bg-pink-500/10"
                              onClick={() => { navigator.clipboard.writeText(draft.body); toast({ title: "Message copied", description: "Paste it into Instagram DM" }); }}
                              data-testid={`button-instagram-${draft.id}`}>
                              <SiInstagram className="w-3 h-3 mr-1.5" />{draft.instagram}
                            </Button>
                          </a>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                            onClick={() => setExpandedMessageId(expandedMessageId === draft.id ? null : draft.id)}
                            data-testid={`button-view-message-${draft.id}`}>
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Message
                            {expandedMessageId === draft.id
                              ? <ChevronUp className="w-3 h-3 ml-1" />
                              : <ChevronDown className="w-3 h-3 ml-1" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                            onClick={async () => { await apiPost("/mark-sent", { id: draft.id }); loadStatus(); toast({ title: "Marked as sent" }); }}
                            data-testid={`button-mark-sent-${draft.id}`}>
                            <CheckCircle className="w-3 h-3 mr-1" /> Mark sent
                          </Button>
                        </div>
                      </div>
                      {expandedMessageId === draft.id && (
                        <div className="rounded-lg border border-border/50 bg-muted/40 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">Outreach message</span>
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-teal-500 hover:text-teal-400 px-2"
                              onClick={() => { navigator.clipboard.writeText(draft.body); toast({ title: "Copied to clipboard" }); }}
                              data-testid={`button-copy-message-${draft.id}`}>
                              <Copy className="w-3 h-3 mr-1" />Copy
                            </Button>
                          </div>
                          <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed font-sans">{draft.body}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        )}

        {/* ─── Sent tab ──────────────────────────────────────────── */}
        {activeTab === "sent" && (
          sentDrafts.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="py-12 text-center space-y-2">
                <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">No sent outreach yet</p>
                <p className="text-xs text-muted-foreground">Sent emails and manual outreach appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-500" />
                  Sent Outreach
                  <Badge variant="secondary" className="ml-1">{sentDrafts.length}</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Previously sent emails and manual outreach</p>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      {["Company","Subject","Sent To","Date",""].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30 font-mono">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...sentDrafts].reverse().map(draft => (
                      <tr key={draft.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium flex items-center gap-2 flex-wrap">
                            <span>{draft.company}</span>
                            {draft.angle && <AngleBadge angle={draft.angle} />}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            {draft.domain && !draft.domain.startsWith("ig_") && (
                              <a href={`https://${draft.domain}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
                                data-testid={`link-sent-website-${draft.id}`}>
                                <Globe className="w-3 h-3" />{draft.domain}
                              </a>
                            )}
                            {draft.auditUrl && (
                              <a href={draft.auditUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                                data-testid={`link-sent-audit-${draft.id}`}>
                                <ExternalLink className="w-3 h-3" />Audit page
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{draft.subject}</td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {draft.email || draft.whatsapp || draft.instagram || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {draft.sentAt ? new Date(draft.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => { if (confirm(`Delete record for ${draft.company}?`)) deleteDraftItem(draft.id); }}
                            data-testid={`button-delete-sent-${draft.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Audit preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-background shrink-0">
            <span className="text-sm font-medium font-mono text-muted-foreground truncate max-w-xl">{previewUrl}</span>
            <div className="flex items-center gap-2">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                </Button>
              </a>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setPreviewUrl(null)} data-testid="button-close-preview">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <iframe src={previewUrl} className="flex-1 w-full border-0" title="Audit preview" />
        </div>
      )}
    </AdminLayout>
  );
}
