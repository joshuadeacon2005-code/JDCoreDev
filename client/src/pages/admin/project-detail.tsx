import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminLayout } from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ProjectCostsPanel } from "@/components/ProjectCostsPanel";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Plus, Loader2, FileText, MessageSquare, FileCheck, 
  DollarSign, Calendar, Trash2, Check, Building2, ChevronRight, ChevronDown,
  Mail, Phone, Video, FileCode, ClipboardList, Upload, Server,
  CircleDollarSign, TrendingUp, Pencil, Eye, Download, Play, Square, Timer, Code, RotateCw,
  ArrowUp, ArrowDown, Sparkles, ScanSearch, Circle, CheckCircle2, GripVertical
} from "lucide-react";
import { format } from "date-fns";
import type { 
  Project, Client, Milestone, ProjectPrompt, 
  ProjectAgreement, Document, ProjectHistoryEvent, ProjectHostingTerms,
  ProjectProcessStep
} from "@shared/schema";
import { ContractGeneratorModal } from "@/components/ContractGeneratorModal";
import { InvoiceGeneratorModal } from "@/components/InvoiceGeneratorModal";
import { DocumentPreview } from "@/components/DocumentPreview";
import { generateMilestoneReceiptPDF } from "@/lib/receipt-pdf";

type ProjectDetailData = Project & {
  client: Client;
  milestones: Milestone[];
  prompts: ProjectPrompt[];
  agreements: ProjectAgreement[];
  documents: Document[];
  historyEvents: ProjectHistoryEvent[];
};

const historyEventSchema = z.object({
  eventType: z.enum(["meeting", "email", "call", "note", "deliverable", "other"]),
  summary: z.string().min(1, "Summary is required"),
  details: z.string().optional(),
  occurredAt: z.string().min(1, "Date is required"),
});

const promptSchema = z.object({
  promptTitle: z.string().min(1, "Title is required"),
  promptText: z.string().min(1, "Prompt text is required"),
  outputSummary: z.string().optional(),
  tags: z.string().optional(),
  visibleToClient: z.boolean().default(false),
});

const agreementSchema = z.object({
  agreementType: z.enum(["sow", "msa", "nda", "contract", "other"]),
  title: z.string().min(1, "Title is required"),
  signed: z.boolean().default(false),
  notes: z.string().optional(),
});

export default function AdminProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: project, isLoading } = useQuery<ProjectDetailData>({
    queryKey: ["/api/admin/projects", projectId],
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!project) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-muted-foreground">Project not found</p>
          <Button asChild variant="outline">
            <Link href="/admin/projects">Back to Projects</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const totalValue = project.milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const paidValue = project.milestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/projects" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span>{project.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {project.name}
              <StatusBadge status={project.status} />
              <StatusBadge status={project.riskState} />
            </h1>
            <Link 
              href={`/admin/clients/${project.client.id}`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
            >
              <Building2 className="h-4 w-4" />
              {project.client.companyName || project.client.name}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <ContractGeneratorModal project={project} />
            <div className="text-right">
              <div className="text-2xl font-semibold font-mono">
                ${(paidValue / 100).toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">
                of ${(totalValue / 100).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              History ({project.historyEvents?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="documentation" data-testid="tab-documentation">
              Documentation ({project.documents.length + project.agreements.length})
            </TabsTrigger>
            <TabsTrigger value="roadmap" data-testid="tab-roadmap">
              Roadmap
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewTab project={project} projectId={projectId} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <HistoryTab projectId={projectId} events={project.historyEvents || []} />
          </TabsContent>

          <TabsContent value="documentation" className="space-y-6">
            <DocumentationTab 
              projectId={projectId}
              clientId={project.clientId}
              documents={project.documents} 
              agreements={project.agreements} 
            />
          </TabsContent>

          <TabsContent value="roadmap" className="space-y-6">
            <RoadmapTab projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

type MaintenanceLog = {
  id: number;
  projectId: number;
  logDate: string;
  minutesSpent: number;
  description: string;
  estimatedCostCents: number | null;
  category: string | null;
  logType: string;
  createdByUserId: number | null;
  createdAt: string;
};

type MaintenanceSummary = {
  totalMinutes: number;
  totalCostCents: number;
  totalHours: number;
  budgetCents: number | null;
  budgetMinutes: number | null;
  cycleStartDate: string;
  cycleEndDate: string;
};

type MaintenanceLogCost = {
  id: number;
  maintenanceLogId: number;
  costCents: number;
  description: string | null;
  createdAt: string;
};

function MaintenanceLogItem({
  log,
  isExpanded,
  onToggleExpand,
  onDelete,
  onEdit,
  onAddCost,
  onDeleteCost,
  isDeleting,
  isEditing,
  isAddingCost
}: {
  log: MaintenanceLog;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onEdit: (data: {
    logDate: string;
    minutesSpent: number;
    description: string;
    category: string;
    estimatedCostCents: number | null;
  }) => void;
  onAddCost: (costCents: number, description?: string) => void;
  onDeleteCost: (costId: number, logId: number) => void;
  isDeleting: boolean;
  isEditing: boolean;
  isAddingCost: boolean;
}) {
  const [newCostAmount, setNewCostAmount] = useState("");
  const [newCostDescription, setNewCostDescription] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [editDate, setEditDate] = useState(log.logDate);
  const [editMinutes, setEditMinutes] = useState(String(log.minutesSpent));
  const [editDescription, setEditDescription] = useState(log.description);
  const [editCategory, setEditCategory] = useState(log.category || "support");
  const [editCost, setEditCost] = useState(
    log.estimatedCostCents != null ? (log.estimatedCostCents / 100).toFixed(2) : ""
  );

  const { data: costs = [] } = useQuery<MaintenanceLogCost[]>({
    queryKey: ["/api/admin/maintenance-logs", log.id, "costs"],
    enabled: isExpanded,
  });

  const totalCost = (log.estimatedCostCents || 0) + costs.reduce((sum, c) => sum + c.costCents, 0);

  const handleAddCost = () => {
    const dollars = parseFloat(newCostAmount);
    if (isNaN(dollars) || dollars <= 0) return;
    onAddCost(Math.round(dollars * 100), newCostDescription || undefined);
    setNewCostAmount("");
    setNewCostDescription("");
  };

  const enterEditMode = () => {
    setEditDate(log.logDate);
    setEditMinutes(String(log.minutesSpent));
    setEditDescription(log.description);
    setEditCategory(log.category || "support");
    setEditCost(log.estimatedCostCents != null ? (log.estimatedCostCents / 100).toFixed(2) : "");
    setEditMode(true);
  };

  const saveEdit = () => {
    const minutes = parseInt(editMinutes, 10);
    if (isNaN(minutes) || minutes < 0) return;
    if (!editDescription.trim()) return;
    const costDollars = editCost.trim() === "" ? null : parseFloat(editCost);
    if (costDollars !== null && (isNaN(costDollars) || costDollars < 0)) return;
    onEdit({
      logDate: editDate,
      minutesSpent: minutes,
      description: editDescription.trim(),
      category: editCategory,
      estimatedCostCents: costDollars === null ? null : Math.round(costDollars * 100),
    });
    setEditMode(false);
  };

  return (
    <div className="border rounded-lg bg-card" data-testid={`maintenance-log-${log.id}`}>
      {editMode ? (
        <div className="p-3 space-y-2 bg-muted/40">
          <div className="grid grid-cols-12 gap-2">
            <Input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="col-span-4 h-8 text-xs"
              data-testid={`edit-log-date-${log.id}`}
            />
            <Input
              type="number"
              min={0}
              placeholder="Minutes"
              value={editMinutes}
              onChange={(e) => setEditMinutes(e.target.value)}
              className="col-span-3 h-8 text-xs"
              data-testid={`edit-log-minutes-${log.id}`}
            />
            <Select value={editCategory} onValueChange={setEditCategory}>
              <SelectTrigger className="col-span-3 h-8 text-xs" data-testid={`edit-log-category-${log.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="bug_fix">Bug Fix</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="Cost ($)"
              value={editCost}
              onChange={(e) => setEditCost(e.target.value)}
              className="col-span-2 h-8 text-xs"
              data-testid={`edit-log-cost-${log.id}`}
            />
          </div>
          <Textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className="min-h-[60px] text-sm"
            data-testid={`edit-log-description-${log.id}`}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditMode(false)}
              disabled={isEditing}
              data-testid={`cancel-edit-log-${log.id}`}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveEdit}
              disabled={isEditing || !editDescription.trim() || !editMinutes}
              data-testid={`save-edit-log-${log.id}`}
            >
              <Check className="h-4 w-4 mr-1" /> Save
            </Button>
          </div>
        </div>
      ) : (
      <div className="flex items-start justify-between p-3">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{format(new Date(log.logDate), "MMM d, yyyy")}</span>
            <Badge variant="secondary" className="text-xs">{log.category || "other"}</Badge>
            <span className="text-sm font-mono text-muted-foreground">
              {Math.floor(log.minutesSpent / 60)}h {log.minutesSpent % 60}m
            </span>
            <span className="text-sm font-mono text-green-600">${(totalCost / 100).toFixed(2)}</span>
            {costs.length > 0 && (
              <Badge variant="outline" className="text-xs">{costs.length + 1} costs</Badge>
            )}
          </div>
          {log.description.length > 120 ? (
            <Collapsible data-testid={`collapsible-log-${log.id}`}>
              <CollapsibleTrigger asChild>
                <button className="text-left w-full group">
                  <p className="text-sm text-muted-foreground line-clamp-1">{log.description}</p>
                  <span className="text-xs text-primary group-data-[state=open]:hidden">Show more</span>
                  <span className="text-xs text-primary hidden group-data-[state=open]:inline">Show less</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{log.description}</p>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <p className="text-sm text-muted-foreground">{log.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleExpand}
            data-testid={`expand-log-${log.id}`}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={enterEditMode}
            disabled={isEditing}
            data-testid={`edit-log-${log.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting}
            data-testid={`delete-log-${log.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      )}
      
      {isExpanded && (
        <div className="border-t p-3 bg-muted/30 space-y-3">
          {/* Existing costs */}
          {log.estimatedCostCents && log.estimatedCostCents > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Initial cost</span>
              <span className="font-mono">${(log.estimatedCostCents / 100).toFixed(2)}</span>
            </div>
          )}
          {costs.map((cost) => (
            <div key={cost.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground truncate flex-1 min-w-0" title={cost.description || "Additional cost"}>{cost.description || "Additional cost"}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono">${(cost.costCents / 100).toFixed(2)}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDeleteCost(cost.id, log.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          
          {/* Add new cost */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Input
              type="number"
              step="0.01"
              placeholder="$0.00"
              value={newCostAmount}
              onChange={(e) => setNewCostAmount(e.target.value)}
              className="w-24"
              data-testid={`input-new-cost-${log.id}`}
            />
            <Input
              placeholder="Description (optional)"
              value={newCostDescription}
              onChange={(e) => setNewCostDescription(e.target.value)}
              className="flex-1"
              data-testid={`input-cost-description-${log.id}`}
            />
            <Button 
              size="sm" 
              onClick={handleAddCost}
              disabled={isAddingCost || !newCostAmount}
              data-testid={`button-add-cost-${log.id}`}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogTypeSection({ projectId, logType, label }: { projectId: number; logType: string; label: string }) {
  const { toast } = useToast();
  const [showAddLog, setShowAddLog] = useState(false);
  const [newLogDate, setNewLogDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newLogMinutes, setNewLogMinutes] = useState("");
  const [newLogDescription, setNewLogDescription] = useState("");
  const [newLogCost, setNewLogCost] = useState("");
  const [newLogCategory, setNewLogCategory] = useState("support");
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [timerCharges, setTimerCharges] = useState<{ amount: string; description: string }[]>([]);
  const [timerChargeAmount, setTimerChargeAmount] = useState("");
  const [timerChargeDescription, setTimerChargeDescription] = useState("");
  
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && timerStartTime) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - timerStartTime) / 1000));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerStartTime]);
  
  const startTimer = () => {
    setTimerStartTime(Date.now());
    setElapsedSeconds(0);
    setIsTimerRunning(true);
    setTimerCharges([]);
    setTimerChargeAmount("");
    setTimerChargeDescription("");
  };
  
  const addTimerCharge = () => {
    const dollars = parseFloat(timerChargeAmount);
    if (isNaN(dollars) || dollars <= 0) return;
    setTimerCharges(prev => [...prev, { amount: timerChargeAmount, description: timerChargeDescription }]);
    setTimerChargeAmount("");
    setTimerChargeDescription("");
  };
  
  const removeTimerCharge = (index: number) => {
    setTimerCharges(prev => prev.filter((_, i) => i !== index));
  };
  
  const stopTimer = () => {
    setIsTimerRunning(false);
    const minutes = Math.ceil(elapsedSeconds / 60);
    setNewLogMinutes(minutes.toString());
    setShowAddLog(true);
  };
  
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  
  const { data: logs = [] } = useQuery<MaintenanceLog[]>({
    queryKey: ["/api/admin/projects", projectId, "maintenance-logs", { logType }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/projects/${projectId}/maintenance-logs?logType=${logType}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  const { data: summary } = useQuery<MaintenanceSummary>({
    queryKey: ["/api/admin/projects", projectId, "maintenance-cycle-summary", { logType }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/projects/${projectId}/maintenance-cycle-summary?logType=${logType}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  const advanceCycleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/projects/${projectId}/advance-cycle`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to advance cycle");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-cycle-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-logs"] });
      // Invalidate all projects' cycle summaries and the client dev summary
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      const count = data?.advancedProjects?.length ?? 1;
      toast({
        title: "Cycle advanced for all projects",
        description: `New billing cycle started today across all ${count} project${count !== 1 ? "s" : ""} for this client.`,
      });
    },
  });

  const createLogMutation = useMutation({
    mutationFn: async (data: { logDate: string; minutesSpent: number; description: string; estimatedCostCents?: number; category?: string; pendingCharges?: { amount: string; description: string }[] }) => {
      const { pendingCharges, ...logData } = data;
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/maintenance-logs`, { ...logData, logType });
      const newLog = await res.json();
      if (pendingCharges && pendingCharges.length > 0) {
        let failedCharges = 0;
        for (const charge of pendingCharges) {
          try {
            const costCents = Math.round(parseFloat(charge.amount) * 100);
            await apiRequest("POST", `/api/admin/maintenance-logs/${newLog.id}/costs`, { costCents, description: charge.description || undefined });
          } catch {
            failedCharges++;
          }
        }
        if (failedCharges > 0) {
          newLog._failedCharges = failedCharges;
        }
      }
      return newLog;
    },
    onSuccess: (newLog) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-cycle-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-alltime-summary"] });
      if (newLog?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/maintenance-logs", newLog.id, "costs"] });
      }
      if (newLog?._failedCharges) {
        toast({ title: `${label} log saved`, description: `${newLog._failedCharges} charge(s) failed to save. You can add them manually.`, variant: "destructive" });
      } else {
        toast({ title: `${label} log saved` });
      }
      setShowAddLog(false);
      setNewLogMinutes("");
      setNewLogDescription("");
      setNewLogCost("");
      setElapsedSeconds(0);
      setTimerStartTime(null);
      setTimerCharges([]);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to log", description: error.message, variant: "destructive" });
    },
  });

  const deleteLogMutation = useMutation({
    mutationFn: async (logId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/maintenance-logs/${logId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-cycle-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-alltime-summary"] });
      toast({ title: "Log deleted" });
    },
  });

  const editLogMutation = useMutation({
    mutationFn: async ({ logId, data }: {
      logId: number;
      data: {
        logDate: string;
        minutesSpent: number;
        description: string;
        category: string;
        estimatedCostCents: number | null;
      };
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/maintenance-logs/${logId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-cycle-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-alltime-summary"] });
      toast({ title: "Log updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update log", description: error.message, variant: "destructive" });
    },
  });

  const addCostMutation = useMutation({
    mutationFn: async ({ logId, costCents, description }: { logId: number; costCents: number; description?: string }) => {
      const res = await apiRequest("POST", `/api/admin/maintenance-logs/${logId}/costs`, { costCents, description });
      return { ...(await res.json()), logId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/maintenance-logs", data.logId, "costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-cycle-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-alltime-summary"] });
      toast({ title: "Cost added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add cost", description: error.message, variant: "destructive" });
    },
  });

  const deleteCostMutation = useMutation({
    mutationFn: async ({ costId, logId }: { costId: number; logId: number }) => {
      const res = await apiRequest("DELETE", `/api/admin/maintenance-log-costs/${costId}`);
      return { ...(await res.json()), logId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/maintenance-logs", data.logId, "costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-cycle-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-alltime-summary"] });
      toast({ title: "Cost deleted" });
    },
  });

  const formatCycleDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${m}/${d}/${y}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-mono" data-testid="cycle-date-range">
          Cycle: {summary ? `${formatCycleDate(summary.cycleStartDate)} — ${formatCycleDate(summary.cycleEndDate)}` : "—"}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => advanceCycleMutation.mutate()}
          disabled={advanceCycleMutation.isPending}
          data-testid="button-next-cycle"
          title="Advances billing cycle for all projects under this client"
        >
          <RotateCw className="h-3 w-3 mr-1" />
          {advanceCycleMutation.isPending ? "Advancing…" : "Next Cycle (All Projects)"}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs">Cost This Cycle</Label>
          <span className="text-lg font-mono block">
            ${((summary?.totalCostCents || 0) / 100).toFixed(2)}
            {summary?.budgetCents && summary.budgetCents > 0 && (
              <span className="text-muted-foreground text-sm"> / ${(summary.budgetCents / 100).toFixed(2)}</span>
            )}
          </span>
          {summary?.budgetCents && summary.budgetCents > 0 && (
            <Progress 
              value={Math.min(100, (summary.totalCostCents / summary.budgetCents) * 100)} 
              className="h-2"
            />
          )}
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs">Time This Cycle</Label>
          <span className="text-lg font-mono block">
            {((summary?.totalMinutes || 0) / 60).toFixed(1)}h
            {summary?.budgetMinutes && summary.budgetMinutes > 0 && (
              <span className="text-muted-foreground text-sm"> / {(summary.budgetMinutes / 60).toFixed(1)}h</span>
            )}
          </span>
          {summary?.budgetMinutes && summary.budgetMinutes > 0 && (
            <Progress 
              value={Math.min(100, (summary.totalMinutes / summary.budgetMinutes) * 100)} 
              className="h-2"
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{label} Logs</h4>
        <div className="flex items-center gap-2">
          {(isTimerRunning || elapsedSeconds > 0) && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted font-mono text-lg" data-testid={`stopwatch-display-${logType}`}>
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className={isTimerRunning ? "text-green-600" : ""}>{formatTime(elapsedSeconds)}</span>
            </div>
          )}
          {!isTimerRunning ? (
            <Button size="sm" variant="default" onClick={startTimer} data-testid={`button-start-timer-${logType}`}>
              <Play className="h-4 w-4 mr-1" />
              Start Timer
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={stopTimer} data-testid={`button-stop-timer-${logType}`}>
              <Square className="h-4 w-4 mr-1" />
              Stop & Log
            </Button>
          )}
          {!isTimerRunning && (
            <Button size="sm" variant="outline" onClick={() => setShowAddLog(!showAddLog)} data-testid={`button-add-log-${logType}`}>
              <Plus className="h-4 w-4 mr-1" />
              Manual Log
            </Button>
          )}
        </div>
      </div>

      {isTimerRunning && (
        <Card className="p-4 bg-muted/50 border-green-500/30" data-testid={`timer-charges-panel-${logType}`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-medium flex items-center gap-1.5">
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                Charges
              </h5>
              {timerCharges.length > 0 && (
                <span className="text-xs font-mono text-green-600" data-testid={`timer-charges-total-${logType}`}>
                  ${timerCharges.reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0).toFixed(2)}
                </span>
              )}
            </div>
            {timerCharges.map((charge, index) => (
              <div key={index} className="flex items-center justify-between gap-2 text-sm" data-testid={`timer-charge-item-${index}`}>
                <span className="text-muted-foreground truncate flex-1 min-w-0">{charge.description || "Charge"}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono">${parseFloat(charge.amount).toFixed(2)}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeTimerCharge(index)} data-testid={`button-remove-timer-charge-${index}`}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder="$0.00"
                value={timerChargeAmount}
                onChange={(e) => setTimerChargeAmount(e.target.value)}
                className="w-24"
                data-testid={`input-timer-charge-amount-${logType}`}
              />
              <Input
                placeholder="Description (optional)"
                value={timerChargeDescription}
                onChange={(e) => setTimerChargeDescription(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTimerCharge(); } }}
                data-testid={`input-timer-charge-description-${logType}`}
              />
              <Button
                size="sm"
                onClick={addTimerCharge}
                disabled={!timerChargeAmount || isNaN(parseFloat(timerChargeAmount)) || parseFloat(timerChargeAmount) <= 0}
                data-testid={`button-add-timer-charge-${logType}`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {showAddLog && (
        <Card className="p-4 bg-muted/50">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={newLogDate}
                onChange={(e) => setNewLogDate(e.target.value)}
                data-testid={`input-log-date-${logType}`}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Minutes Spent</Label>
              <Input
                type="number"
                min={1}
                placeholder="30"
                value={newLogMinutes}
                onChange={(e) => setNewLogMinutes(e.target.value)}
                data-testid={`input-log-minutes-${logType}`}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="space-y-2">
              <Label className="text-xs">Estimated Cost ($)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newLogCost}
                onChange={(e) => setNewLogCost(e.target.value)}
                data-testid={`input-log-cost-${logType}`}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Category</Label>
              <Select value={newLogCategory} onValueChange={setNewLogCategory}>
                <SelectTrigger data-testid={`select-log-category-${logType}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="bug_fix">Bug Fix</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2 mt-3">
            <Label className="text-xs">Description</Label>
            <Textarea
              placeholder="What work was done..."
              value={newLogDescription}
              onChange={(e) => setNewLogDescription(e.target.value)}
              className="min-h-[60px]"
              data-testid={`input-log-description-${logType}`}
            />
          </div>
          {timerCharges.length > 0 && (
            <div className="mt-3 p-3 rounded-md bg-muted/70 space-y-2" data-testid={`pending-charges-summary-${logType}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Charges to be saved with this log</span>
                <span className="text-xs font-mono text-green-600">
                  ${timerCharges.reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0).toFixed(2)}
                </span>
              </div>
              {timerCharges.map((charge, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs text-muted-foreground" data-testid={`pending-charge-item-${i}`}>
                  <span className="truncate flex-1 min-w-0">{charge.description || "Charge"}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono">${parseFloat(charge.amount).toFixed(2)}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeTimerCharge(i)} data-testid={`button-remove-pending-charge-${i}`}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => { setShowAddLog(false); setTimerCharges([]); }}>Cancel</Button>
            <Button 
              size="sm" 
              onClick={() => {
                if (!newLogMinutes || !newLogDescription) {
                  toast({ title: "Please fill in minutes and description", variant: "destructive" });
                  return;
                }
                createLogMutation.mutate({
                  logDate: newLogDate,
                  minutesSpent: parseInt(newLogMinutes),
                  description: newLogDescription,
                  estimatedCostCents: newLogCost ? Math.round(parseFloat(newLogCost) * 100) : undefined,
                  category: newLogCategory,
                  pendingCharges: timerCharges.length > 0 ? timerCharges : undefined,
                });
              }}
              disabled={createLogMutation.isPending}
              data-testid={`button-save-log-${logType}`}
            >
              {createLogMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Log"}
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No {label.toLowerCase()} logs yet</p>
        ) : (
          logs.map((log) => (
            <MaintenanceLogItem
              key={log.id}
              log={log}
              isExpanded={expandedLogId === log.id}
              onToggleExpand={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
              onDelete={() => deleteLogMutation.mutate(log.id)}
              onEdit={(data) => editLogMutation.mutate({ logId: log.id, data })}
              onAddCost={(costCents, description) => addCostMutation.mutate({ logId: log.id, costCents, description })}
              onDeleteCost={(costId, logId) => deleteCostMutation.mutate({ costId, logId })}
              isDeleting={deleteLogMutation.isPending}
              isEditing={editLogMutation.isPending}
              isAddingCost={addCostMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DevelopmentLogsSection({ projectId }: { projectId: number }) {
  const { data: allTimeSummary } = useQuery<{ totalMinutes: number; totalCostCents: number; totalHours: number }>({
    queryKey: ["/api/admin/projects", projectId, "maintenance-alltime-summary", { logType: "development" }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/projects/${projectId}/maintenance-alltime-summary?logType=development`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  return (
    <Card data-testid="development-logs-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Development Logs
          </CardTitle>
          {allTimeSummary && (allTimeSummary.totalCostCents > 0 || allTimeSummary.totalMinutes > 0) && (
            <div className="text-right" data-testid="dev-alltime-totals">
              <div className="text-lg font-mono font-semibold" data-testid="text-dev-total-cost">
                ${(allTimeSummary.totalCostCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-muted-foreground">
                {allTimeSummary.totalHours}h total
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <LogTypeSection projectId={projectId} logType="development" label="Development" />
      </CardContent>
    </Card>
  );
}

function HostingMaintenanceSection({ projectId, projectName }: { projectId: number; projectName: string }) {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState("overview");
  const [isPromptsOpen, setIsPromptsOpen] = useState(false);

  const { data: hostingTerms, isLoading } = useQuery<ProjectHostingTerms | null>({
    queryKey: ["/api/admin/projects", projectId, "hosting-terms"],
  });
  
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ProjectHostingTerms>) => {
      const res = await apiRequest("PUT", `/api/admin/projects/${projectId}/hosting-terms`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "hosting-terms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "maintenance-cycle-summary"] });
      toast({ title: "Hosting terms updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });
  
  const updateField = (field: string, value: any) => {
    updateMutation.mutate({ [field]: value });
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Hosting & Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  const terms = hostingTerms || {};
  const status = (terms as any).status || "none";
  
  return (
    <Card data-testid="hosting-maintenance-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Hosting & Maintenance
          </CardTitle>
          <Select
            value={status}
            onValueChange={(v) => updateField("status", v)}
          >
            <SelectTrigger className="w-32" data-testid="select-hosting-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="payment" className="text-xs">Payment</TabsTrigger>
            <TabsTrigger value="hosting-logs" className="text-xs" data-testid="tab-hosting-logs">Logs</TabsTrigger>
            <TabsTrigger value="scope" className="text-xs">Scope</TabsTrigger>
            <TabsTrigger value="agreement" className="text-xs">Agreement</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={(terms as any).startDate || ""}
                  onChange={(e) => updateField("startDate", e.target.value || null)}
                  data-testid="input-hosting-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Initial Term (months)</Label>
                <Input
                  type="number"
                  min={1}
                  value={(terms as any).initialTermMonths || 6}
                  onChange={(e) => updateField("initialTermMonths", parseInt(e.target.value) || 6)}
                  data-testid="input-hosting-term-months"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Monthly Fee</Label>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={(terms as any).monthlyFeeCents ? ((terms as any).monthlyFeeCents / 100).toFixed(2) : ""}
                    onChange={(e) => {
                      const dollars = parseFloat(e.target.value || "0");
                      updateField("monthlyFeeCents", Math.round(dollars * 100));
                    }}
                    data-testid="input-hosting-monthly-fee"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Termination Notice (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={(terms as any).terminationNoticeDays || 30}
                  onChange={(e) => updateField("terminationNoticeDays", parseInt(e.target.value) || 30)}
                  data-testid="input-hosting-termination-days"
                />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="payment" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Currency</Label>
                <Select
                  value={(terms as any).currency || "USD"}
                  onValueChange={(v) => updateField("currency", v)}
                >
                  <SelectTrigger data-testid="select-hosting-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="HKD">HKD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Invoice Due (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={(terms as any).invoiceDueDays || 14}
                  onChange={(e) => updateField("invoiceDueDays", parseInt(e.target.value) || 14)}
                  data-testid="input-hosting-invoice-due"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={(terms as any).billedInAdvance ?? true}
                onCheckedChange={(v) => updateField("billedInAdvance", v)}
                data-testid="switch-hosting-billed-advance"
              />
              <Label className="text-sm">Bill in Advance</Label>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Term Extension Notes</Label>
              <Textarea
                placeholder="How the agreement can be extended..."
                value={(terms as any).termExtensionNotes || ""}
                onChange={(e) => updateField("termExtensionNotes", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-term-extension"
              />
            </div>
          </TabsContent>

          <TabsContent value="hosting-logs" className="mt-4 space-y-4">
            <LogTypeSection projectId={projectId} logType="hosting" label="Hosting" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Monthly Cost Budget</Label>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="50.00"
                    value={(terms as any).maintenanceBudgetCents ? ((terms as any).maintenanceBudgetCents / 100).toFixed(2) : ""}
                    onChange={(e) => {
                      const dollars = parseFloat(e.target.value || "0");
                      updateField("maintenanceBudgetCents", Math.round(dollars * 100));
                    }}
                    data-testid="input-maintenance-budget"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Monthly Time Budget (hours)</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="2"
                  value={(terms as any).maintenanceBudgetMinutes ? ((terms as any).maintenanceBudgetMinutes / 60).toString() : ""}
                  onChange={(e) => {
                    const hours = parseFloat(e.target.value || "0");
                    updateField("maintenanceBudgetMinutes", Math.round(hours * 60));
                  }}
                  data-testid="input-maintenance-time-budget"
                />
              </div>
            </div>
            <Collapsible open={isPromptsOpen} onOpenChange={setIsPromptsOpen} className="mt-4">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-3" data-testid="button-toggle-prompts">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Maintenance Prompts</span>
                  </div>
                  {isPromptsOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Prompts & Instructions for AI Maintenance</Label>
                  <Textarea
                    placeholder="Add prompts, instructions, or context for AI agents working on this project's maintenance..."
                    value={(terms as any).maintenancePrompts || ""}
                    onChange={(e) => updateField("maintenancePrompts", e.target.value)}
                    className="min-h-[120px] font-mono text-sm"
                    data-testid="textarea-maintenance-prompts"
                  />
                  <p className="text-xs text-muted-foreground">
                    Store reusable prompts, project context, or instructions for maintenance work.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>
          
          <TabsContent value="scope" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Included Services</Label>
              <Textarea
                placeholder="What's included in the hosting package..."
                value={(terms as any).includedServices || ""}
                onChange={(e) => updateField("includedServices", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-included"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Excluded Services</Label>
              <Textarea
                placeholder="What's NOT included..."
                value={(terms as any).excludedServices || ""}
                onChange={(e) => updateField("excludedServices", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-excluded"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Client Responsibilities</Label>
              <Textarea
                placeholder="What the client is responsible for..."
                value={(terms as any).clientResponsibilities || ""}
                onChange={(e) => updateField("clientResponsibilities", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-responsibilities"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Availability Disclaimer</Label>
              <Textarea
                placeholder="Uptime expectations and disclaimers..."
                value={(terms as any).availabilityDisclaimer || ""}
                onChange={(e) => updateField("availabilityDisclaimer", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-availability"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="agreement" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Governing Law</Label>
                <Input
                  value={(terms as any).governingLaw || "Hong Kong SAR"}
                  onChange={(e) => updateField("governingLaw", e.target.value)}
                  data-testid="input-hosting-governing-law"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">IP Notes</Label>
              <Textarea
                placeholder="Intellectual property ownership notes..."
                value={(terms as any).ipNotes || ""}
                onChange={(e) => updateField("ipNotes", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-ip"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Confidentiality Notes</Label>
              <Textarea
                placeholder="Confidentiality terms..."
                value={(terms as any).confidentialityNotes || ""}
                onChange={(e) => updateField("confidentialityNotes", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-confidentiality"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Liability Cap Notes</Label>
              <Textarea
                placeholder="Liability limitations..."
                value={(terms as any).liabilityCapNotes || ""}
                onChange={(e) => updateField("liabilityCapNotes", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-liability"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Maintenance & Support Terms</Label>
              <Textarea
                placeholder="E.g., '$50/month maintenance budget included. Work beyond budget billed at $75/hour. Response time: 24-48 business hours.'"
                value={(terms as any).maintenanceTermsNotes || ""}
                onChange={(e) => updateField("maintenanceTermsNotes", e.target.value)}
                className="min-h-[80px]"
                data-testid="input-hosting-maintenance-terms"
              />
              <p className="text-xs text-muted-foreground">
                Clarify what maintenance time is included in the hosting fee and rates for work beyond the budget.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Self-Hosting Handover Notes</Label>
              <Textarea
                placeholder="Process for client to take over hosting..."
                value={(terms as any).selfHostingHandoverNotes || ""}
                onChange={(e) => updateField("selfHostingHandoverNotes", e.target.value)}
                className="min-h-[60px]"
                data-testid="input-hosting-handover"
              />
            </div>
          </TabsContent>
        </Tabs>
        
        {updateMutation.isPending && (
          <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const milestoneSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amountCents: z.number().min(0, "Amount must be positive"),
  dueDate: z.string().optional(),
  status: z.enum(["planned", "invoiced", "paid", "overdue"]),
  notes: z.string().optional(),
});

function PaymentMilestonesSection({ projectId, project, milestones }: { projectId: number; project: ProjectDetailData; milestones: Milestone[] }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  const form = useForm({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      name: "",
      amountCents: 0,
      dueDate: "",
      status: "planned" as const,
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof milestoneSchema>) => {
      const res = await apiRequest("POST", "/api/admin/milestones", {
        ...data,
        projectId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
      toast({ title: "Payment milestone added" });
      setIsDialogOpen(false);
      form.reset({ name: "", amountCents: 0, dueDate: "", status: "planned", notes: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add milestone", description: error.message, variant: "destructive" });
    },
  });

  const editForm = useForm({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      name: "",
      amountCents: 0,
      dueDate: "",
      status: "planned" as const,
      notes: "",
    },
  });

  const openEditDialog = (milestone: Milestone) => {
    setEditingMilestone(milestone);
    editForm.reset({
      name: milestone.name,
      amountCents: milestone.amountCents,
      dueDate: milestone.dueDate || "",
      status: milestone.status as any,
      notes: milestone.notes || "",
    });
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Milestone> }) => {
      const res = await apiRequest("PATCH", `/api/admin/milestones/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones-with-clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoiced-milestones"] });
      setEditingMilestone(null);
      toast({ title: "Milestone updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/milestones/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones-with-clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoiced-milestones"] });
      toast({ title: "Milestone deleted" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <CardTitle className="text-lg">Payment Milestones</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" data-testid="button-add-milestone">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Payment Milestone</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input {...form.register("name")} placeholder="e.g., Initial Deposit" data-testid="input-milestone-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.watch("amountCents") ? (form.watch("amountCents") / 100).toFixed(2) : ""}
                    onChange={(e) => form.setValue("amountCents", Math.round(parseFloat(e.target.value || "0") * 100))}
                    data-testid="input-milestone-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    {...form.register("dueDate")}
                    data-testid="input-milestone-date"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) => form.setValue("status", v as any)}
                >
                  <SelectTrigger data-testid="select-milestone-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="invoiced">Invoiced</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  {...form.register("notes")}
                  placeholder="e.g., Deliverables: Repository setup, initial design..."
                  rows={3}
                  data-testid="input-milestone-notes"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-milestone">
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Milestone
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <p className="text-muted-foreground text-sm">No payment milestones yet. Click + to add one.</p>
        ) : (
          <div className="space-y-2">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50"
                data-testid={`milestone-${milestone.id}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{milestone.name}</p>
                    {milestone.dueDate && (
                      <p className="text-sm text-muted-foreground">
                        Due {format(new Date(milestone.dueDate), "MMM d, yyyy")}
                      </p>
                    )}
                    {milestone.notes && (
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                        {milestone.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">
                    ${(milestone.amountCents / 100).toLocaleString()}
                  </span>
                  <Select
                    value={milestone.status}
                    onValueChange={(v) => updateMutation.mutate({ id: milestone.id, data: { status: v as any } })}
                  >
                    <SelectTrigger className="h-auto py-1 px-2 border-0 bg-transparent w-auto">
                      <StatusBadge status={milestone.status} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="invoiced">Invoiced</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                  <InvoiceGeneratorModal
                    project={project}
                    milestones={milestones}
                    currentMilestone={milestone}
                  />
                  {milestone.status === "paid" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Download Receipt"
                      data-testid={`button-receipt-milestone-${milestone.id}`}
                      onClick={() => {
                        try {
                          generateMilestoneReceiptPDF({
                            ...milestone,
                            project,
                            client: project.client,
                          });
                        } catch {
                          toast({ title: "Failed to generate receipt", variant: "destructive" });
                        }
                      }}
                    >
                      <Download className="h-3 w-3 text-green-600" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-50 hover:opacity-100"
                    onClick={() => openEditDialog(milestone)}
                    data-testid={`button-edit-milestone-${milestone.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-50 hover:opacity-100"
                    onClick={() => deleteMutation.mutate(milestone.id)}
                    data-testid={`button-delete-milestone-${milestone.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!editingMilestone} onOpenChange={(open) => !open && setEditingMilestone(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Milestone</DialogTitle>
            </DialogHeader>
            <form onSubmit={editForm.handleSubmit((data) => {
              if (editingMilestone) {
                updateMutation.mutate({ id: editingMilestone.id, data });
              }
            })} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input {...editForm.register("name")} placeholder="e.g., Initial Deposit" data-testid="input-edit-milestone-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={editForm.watch("amountCents") ? (editForm.watch("amountCents") / 100).toFixed(2) : ""}
                    onChange={(e) => editForm.setValue("amountCents", Math.round(parseFloat(e.target.value || "0") * 100))}
                    data-testid="input-edit-milestone-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    {...editForm.register("dueDate")}
                    data-testid="input-edit-milestone-date"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editForm.watch("status")}
                  onValueChange={(v) => editForm.setValue("status", v as any)}
                >
                  <SelectTrigger data-testid="select-edit-milestone-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="invoiced">Invoiced</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  {...editForm.register("notes")}
                  placeholder="e.g., Deliverables: Repository setup, initial design..."
                  rows={3}
                  data-testid="input-edit-milestone-notes"
                />
              </div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-save-milestone">
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function MilestoneProgressCard({ milestones }: { milestones: Milestone[] }) {
  const totalValue = milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const paidValue = milestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);
  const invoicedValue = milestones.filter(m => m.status === "invoiced").reduce((sum, m) => sum + m.amountCents, 0);
  const overdueValue = milestones.filter(m => m.status === "overdue").reduce((sum, m) => sum + m.amountCents, 0);
  const plannedValue = milestones.filter(m => m.status === "planned").reduce((sum, m) => sum + m.amountCents, 0);
  
  const paidPercent = totalValue > 0 ? (paidValue / totalValue) * 100 : 0;
  const invoicedPercent = totalValue > 0 ? (invoicedValue / totalValue) * 100 : 0;
  const overduePercent = totalValue > 0 ? (overdueValue / totalValue) * 100 : 0;
  
  const paidCount = milestones.filter(m => m.status === "paid").length;
  const totalCount = milestones.length;

  if (milestones.length === 0) {
    return null;
  }

  return (
    <Card data-testid="card-milestone-progress">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          Payment Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{paidCount} of {totalCount} milestones paid</span>
            <span className="font-mono font-semibold" data-testid="text-progress-percent">
              {paidPercent.toFixed(0)}%
            </span>
          </div>
          
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div 
              className="absolute left-0 top-0 h-full bg-emerald-500 dark:bg-emerald-600 transition-all"
              style={{ width: `${paidPercent}%` }}
              data-testid="progress-paid"
            />
            <div 
              className="absolute top-0 h-full bg-blue-500 dark:bg-blue-600 transition-all"
              style={{ left: `${paidPercent}%`, width: `${invoicedPercent}%` }}
              data-testid="progress-invoiced"
            />
            <div 
              className="absolute top-0 h-full bg-amber-500 dark:bg-amber-600 transition-all"
              style={{ left: `${paidPercent + invoicedPercent}%`, width: `${overduePercent}%` }}
              data-testid="progress-overdue"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2" data-testid="stat-paid">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div>
              <p className="text-muted-foreground">Paid</p>
              <p className="font-mono font-medium">${(paidValue / 100).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" data-testid="stat-invoiced">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <div>
              <p className="text-muted-foreground">Invoiced</p>
              <p className="font-mono font-medium">${(invoicedValue / 100).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" data-testid="stat-overdue">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <div>
              <p className="text-muted-foreground">Overdue</p>
              <p className="font-mono font-medium">${(overdueValue / 100).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" data-testid="stat-planned">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            <div>
              <p className="text-muted-foreground">Planned</p>
              <p className="font-mono font-medium">${(plannedValue / 100).toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="pt-2 border-t flex items-center justify-between">
          <span className="text-muted-foreground">Total Project Value</span>
          <span className="font-mono text-lg font-semibold" data-testid="text-total-value">
            ${(totalValue / 100).toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ project, projectId }: { project: ProjectDetailData; projectId: number }) {
  const paidCents = project.milestones.filter((m) => m.status === "paid").reduce((s, m) => s + m.amountCents, 0);
  return (
    <div className="space-y-6">
      <MilestoneProgressCard milestones={project.milestones} />

      <ProjectCostsPanel
        projectId={projectId}
        project={project}
        client={project.client}
        paidCents={paidCents}
      />

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.description && (
              <div>
                <Label className="text-muted-foreground">Description</Label>
                <p className="mt-1">{project.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Billing Model</Label>
                <p className="mt-1 capitalize">{project.billingModel.replace("_", " ")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Created</Label>
                <p className="mt-1">{format(new Date(project.createdAt), "MMM d, yyyy")}</p>
              </div>
              {project.startDate && (
                <div>
                  <Label className="text-muted-foreground">Start Date</Label>
                  <p className="mt-1">{format(new Date(project.startDate), "MMM d, yyyy")}</p>
                </div>
              )}
              {project.endDate && (
                <div>
                  <Label className="text-muted-foreground">End Date</Label>
                  <p className="mt-1">{format(new Date(project.endDate), "MMM d, yyyy")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {(project.status === "completed" || project.status === "hosting") ? (
          <HostingMaintenanceSection projectId={projectId} projectName={project.name} />
        ) : (
          <DevelopmentLogsSection projectId={projectId} />
        )}

        <PaymentMilestonesSection projectId={projectId} project={project} milestones={project.milestones} />
      </div>

      <PromptsSection projectId={projectId} prompts={project.prompts} />
    </div>
  );
}

function PromptsSection({ projectId, prompts }: { projectId: number; prompts: ProjectPrompt[] }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      promptTitle: "",
      promptText: "",
      outputSummary: "",
      tags: "",
      visibleToClient: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof promptSchema>) => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/prompts`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Prompt added" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add prompt", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ProjectPrompt> }) => {
      const res = await apiRequest("PATCH", `/api/admin/prompts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/prompts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Prompt deleted" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg">Prompt History</CardTitle>
          <CardDescription>Track AI prompts and responses for this project</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-prompt">
              <Plus className="h-4 w-4 mr-1" /> Add Prompt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Prompt</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("promptTitle")} placeholder="e.g., Initial Spec Generation" data-testid="input-prompt-title" />
              </div>
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea 
                  {...form.register("promptText")} 
                  placeholder="The prompt text..."
                  className="min-h-32 font-mono text-sm"
                  data-testid="input-prompt-text"
                />
              </div>
              <div className="space-y-2">
                <Label>Output Summary (optional)</Label>
                <Textarea 
                  {...form.register("outputSummary")} 
                  placeholder="Summary of the AI output..."
                  className="min-h-24 font-mono text-sm"
                  data-testid="input-prompt-output"
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (optional)</Label>
                <Input {...form.register("tags")} placeholder="e.g., spec, planning" data-testid="input-prompt-tags" />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.watch("visibleToClient")}
                  onCheckedChange={(v) => form.setValue("visibleToClient", v)}
                  data-testid="switch-visible-to-client"
                />
                <Label>Visible to client</Label>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-prompt">
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Prompt
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {prompts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No prompts recorded</p>
        ) : (
          <div className="space-y-4">
            {prompts.map((prompt) => (
              <Card key={prompt.id} data-testid={`prompt-${prompt.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{prompt.promptTitle}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(prompt.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {prompt.visibleToClient ? (
                        <Badge variant="secondary" className="text-xs">Client Visible</Badge>
                      ) : (
                        <Badge appearance="stroke" className="text-xs">Internal Only</Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => updateMutation.mutate({ 
                          id: prompt.id, 
                          data: { visibleToClient: !prompt.visibleToClient } 
                        })}
                        data-testid={`button-toggle-visibility-${prompt.id}`}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(prompt.id)}
                        data-testid={`button-delete-prompt-${prompt.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground text-xs">Prompt</Label>
                    <pre className="mt-1 p-3 rounded-md bg-muted text-sm whitespace-pre-wrap font-mono">
                      {prompt.promptText}
                    </pre>
                  </div>
                  {prompt.outputSummary && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Output Summary</Label>
                      <pre className="mt-1 p-3 rounded-md bg-muted text-sm whitespace-pre-wrap font-mono">
                        {prompt.outputSummary}
                      </pre>
                    </div>
                  )}
                  {prompt.tags && (
                    <div className="flex items-center gap-2">
                      <Label className="text-muted-foreground text-xs">Tags:</Label>
                      <span className="text-sm">{prompt.tags}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryTab({ projectId, events }: { projectId: number; events: ProjectHistoryEvent[] }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(historyEventSchema),
    defaultValues: {
      eventType: "meeting" as const,
      summary: "",
      details: "",
      occurredAt: new Date().toISOString().split("T")[0],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof historyEventSchema>) => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/history-events`, {
        ...data,
        occurredAt: new Date(data.occurredAt).toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Event added" });
      setIsDialogOpen(false);
      form.reset({ eventType: "meeting", summary: "", details: "", occurredAt: new Date().toISOString().split("T")[0] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add event", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/history-events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Event deleted" });
    },
  });

  const eventIcons: Record<string, JSX.Element> = {
    meeting: <Video className="h-4 w-4" />,
    email: <Mail className="h-4 w-4" />,
    call: <Phone className="h-4 w-4" />,
    note: <ClipboardList className="h-4 w-4" />,
    deliverable: <FileCode className="h-4 w-4" />,
    other: <ClipboardList className="h-4 w-4" />,
  };

  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg">History</CardTitle>
          <CardDescription>Track meetings, emails, calls, and notes for this project</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-event">
              <Plus className="h-4 w-4 mr-1" /> Add Event
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add History Event</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.watch("eventType")}
                  onValueChange={(v) => form.setValue("eventType", v as any)}
                >
                  <SelectTrigger data-testid="select-event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="deliverable">Deliverable</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Summary</Label>
                <Input {...form.register("summary")} placeholder="e.g., Kickoff meeting with client" data-testid="input-event-summary" />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input 
                  type="date" 
                  {...form.register("occurredAt")} 
                  data-testid="input-event-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Details (optional)</Label>
                <Textarea {...form.register("details")} placeholder="Notes about this event..." data-testid="input-event-details" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-event">
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Event
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No history events recorded</p>
        ) : (
          <div className="space-y-4">
            {sortedEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between gap-4 p-4 rounded-md bg-muted/50"
                data-testid={`event-${event.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-muted-foreground">
                    {eventIcons[event.eventType] || eventIcons.note}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{event.summary}</p>
                      <Badge appearance="stroke" className="text-xs capitalize">{event.eventType}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {format(new Date(event.occurredAt), "MMM d, yyyy")}
                    </p>
                    {event.details && (
                      <p className="text-sm mt-2">{event.details}</p>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(event.id)}
                  data-testid={`button-delete-event-${event.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoadmapTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [showAddTask, setShowAddTask] = useState(false);
  const [showPrdImport, setShowPrdImport] = useState(false);
  const [prdText, setPrdText] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newDueDate, setNewDueDate] = useState("");

  const { data: tasks = [], isLoading } = useQuery<ProjectProcessStep[]>({
    queryKey: ["/api/admin/projects", projectId, "process-steps"],
  });

  const sortedTasks = [...tasks].sort((a, b) => a.stepOrder - b.stepOrder);
  const doneTasks = sortedTasks.filter(t => t.status === "done");
  const progressPercent = sortedTasks.length > 0 ? Math.round((doneTasks.length / sortedTasks.length) * 100) : 0;

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; priority?: string; dueDate?: string; stepOrder: number }) => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/process-steps`, {
        ...data,
        projectId,
        status: "planned",
        isMilestone: false,
        amountCents: 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "process-steps"] });
      toast({ title: "Task added" });
      setShowAddTask(false);
      setNewTitle("");
      setNewDescription("");
      setNewPriority("medium");
      setNewDueDate("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add task", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/admin/process-steps/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "process-steps"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update task", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/process-steps/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "process-steps"] });
      toast({ title: "Task deleted" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: number; stepOrder: number }[]) => {
      const res = await apiRequest("PATCH", `/api/admin/projects/${projectId}/process-steps/reorder`, { updates });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "process-steps"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`/api/admin/projects/${projectId}/process-steps/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prdText: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Server error ${res.status}`);
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "process-steps"] });
      toast({ title: "Tasks generated", description: `${Array.isArray(data) ? data.length : 0} tasks created from PRD` });
      setPrdText("");
      setShowPrdImport(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate tasks", description: error.message, variant: "destructive" });
    },
  });

  const autoDetectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/process-steps/auto-detect`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "process-steps"] });
      toast({ title: "Auto-detection complete", description: `${data?.updated || 0} task(s) updated` });
    },
    onError: (error: Error) => {
      toast({ title: "Auto-detection failed", description: error.message, variant: "destructive" });
    },
  });

  const moveTask = (taskId: number, direction: "up" | "down") => {
    const idx = sortedTasks.findIndex(t => t.id === taskId);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sortedTasks.length) return;
    const updates = sortedTasks.map((t, i) => {
      if (i === idx) return { id: t.id, stepOrder: sortedTasks[targetIdx].stepOrder };
      if (i === targetIdx) return { id: t.id, stepOrder: sortedTasks[idx].stepOrder };
      return { id: t.id, stepOrder: t.stepOrder };
    });
    reorderMutation.mutate(updates);
  };

  const cycleStatus = (task: ProjectProcessStep) => {
    const nextStatus = task.status === "planned" ? "in_progress" : task.status === "in_progress" ? "done" : "planned";
    const completionPercentage = nextStatus === "done" ? 100 : nextStatus === "in_progress" ? 50 : 0;
    updateMutation.mutate({ id: task.id, data: { status: nextStatus, completionPercentage } });
  };

  const handleAddTask = () => {
    if (!newTitle.trim()) return;
    const maxOrder = sortedTasks.length > 0 ? Math.max(...sortedTasks.map(t => t.stepOrder)) : 0;
    createMutation.mutate({
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      priority: newPriority,
      dueDate: newDueDate || undefined,
      stepOrder: maxOrder + 1,
    });
  };

  const statusIcon = (status: string) => {
    if (status === "done") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "in_progress") return <Circle className="h-4 w-4 text-blue-500 fill-blue-500/30" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  const priorityColors: Record<string, "secondary" | "primary" | "warning"> = {
    low: "secondary",
    medium: "primary",
    high: "warning",
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg" data-testid="text-roadmap-title">Roadmap</CardTitle>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Progress value={progressPercent} className="flex-1 min-w-[100px]" data-testid="progress-roadmap" />
              <span className="text-sm text-muted-foreground font-mono" data-testid="text-roadmap-progress">
                {doneTasks.length}/{sortedTasks.length} ({progressPercent}%)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoDetectMutation.mutate()}
              disabled={autoDetectMutation.isPending || sortedTasks.length === 0}
              data-testid="button-auto-detect"
            >
              {autoDetectMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1" />}
              Auto-Detect
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAddTask(true)}
              data-testid="button-add-task"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Task
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedTasks.length === 0 && !showAddTask ? (
            <p className="text-muted-foreground text-sm" data-testid="text-no-tasks">No tasks yet. Add tasks manually or import from a PRD.</p>
          ) : (
            sortedTasks.map((task, idx) => (
              <div
                key={task.id}
                className="rounded-md border bg-card"
                data-testid={`task-item-${task.id}`}
              >
                <div className="flex items-center gap-2 p-3">
                  <button
                    onClick={() => cycleStatus(task)}
                    className="flex-shrink-0"
                    data-testid={`button-cycle-status-${task.id}`}
                    title={`Status: ${task.status} — click to cycle`}
                  >
                    {statusIcon(task.status)}
                  </button>
                  <div className="flex-1 min-w-0">
                    {editingTaskId === task.id ? (
                      <Input
                        autoFocus
                        defaultValue={task.title}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && val !== task.title) {
                            updateMutation.mutate({ id: task.id, data: { title: val } });
                          }
                          setEditingTaskId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditingTaskId(null);
                        }}
                        data-testid={`input-edit-task-title-${task.id}`}
                      />
                    ) : (
                      <span
                        className={`text-sm font-medium cursor-pointer ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}
                        onClick={() => setEditingTaskId(task.id)}
                        data-testid={`text-task-title-${task.id}`}
                      >
                        {task.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                    {task.priority && (
                      <Badge
                        variant={priorityColors[task.priority] || "secondary"}
                        className="text-xs capitalize"
                        data-testid={`badge-priority-${task.id}`}
                      >
                        {task.priority}
                      </Badge>
                    )}
                    {task.dueDate && (
                      <span className="text-xs text-muted-foreground font-mono" data-testid={`text-due-date-${task.id}`}>
                        {format(new Date(task.dueDate), "MMM d")}
                      </span>
                    )}
                    {task.completionPercentage > 0 && task.completionPercentage < 100 && (
                      <span className="text-xs text-muted-foreground font-mono" data-testid={`text-completion-${task.id}`}>
                        {task.completionPercentage}%
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      data-testid={`button-expand-task-${task.id}`}
                    >
                      {expandedTaskId === task.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === 0}
                      onClick={() => moveTask(task.id, "up")}
                      data-testid={`button-move-up-${task.id}`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === sortedTasks.length - 1}
                      onClick={() => moveTask(task.id, "down")}
                      data-testid={`button-move-down-${task.id}`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(task.id)}
                      data-testid={`button-delete-task-${task.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {task.completionPercentage > 0 && task.completionPercentage < 100 && (
                  <div className="px-3 pb-2">
                    <Progress value={task.completionPercentage} className="h-1" />
                  </div>
                )}
                {expandedTaskId === task.id && (
                  <div className="border-t p-3 bg-muted/30 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Textarea
                        defaultValue={task.description || ""}
                        placeholder="Add a description..."
                        className="min-h-[60px] text-sm"
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val !== (task.description || "")) {
                            updateMutation.mutate({ id: task.id, data: { description: val || null } });
                          }
                        }}
                        data-testid={`textarea-task-description-${task.id}`}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Priority</Label>
                        <Select
                          value={task.priority || "medium"}
                          onValueChange={(v) => updateMutation.mutate({ id: task.id, data: { priority: v } })}
                        >
                          <SelectTrigger data-testid={`select-task-priority-${task.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Due Date</Label>
                        <Input
                          type="date"
                          defaultValue={task.dueDate || ""}
                          onChange={(e) => updateMutation.mutate({ id: task.id, data: { dueDate: e.target.value || null } })}
                          data-testid={`input-task-due-date-${task.id}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Completion %</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={task.completionPercentage}
                          onBlur={(e) => {
                            const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                            if (val !== task.completionPercentage) {
                              const newStatus = val >= 100 ? "done" : val > 0 ? "in_progress" : task.status;
                              updateMutation.mutate({ id: task.id, data: { completionPercentage: val, status: newStatus } });
                            }
                          }}
                          data-testid={`input-task-completion-${task.id}`}
                        />
                      </div>
                    </div>
                    {task.autoDetectedStatus && (
                      <div className="rounded-md bg-muted p-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <ScanSearch className="h-3 w-3" />
                          AI Detection:
                        </p>
                        <p className="text-sm mt-1" data-testid={`text-auto-detected-${task.id}`}>{task.autoDetectedStatus}</p>
                        {task.lastAutoChecked && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last checked: {format(new Date(task.lastAutoChecked), "MMM d, yyyy h:mm a")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {showAddTask && (
            <div className="rounded-md border p-3 space-y-3 bg-muted/30" data-testid="form-add-task">
              <Input
                autoFocus
                placeholder="Task title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) handleAddTask(); }}
                data-testid="input-new-task-title"
              />
              <Textarea
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="min-h-[60px] text-sm"
                data-testid="input-new-task-description"
              />
              <div className="grid grid-cols-3 gap-3">
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as any)}>
                  <SelectTrigger data-testid="select-new-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  data-testid="input-new-task-due-date"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddTask}
                    disabled={!newTitle.trim() || createMutation.isPending}
                    className="flex-1"
                    data-testid="button-save-task"
                  >
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowAddTask(false); setNewTitle(""); setNewDescription(""); }}
                    data-testid="button-cancel-task"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Collapsible open={showPrdImport} onOpenChange={setShowPrdImport}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-4 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-lg">Import from PRD</CardTitle>
              </div>
              {showPrdImport ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Paste your PRD, feature list, or requirements document here..."
                value={prdText}
                onChange={(e) => setPrdText(e.target.value)}
                className="min-h-[150px] font-mono text-sm"
                data-testid="textarea-prd-input"
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => generateMutation.mutate(prdText)}
                  disabled={!prdText.trim() || generateMutation.isPending}
                  data-testid="button-generate-tasks"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Tasks
                    </>
                  )}
                </Button>
                {prdText.trim() && (
                  <Button variant="ghost" onClick={() => setPrdText("")} data-testid="button-clear-prd">
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

function DocumentationTab({ 
  projectId,
  clientId,
  documents, 
  agreements 
}: { 
  projectId: number;
  clientId: number;
  documents: Document[]; 
  agreements: ProjectAgreement[];
}) {
  const { toast } = useToast();
  const [isAgreementDialogOpen, setIsAgreementDialogOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const pendingUploadsRef = useRef<Map<string, { objectPath: string; filename: string; contentType: string }>>(new Map());

  const form = useForm({
    resolver: zodResolver(agreementSchema),
    defaultValues: {
      agreementType: "sow" as const,
      title: "",
      signed: false,
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof agreementSchema>) => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/agreements`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Agreement added" });
      setIsAgreementDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add agreement", description: error.message, variant: "destructive" });
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: { filename: string; storagePath: string; mimeType: string; clientId: number; projectId: number; docType: string }) => {
      return apiRequest("POST", "/api/admin/documents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Document uploaded" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save document", description: error.message, variant: "destructive" });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Document deleted" });
    },
  });

  const handleGetUploadParameters = async (file: any) => {
    const res = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type,
      }),
    });
    const { uploadURL, objectPath } = await res.json();
    
    pendingUploadsRef.current.set(file.id, {
      objectPath,
      filename: file.name,
      contentType: file.type,
    });
    
    return {
      method: "PUT" as const,
      url: uploadURL,
      headers: { "Content-Type": file.type },
    };
  };

  const handleUploadComplete = async (result: any) => {
    try {
      for (const file of result.successful || []) {
        const pending = pendingUploadsRef.current.get(file.id);
        if (pending) {
          await createDocumentMutation.mutateAsync({
            filename: pending.filename,
            storagePath: pending.objectPath,
            mimeType: pending.contentType,
            clientId: clientId,
            projectId: projectId,
            docType: "other",
          });
          pendingUploadsRef.current.delete(file.id);
        }
      }
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ProjectAgreement> }) => {
      const res = await apiRequest("PATCH", `/api/admin/agreements/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/agreements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      toast({ title: "Agreement deleted" });
    },
  });

  const typeLabels: Record<string, string> = {
    sow: "SOW",
    msa: "MSA",
    nda: "NDA",
    contract: "Contract",
    other: "Other",
  };

  const docTypeLabels: Record<string, string> = {
    contract: "Contract",
    prd: "PRD",
    brief: "Brief",
    report: "Report",
    other: "Other",
  };

  const docTypeIcons: Record<string, JSX.Element> = {
    contract: <FileCheck className="h-4 w-4" />,
    prd: <FileCode className="h-4 w-4" />,
    brief: <ClipboardList className="h-4 w-4" />,
    report: <FileText className="h-4 w-4" />,
    other: <FileText className="h-4 w-4" />,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Agreements</CardTitle>
            <CardDescription>Contracts, SOWs, and legal documents</CardDescription>
          </div>
          <Dialog open={isAgreementDialogOpen} onOpenChange={setIsAgreementDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-agreement">
                <Plus className="h-4 w-4 mr-1" /> Add Agreement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Agreement</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input {...form.register("title")} placeholder="e.g., Project SOW v1" data-testid="input-agreement-title" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={form.watch("agreementType")}
                    onValueChange={(v) => form.setValue("agreementType", v as any)}
                  >
                    <SelectTrigger data-testid="select-agreement-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sow">SOW</SelectItem>
                      <SelectItem value="msa">MSA</SelectItem>
                      <SelectItem value="nda">NDA</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.watch("signed")}
                    onCheckedChange={(v) => form.setValue("signed", v)}
                    data-testid="switch-signed"
                  />
                  <Label>Signed</Label>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea {...form.register("notes")} placeholder="Optional notes" data-testid="input-agreement-notes" />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-agreement">
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Agreement
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <p className="text-muted-foreground text-sm">No agreements added</p>
          ) : (
            <div className="space-y-2">
              {agreements.map((agreement) => (
                <div
                  key={agreement.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`agreement-${agreement.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FileCheck className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{agreement.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <Badge appearance="stroke" className="text-xs">{typeLabels[agreement.agreementType]}</Badge>
                        {agreement.notes && <span>{agreement.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={agreement.signed}
                        onCheckedChange={(v) => updateMutation.mutate({ id: agreement.id, data: { signed: v } })}
                        data-testid={`switch-signed-${agreement.id}`}
                      />
                      <span className="text-sm">
                        {agreement.signed ? "Signed" : "Unsigned"}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(agreement.id)}
                      data-testid={`button-delete-agreement-${agreement.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Documents</CardTitle>
            <CardDescription>PRDs, briefs, and other project files</CardDescription>
          </div>
          <ObjectUploader
            onGetUploadParameters={handleGetUploadParameters}
            onComplete={handleUploadComplete}
            maxNumberOfFiles={5}
          >
            <Upload className="h-4 w-4 mr-1" /> Upload
          </ObjectUploader>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No documents uploaded</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`document-${doc.id}`}
                >
                  <div className="flex items-center gap-3">
                    {docTypeIcons[doc.docType] || docTypeIcons.other}
                    <div>
                      <p className="font-medium">{doc.filename}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge appearance="stroke" className="text-xs">{docTypeLabels[doc.docType] || doc.docType}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPreviewDoc(doc)}
                      data-testid={`button-view-document-${doc.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => window.open(doc.storagePath, "_blank")}
                      data-testid={`button-download-document-${doc.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteDocumentMutation.mutate(doc.id)}
                      data-testid={`button-delete-document-${doc.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{previewDoc?.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {previewDoc && (
              <DocumentPreview
                storagePath={previewDoc.storagePath}
                filename={previewDoc.filename}
                mimeType={previewDoc.mimeType}
                onDownload={() => window.open(previewDoc.storagePath, "_blank")}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)} data-testid="button-preview-close">
              Close
            </Button>
            <Button onClick={() => window.open(previewDoc?.storagePath, "_blank")} data-testid="button-preview-download">
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
