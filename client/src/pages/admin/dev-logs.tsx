import { useEffect, useState, useMemo } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Clock, FolderKanban, Building2, ChevronDown, ChevronRight, Calendar } from "lucide-react";

interface ClaudeSessionLog {
  id: number;
  projectId: number;
  projectName: string;
  clientId: number | null;
  clientName: string | null;
  logDate: string;
  minutesSpent: number;
  estimatedCostCents: number | null;
  logType: "hosting" | "development";
  description: string;
  createdAt: string;
}

interface ClientSummary {
  clientId: number | null;
  clientName: string;
  totalMinutes: number;
  cycleMinutes: number;
  totalBudgetMinutes: number;
  cycleSince: string | null;
  byProject: Array<{
    projectId: number;
    projectName: string;
    totalMinutes: number;
    cycleMinutes: number;
    budgetMinutes: number;
    cycleStart: string | null;
  }>;
}

function fmtDateTime(iso: string) { return new Date(iso).toLocaleString(); }
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function pctBar(used: number, budget: number) {
  if (budget <= 0) return null;
  const pct = Math.min(100, Math.round((used / budget) * 100));
  const over = used > budget;
  const colour = over ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-teal-500";
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${colour} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Extract the brief summary line from the full description markdown.
// The description starts with "**Summary**\n<text>". Returns the first
// non-empty line of the summary section, truncated to 140 chars.
function extractSummary(description: string): string {
  if (!description) return "";
  const summaryMatch = description.match(/\*\*Summary\*\*\n([\s\S]*?)(?:\n\n|\*\*Files changed|\*\*Tasks|---)/);
  if (summaryMatch) {
    const body = summaryMatch[1].trim();
    const firstLine = body.split("\n")[0].replace(/^\*+\s*/, "").trim();
    if (firstLine) return firstLine.length > 140 ? firstLine.slice(0, 137) + "…" : firstLine;
  }
  // Fallback: first non-empty line of description
  const first = description.split("\n").find(l => l.trim() && !l.startsWith("#") && !l.startsWith("*"));
  if (first) return first.trim().slice(0, 140);
  return description.slice(0, 140);
}

function readProjectIdFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("projectId");
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Recent Activity — cross-project, newest 10 logs
function RecentActivity({ logs }: { logs: ClaudeSessionLog[] }) {
  const [showAll, setShowAll] = useState(false);
  const recent = useMemo(
    () => [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [logs],
  );
  const visible = showAll ? recent : recent.slice(0, 10);
  if (recent.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-teal-500" /> Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {visible.map(log => (
          <div key={log.id} className="flex items-start gap-3 px-2 py-1.5 rounded hover:bg-muted/40 transition-colors">
            <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5 w-28">{fmtDateTime(log.createdAt)}</span>
            <span className="text-[11px] font-medium text-muted-foreground shrink-0 truncate max-w-[120px]">{log.projectName}</span>
            <span className="text-[11px] flex-1 truncate">{extractSummary(log.description) || "—"}</span>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{fmtMinutes(log.minutesSpent)}</span>
          </div>
        ))}
        {!showAll && recent.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full text-[11px] text-muted-foreground hover:text-foreground py-1 text-center transition-colors"
          >
            Show {recent.length - 10} more
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDevLogs() {
  const [logs, setLogs] = useState<ClaudeSessionLog[]>([]);
  const [summary, setSummary] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true);
    const [logsRes, sumRes] = await Promise.all([
      fetch("/api/admin/dev-logs/claude-sessions").then(r => r.json()),
      fetch("/api/admin/dev-logs/clients-summary").then(r => r.json()),
    ]);
    setLogs(Array.isArray(logsRes) ? logsRes : []);
    setSummary(Array.isArray(sumRes) ? sumRes : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (loading) return;
    const target = readProjectIdFromUrl();
    if (!target) return;
    const log = logs.find(l => l.projectId === target);
    const ckey = log?.clientId == null ? "__internal__" : String(log?.clientId);
    if (log) setExpanded(prev => new Set(prev).add(`${ckey}::${target}`));
  }, [loading, logs]);

  const grouped = useMemo(() => {
    const byClient = new Map<string, Map<number, ClaudeSessionLog[]>>();
    for (const log of logs) {
      const ckey = log.clientId == null ? "__internal__" : String(log.clientId);
      if (!byClient.has(ckey)) byClient.set(ckey, new Map());
      const projMap = byClient.get(ckey)!;
      if (!projMap.has(log.projectId)) projMap.set(log.projectId, []);
      projMap.get(log.projectId)!.push(log);
    }
    return byClient;
  }, [logs]);

  const cards = useMemo(() => {
    const seenClients = new Set<string>();
    const out: Array<{ summary: ClientSummary; projectLogs: Map<number, ClaudeSessionLog[]> }> = [];
    for (const s of summary) {
      const ckey = s.clientId == null ? "__internal__" : String(s.clientId);
      seenClients.add(ckey);
      out.push({ summary: s, projectLogs: grouped.get(ckey) || new Map() });
    }
    for (const [ckey, projMap] of grouped) {
      if (seenClients.has(ckey)) continue;
      const sample = Array.from(projMap.values())[0]?.[0];
      const totalMin = Array.from(projMap.values()).flat().reduce((s, l) => s + l.minutesSpent, 0);
      out.push({
        summary: {
          clientId: sample?.clientId ?? null,
          clientName: sample?.clientName || "Internal / no client",
          totalMinutes: totalMin,
          cycleMinutes: 0,
          totalBudgetMinutes: 0,
          cycleSince: null,
          byProject: Array.from(projMap.entries()).map(([pid, ls]) => ({
            projectId: pid,
            projectName: ls[0]?.projectName || `Project ${pid}`,
            totalMinutes: ls.reduce((s, l) => s + l.minutesSpent, 0),
            cycleMinutes: 0, budgetMinutes: 0, cycleStart: null,
          })),
        },
        projectLogs: projMap,
      });
    }
    return out;
  }, [summary, grouped]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleLog = (id: number) =>
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const totals = useMemo(() => {
    const minutes = logs.reduce((s, l) => s + l.minutesSpent, 0);
    return { minutes, count: logs.length };
  }, [logs]);

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-teal-500" /> Claude Code Sessions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-logged development sessions. Budget bars reflect the current billing cycle only.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5" /> Sessions
              </CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{totals.count}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Total Time
              </CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{fmtMinutes(totals.minutes)}</div></CardContent>
          </Card>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : logs.length === 0 ? (
          <Card><CardContent className="p-8">
            <p className="text-sm text-muted-foreground">No Claude Code sessions logged yet. Drop a <code className="px-1 py-0.5 bg-muted rounded text-xs">.jdcd-project</code> file in a project root to start logging.</p>
          </CardContent></Card>
        ) : (
          <>
            {/* Change 1 — cross-project recent activity */}
            <RecentActivity logs={logs} />

            <div className="space-y-4">
              {cards.map(({ summary: s, projectLogs }) => {
                const ckey = s.clientId == null ? "__internal__" : String(s.clientId);
                const overBudget = s.totalBudgetMinutes > 0 && s.cycleMinutes > s.totalBudgetMinutes;
                return (
                  <Card key={ckey} data-testid={`client-${ckey}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          <CardTitle className="text-base">{s.clientName}</CardTitle>
                        </div>
                        <div className="text-right text-xs text-muted-foreground space-y-0.5">
                          {s.totalBudgetMinutes > 0 ? (
                            <div className={overBudget ? "text-red-500 font-semibold" : ""}>
                              <span className="font-mono">{fmtMinutes(s.cycleMinutes)}</span>
                              <span className="mx-1">/</span>
                              <span className="font-mono">{fmtMinutes(s.totalBudgetMinutes)}</span>
                              <span className="ml-1">this cycle</span>
                            </div>
                          ) : (
                            <div><span className="font-mono">{fmtMinutes(s.totalMinutes)}</span> all-time · no budget set</div>
                          )}
                        </div>
                      </div>
                      {s.totalBudgetMinutes > 0 && (
                        <div className="mt-2">{pctBar(s.cycleMinutes, s.totalBudgetMinutes)}</div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {s.byProject.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No projects with activity.</p>
                      ) : s.byProject.map(p => {
                        const pkey = `${ckey}::${p.projectId}`;
                        const isOpen = expanded.has(pkey);
                        // Change 3 — newest first
                        const projLogs = [...(projectLogs.get(p.projectId) || [])].sort(
                          (a, b) => b.createdAt.localeCompare(a.createdAt)
                        );
                        const projOver = p.budgetMinutes > 0 && p.cycleMinutes > p.budgetMinutes;
                        return (
                          <div key={p.projectId} className="border border-border/50 rounded-lg" data-testid={`project-${p.projectId}`}>
                            <button
                              type="button"
                              onClick={() => toggle(pkey)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors rounded-lg"
                              data-testid={`toggle-project-${p.projectId}`}
                            >
                              {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                              <span className="font-medium text-sm flex-1 truncate">{p.projectName}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {projLogs.length} session{projLogs.length === 1 ? "" : "s"}
                              </span>
                              {p.budgetMinutes > 0 ? (
                                <span className={`text-xs font-mono shrink-0 ${projOver ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                                  {fmtMinutes(p.cycleMinutes)} / {fmtMinutes(p.budgetMinutes)}
                                </span>
                              ) : (
                                <span className="text-xs font-mono text-muted-foreground shrink-0">
                                  {fmtMinutes(p.totalMinutes)}
                                </span>
                              )}
                            </button>
                            {/* Change 4 — billing period label */}
                            {p.cycleStart && (
                              <div className="px-3 pb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                <span>Current billing period: from {fmtDate(p.cycleStart)}</span>
                                {p.budgetMinutes > 0 && (
                                  <span className="ml-2 text-[10px]">
                                    — {fmtMinutes(p.cycleMinutes)} of {fmtMinutes(p.budgetMinutes)} used
                                  </span>
                                )}
                              </div>
                            )}
                            {p.budgetMinutes > 0 && (
                              <div className="px-3 pb-2">{pctBar(p.cycleMinutes, p.budgetMinutes)}</div>
                            )}
                            {isOpen && (
                              <div className="border-t border-border/40 p-3 space-y-2 bg-muted/20">
                                {projLogs.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">No Claude Code sessions for this project.</p>
                                ) : projLogs.map(log => {
                                  const logOpen = expandedLogs.has(log.id);
                                  const summary = extractSummary(log.description);
                                  return (
                                    // Change 2 — summary-first, click to expand
                                    <div
                                      key={log.id}
                                      className="border border-border/40 rounded bg-background cursor-pointer hover:border-border transition-colors"
                                      data-testid={`log-${log.id}`}
                                      onClick={() => toggleLog(log.id)}
                                    >
                                      <div className="flex items-start justify-between gap-3 px-3 py-2">
                                        <div className="flex items-start gap-2 flex-1 min-w-0">
                                          {logOpen
                                            ? <ChevronDown className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" />
                                            : <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" />
                                          }
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[11px] truncate">{summary || "No summary"}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDateTime(log.createdAt)}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <Badge variant={log.logType === "hosting" ? "secondary" : "outline"} className="text-[10px]">{log.logType}</Badge>
                                          <span className="text-[11px] font-mono">{fmtMinutes(log.minutesSpent)}</span>
                                        </div>
                                      </div>
                                      {logOpen && (
                                        <div className="border-t border-border/40 px-3 pb-3 pt-2" onClick={e => e.stopPropagation()}>
                                          <pre className="text-[11px] whitespace-pre-wrap font-mono text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto max-h-56 overflow-y-auto">
{log.description}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
