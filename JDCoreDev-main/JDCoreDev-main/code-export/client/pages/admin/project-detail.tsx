import { useState, useRef } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Plus, Loader2, FileText, MessageSquare, FileCheck, 
  DollarSign, Calendar, Trash2, Check, Building2, ChevronRight,
  Mail, Phone, Video, FileCode, ClipboardList, Upload, Server,
  CircleDollarSign, TrendingUp
} from "lucide-react";
import { format } from "date-fns";
import type { 
  Project, Client, Milestone, ProjectPrompt, 
  ProjectAgreement, Document, ProjectHistoryEvent, ProjectHostingTerms
} from "@shared/schema";
import { ContractGeneratorModal } from "@/components/ContractGeneratorModal";
import { InvoiceGeneratorModal } from "@/components/InvoiceGeneratorModal";

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
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function HostingMaintenanceSection({ projectId, projectName }: { projectId: number; projectName: string }) {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState("overview");
  
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
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="payment" className="text-xs">Payment</TabsTrigger>
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
});

function PaymentMilestonesSection({ projectId, project, milestones }: { projectId: number; project: ProjectDetailData; milestones: Milestone[] }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      name: "",
      amountCents: 0,
      dueDate: "",
      status: "planned" as const,
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
      form.reset({ name: "", amountCents: 0, dueDate: "", status: "planned" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add milestone", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Milestone> }) => {
      const res = await apiRequest("PATCH", `/api/admin/milestones/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/milestones/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
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
                <div className="flex items-center gap-3">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{milestone.name}</p>
                    {milestone.dueDate && (
                      <p className="text-sm text-muted-foreground">
                        Due {format(new Date(milestone.dueDate), "MMM d, yyyy")}
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
  return (
    <div className="space-y-6">
      <MilestoneProgressCard milestones={project.milestones} />
      
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

        {project.status === "completed" && (
          <HostingMaintenanceSection projectId={projectId} projectName={project.name} />
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
    </div>
  );
}
