import { useEffect, useState, useMemo } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Clock, DollarSign, FolderKanban } from "lucide-react";

interface ClaudeSessionLog {
  id: number;
  projectId: number;
  projectName: string;
  logDate: string;
  minutesSpent: number;
  estimatedCostCents: number | null;
  logType: "hosting" | "development";
  description: string;
  createdAt: string;
}

interface ProjectOption { id: number; name: string; }

function fmtCents(cents: number | null) {
  if (!cents && cents !== 0) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function fmtMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function readProjectIdFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("projectId");
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function AdminDevLogs() {
  const [logs, setLogs] = useState<ClaudeSessionLog[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [filterProjectId, setFilterProjectId] = useState<number | null>(readProjectIdFromUrl());
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = filterProjectId ? `?projectId=${filterProjectId}` : "";
    const res = await fetch(`/api/admin/dev-logs/claude-sessions${params}`);
    const data = await res.json();
    setLogs(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function loadProjects() {
    const res = await fetch("/api/admin/projects");
    const data = await res.json();
    if (Array.isArray(data)) {
      setProjects(data.map((p: any) => ({ id: p.id, name: p.name })));
    }
  }

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { load(); }, [filterProjectId]);

  const totals = useMemo(() => {
    const minutes = logs.reduce((s, l) => s + l.minutesSpent, 0);
    const cents = logs.reduce((s, l) => s + (l.estimatedCostCents || 0), 0);
    return { minutes, cents, count: logs.length };
  }, [logs]);

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="w-6 h-6 text-teal-500" /> Claude Code Sessions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Auto-logged development sessions from Claude Code. These contribute toward project hosting/development budgets.
            </p>
          </div>
          <select
            className="bg-background border border-border rounded-md px-3 py-2 text-sm"
            value={filterProjectId ?? ""}
            onChange={(e) => setFilterProjectId(e.target.value ? parseInt(e.target.value) : null)}
            data-testid="select-project-filter"
          >
            <option value="">All projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5"><FolderKanban className="w-3.5 h-3.5" /> Sessions</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{totals.count}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Total Time</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{fmtMinutes(totals.minutes)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Total Cost</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{fmtCents(totals.cents)}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent sessions</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Claude Code sessions logged yet. Drop a <code className="px-1 py-0.5 bg-muted rounded text-xs">.jdcd-project</code> file in a project root to start logging.</p>
            ) : (
              <div className="space-y-3">
                {logs.map(log => (
                  <div key={log.id} className="border border-border rounded-lg p-4 hover-elevate" data-testid={`log-${log.id}`}>
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <div className="font-medium text-sm">{log.projectName}</div>
                        <div className="text-xs text-muted-foreground">{fmtDateTime(log.createdAt)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={log.logType === "hosting" ? "secondary" : "outline"} className="text-xs">{log.logType}</Badge>
                        <span className="text-xs font-mono">{fmtMinutes(log.minutesSpent)}</span>
                        <span className="text-xs font-mono text-teal-600 dark:text-teal-400">{fmtCents(log.estimatedCostCents)}</span>
                      </div>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground bg-muted/30 rounded p-3 overflow-x-auto max-h-64 overflow-y-auto">
{log.description}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
