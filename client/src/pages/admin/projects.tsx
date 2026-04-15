import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminLayout } from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Briefcase, Loader2, DollarSign, AlertCircle, MoreVertical, Server, CheckCircle, Calendar, Search, LayoutGrid, List, ArrowUpDown, FileText } from "lucide-react";
import { HostingInvoiceGeneratorDialog } from "@/components/HostingInvoiceGeneratorDialog";
import { format } from "date-fns";
import { Link } from "wouter";
import type { Project, Client, Milestone, ProjectHostingTerms } from "@shared/schema";
import { Pencil } from "lucide-react";

const projectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  clientId: z.number({ required_error: "Client is required" }),
  status: z.enum(["lead", "active", "paused", "completed", "hosting"]),
  billingModel: z.enum(["fixed", "retainer", "day_rate"]),
  riskState: z.enum(["on_track", "at_risk", "blocked"]),
});

const hostingTermsSchema = z.object({
  monthlyFeeCents: z.number().min(0, "Amount must be positive"),
  startDate: z.string().min(1, "Start date is required"),
  billingDay: z.number().min(1).max(28, "Billing day must be between 1-28"),
  notes: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;
type HostingTermsFormData = z.infer<typeof hostingTermsSchema>;
type ViewMode = "grid" | "list";
type SortBy = "name" | "date" | "status";

export default function AdminProjects() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHostingDialogOpen, setIsHostingDialogOpen] = useState(false);
  const [hostingProjectId, setHostingProjectId] = useState<number | null>(null);
  const [isEditingHostingTerms, setIsEditingHostingTerms] = useState(false);
  const [activeTab, setActiveTab] = useState("builds");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/admin/clients"],
  });

  const { data: milestones } = useQuery<Milestone[]>({
    queryKey: ["/api/admin/milestones"],
  });

  const { data: editingHostingTerms, isFetching: isLoadingHostingTerms } = useQuery<ProjectHostingTerms | null>({
    queryKey: ["/api/admin/projects", hostingProjectId, "hosting-terms"],
    enabled: isEditingHostingTerms && hostingProjectId !== null,
  });

  const getProjectMilestones = (projectId: number) => {
    return milestones?.filter(m => m.projectId === projectId) || [];
  };

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: { 
      name: "", 
      description: "", 
      status: "lead",
      billingModel: "fixed",
      riskState: "on_track",
    },
  });

  const hostingForm = useForm<HostingTermsFormData>({
    resolver: zodResolver(hostingTermsSchema),
    defaultValues: {
      monthlyFeeCents: 0,
      startDate: new Date().toISOString().split('T')[0],
      billingDay: 1,
      notes: "",
    },
  });

  const editHostingTermsMutation = useMutation({
    mutationFn: async ({ projectId, hostingTerms }: { projectId: number; hostingTerms: HostingTermsFormData }) => {
      await apiRequest("PUT", `/api/admin/projects/${projectId}/hosting-terms`, {
        monthlyFeeCents: hostingTerms.monthlyFeeCents,
        startDate: hostingTerms.startDate,
        invoiceDueDays: hostingTerms.billingDay,
        includedServices: hostingTerms.notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setIsHostingDialogOpen(false);
      setHostingProjectId(null);
      setIsEditingHostingTerms(false);
      hostingForm.reset();
      toast({ 
        title: "Hosting terms updated",
        description: "The hosting terms have been saved successfully"
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update hosting terms", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const res = await apiRequest("POST", "/api/admin/projects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      toast({ title: "Project created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create project", description: error.message, variant: "destructive" });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async ({ projectId, newStatus }: { projectId: number; newStatus: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/projects/${projectId}`, { status: newStatus });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      const labels: Record<string, string> = {
        lead: "Lead", active: "Active", paused: "Paused", completed: "Completed", hosting: "Hosting"
      };
      toast({ 
        title: "Project status updated",
        description: `Project is now ${labels[variables.newStatus] || variables.newStatus}`
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update project", description: error.message, variant: "destructive" });
    },
  });

  const hostingTransferMutation = useMutation({
    mutationFn: async ({ projectId, hostingTerms }: { projectId: number; hostingTerms: HostingTermsFormData }) => {
      await apiRequest("PUT", `/api/admin/projects/${projectId}/hosting-terms`, {
        monthlyFeeCents: hostingTerms.monthlyFeeCents,
        startDate: hostingTerms.startDate,
        invoiceDueDays: hostingTerms.billingDay,
        includedServices: hostingTerms.notes,
        status: "active",
      });
      const res = await apiRequest("PATCH", `/api/admin/projects/${projectId}`, { status: "hosting" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setIsHostingDialogOpen(false);
      setHostingProjectId(null);
      hostingForm.reset();
      setActiveTab("hosting");
      toast({ 
        title: "Transferred to Hosting",
        description: "Project is now in the Hosting tab with billing terms set"
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to transfer project", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: ProjectFormData) => {
    createMutation.mutate(data);
  };

  useEffect(() => {
    if (isEditingHostingTerms && editingHostingTerms) {
      hostingForm.reset({
        monthlyFeeCents: (editingHostingTerms.monthlyFeeCents || 0) / 100,
        startDate: editingHostingTerms.startDate || new Date().toISOString().split('T')[0],
        billingDay: editingHostingTerms.invoiceDueDays || 1,
        notes: editingHostingTerms.includedServices || "",
      });
    }
  }, [isEditingHostingTerms, editingHostingTerms, hostingForm]);

  useEffect(() => {
    if (!isEditingHostingTerms) {
      hostingForm.reset({
        monthlyFeeCents: 0,
        startDate: new Date().toISOString().split('T')[0],
        billingDay: 1,
        notes: "",
      });
    }
  }, [hostingProjectId, isEditingHostingTerms, hostingForm]);

  const stats = useMemo(() => {
    if (!projects) return { lead: 0, active: 0, completed: 0, hosting: 0, total: 0 };
    return {
      lead: projects.filter(p => p.status === "lead").length,
      active: projects.filter(p => p.status === "active").length,
      completed: projects.filter(p => p.status === "completed").length,
      hosting: projects.filter(p => p.status === "hosting").length,
      total: projects.length,
    };
  }, [projects]);

  const filterAndSortProjects = (projectList: Project[]) => {
    let filtered = projectList;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.description?.toLowerCase().includes(q) ||
        clients?.find(c => c.id === p.clientId)?.companyName?.toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "date":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  };

  const buildProjects = filterAndSortProjects(projects?.filter(p => p.status !== "hosting") || []);
  const hostingProjects = filterAndSortProjects(projects?.filter(p => p.status === "hosting") || []);

  const getProjectAccentColor = (project: Project) => {
    switch (project.status) {
      case "lead": return "#3b82f6";
      case "active": return "#10b981";
      case "paused": return "#f59e0b";
      case "completed": return "#8b5cf6";
      case "hosting": return "#6366f1";
      default: return "#6366f1";
    }
  };

  const renderProjectCard = (project: Project, showTransferOptions: boolean = false) => {
    const projectMilestones = getProjectMilestones(project.id);
    const client = clients?.find(c => c.id === project.clientId);
    const totalAmount = projectMilestones.reduce((sum, m) => sum + m.amountCents, 0);
    const paidAmount = projectMilestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);
    const hasOverdue = projectMilestones.some(m => m.status === "overdue");
    const progressPercent = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;
    const accentColor = getProjectAccentColor(project);
    
    if (viewMode === "list") {
      return (
        <Card className="hover-elevate relative" data-testid={`card-project-${project.id}`}>
          <Link href={`/admin/projects/${project.id}`}>
            <div className="flex items-center gap-4 p-4 cursor-pointer">
              <div 
                className="w-1 h-12 rounded-full shrink-0"
                style={{ backgroundColor: accentColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{project.name}</h3>
                  <StatusBadge status={project.status} />
                  {project.status !== "hosting" && <StatusBadge status={project.riskState} />}
                </div>
                {client && (
                  <p className="text-sm text-muted-foreground truncate">{client.companyName || client.name}</p>
                )}
              </div>
              
              {projectMilestones.length > 0 && (
                <div className="hidden md:flex items-center gap-4 shrink-0">
                  <div className="w-32">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ width: `${progressPercent}%`, backgroundColor: accentColor }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">${(paidAmount / 100).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">of ${(totalAmount / 100).toLocaleString()}</p>
                  </div>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground hidden sm:block shrink-0">
                {format(new Date(project.createdAt), "MMM d, yyyy")}
              </p>
              
              {project.status !== "hosting" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                    <Button size="icon" variant="ghost" className="shrink-0" data-testid={`button-transfer-${project.id}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {project.status !== "active" && (
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          transferMutation.mutate({ projectId: project.id, newStatus: "active" });
                        }}
                        data-testid={`menu-set-active-${project.id}`}
                      >
                        <Briefcase className="h-4 w-4 mr-2" />
                        Set as Active
                      </DropdownMenuItem>
                    )}
                    {project.status !== "completed" && (
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          transferMutation.mutate({ projectId: project.id, newStatus: "completed" });
                        }}
                        data-testid={`menu-mark-done-${project.id}`}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Done
                      </DropdownMenuItem>
                    )}
                    {project.status !== "paused" && (
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          transferMutation.mutate({ projectId: project.id, newStatus: "paused" });
                        }}
                        data-testid={`menu-pause-${project.id}`}
                      >
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Pause Project
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setHostingProjectId(project.id);
                        setIsHostingDialogOpen(true);
                      }}
                      data-testid={`menu-transfer-hosting-${project.id}`}
                    >
                      <Server className="h-4 w-4 mr-2" />
                      Transfer to Hosting
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              
              {project.status === "hosting" && (
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="shrink-0" 
                  data-testid={`button-edit-hosting-${project.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setHostingProjectId(project.id);
                    setIsEditingHostingTerms(true);
                    setIsHostingDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Link>
        </Card>
      );
    }

    return (
      <Card className="hover-elevate h-full relative group" data-testid={`card-project-${project.id}`}>
        {project.status !== "hosting" && (
          <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" data-testid={`button-transfer-${project.id}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {project.status !== "active" && (
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      transferMutation.mutate({ projectId: project.id, newStatus: "active" });
                    }}
                    data-testid={`menu-set-active-grid-${project.id}`}
                  >
                    <Briefcase className="h-4 w-4 mr-2" />
                    Set as Active
                  </DropdownMenuItem>
                )}
                {project.status !== "completed" && (
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      transferMutation.mutate({ projectId: project.id, newStatus: "completed" });
                    }}
                    data-testid={`menu-mark-done-grid-${project.id}`}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Done
                  </DropdownMenuItem>
                )}
                {project.status !== "paused" && (
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      transferMutation.mutate({ projectId: project.id, newStatus: "paused" });
                    }}
                    data-testid={`menu-pause-grid-${project.id}`}
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Pause Project
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setHostingProjectId(project.id);
                    setIsHostingDialogOpen(true);
                  }}
                  data-testid={`menu-transfer-hosting-grid-${project.id}`}
                >
                  <Server className="h-4 w-4 mr-2" />
                  Transfer to Hosting
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {project.status === "hosting" && (
          <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button 
              size="icon" 
              variant="ghost" 
              data-testid={`button-edit-hosting-grid-${project.id}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setHostingProjectId(project.id);
                setIsEditingHostingTerms(true);
                setIsHostingDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}
        <Link href={`/admin/projects/${project.id}`}>
          <div className="cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2 pr-8">
                <div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  {client && (
                    <p className="text-sm text-muted-foreground">{client.companyName || client.name}</p>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  <StatusBadge status={project.status} />
                  {project.status !== "hosting" && <StatusBadge status={project.riskState} />}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
              )}
              
              {projectMilestones.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Payment Progress</span>
                    <span className="font-medium">{progressPercent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%`, backgroundColor: accentColor }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <DollarSign className="h-3 w-3" />
                      <span>${(paidAmount / 100).toLocaleString()} / ${(totalAmount / 100).toLocaleString()}</span>
                    </div>
                    {hasOverdue && (
                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3 w-3" />
                        <span>Overdue</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="relative h-5 rounded-md bg-muted overflow-hidden mt-2">
                    <div className="flex h-full">
                      {projectMilestones.map((milestone, index) => {
                        const width = 100 / projectMilestones.length;
                        const statusColors = {
                          planned: "bg-slate-300 dark:bg-slate-600",
                          invoiced: "bg-blue-400 dark:bg-blue-500",
                          paid: "bg-emerald-400 dark:bg-emerald-500",
                          overdue: "bg-red-400 dark:bg-red-500",
                        };
                        return (
                          <div
                            key={milestone.id}
                            className={`h-full ${statusColors[milestone.status]} flex items-center justify-center text-xs font-medium text-white border-r border-background/20 last:border-r-0`}
                            style={{ width: `${width}%` }}
                            title={`${milestone.name}: $${(milestone.amountCents / 100).toLocaleString()} - ${milestone.status}`}
                          >
                            <span className="text-[10px]">{index + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-2 text-center text-xs text-muted-foreground">
                  No milestones yet
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                Created {format(new Date(project.createdAt), "MMM d, yyyy")}
              </p>
            </CardContent>
          </div>
        </Link>
      </Card>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="text-muted-foreground">Manage builds and hosting projects</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-project">
                <Plus className="h-4 w-4 mr-2" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Project</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Project name"
                    {...form.register("name")}
                    data-testid="input-project-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Project description"
                    {...form.register("description")}
                    data-testid="input-project-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select
                    value={form.watch("clientId")?.toString() || ""}
                    onValueChange={(v) => form.setValue("clientId", parseInt(v), { shouldValidate: true })}
                  >
                    <SelectTrigger data-testid="select-project-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((client) => (
                        <SelectItem key={client.id} value={client.id.toString()}>
                          {client.companyName || client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.clientId && (
                    <p className="text-sm text-destructive">{form.formState.errors.clientId.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={form.watch("status")}
                      onValueChange={(v) => form.setValue("status", v as any)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="hosting">Hosting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Billing</Label>
                    <Select
                      value={form.watch("billingModel")}
                      onValueChange={(v) => form.setValue("billingModel", v as any)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="retainer">Retainer</SelectItem>
                        <SelectItem value="day_rate">Day Rate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-project">
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Project
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{stats.active}</span>
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{stats.lead}</span>
              <span className="text-sm text-muted-foreground">Leads</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{stats.hosting}</span>
              <span className="text-sm text-muted-foreground">Hosting</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{stats.total}</span>
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-projects"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-32" data-testid="select-sort-by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              size="icon" 
              variant="outline"
              onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
              data-testid="button-sort-direction"
            >
              <ArrowUpDown className={`h-4 w-4 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />
            </Button>

            <div className="flex rounded-md border">
              <Button
                size="icon"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                className="rounded-r-none border-0"
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                className="rounded-l-none border-0"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="builds" data-testid="tab-builds">
              <Briefcase className="h-4 w-4 mr-2" />
              Builds ({buildProjects.length})
            </TabsTrigger>
            <TabsTrigger value="hosting" data-testid="tab-hosting">
              <Server className="h-4 w-4 mr-2" />
              Hosting ({hostingProjects.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="builds" className="mt-4">
            {isLoading ? (
              <div className={viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-6 w-32 mb-2" />
                      <Skeleton className="h-4 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : buildProjects.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No projects match your search" : "No build projects yet"}
                  </p>
                  {!searchQuery && (
                    <p className="text-sm text-muted-foreground">Create your first project to get started</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className={viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
                {buildProjects.map((project) => renderProjectCard(project, true))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="hosting" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <HostingInvoiceGeneratorDialog
                trigger={
                  <Button variant="outline" data-testid="button-generate-hosting-invoice-global">
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Hosting Invoice
                  </Button>
                }
              />
            </div>
            {isLoading ? (
              <div className={viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-6 w-32 mb-2" />
                      <Skeleton className="h-4 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : hostingProjects.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Server className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No hosting projects match your search" : "No hosting projects yet"}
                  </p>
                  {!searchQuery && (
                    <p className="text-sm text-muted-foreground">Transfer completed projects here for ongoing maintenance</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className={viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
                {hostingProjects.map((project) => renderProjectCard(project, false))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={isHostingDialogOpen} onOpenChange={(open) => {
          setIsHostingDialogOpen(open);
          if (!open) {
            setHostingProjectId(null);
            setIsEditingHostingTerms(false);
            hostingForm.reset();
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isEditingHostingTerms ? <Pencil className="h-5 w-5" /> : <Server className="h-5 w-5" />}
                {isEditingHostingTerms ? "Edit Hosting Terms" : "Transfer to Hosting"}
              </DialogTitle>
              <DialogDescription>
                {isEditingHostingTerms 
                  ? "Update the hosting terms and billing information for this project."
                  : "Set up the hosting terms and billing information for this project."
                }
              </DialogDescription>
            </DialogHeader>
            {isLoadingHostingTerms && isEditingHostingTerms ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
            <form onSubmit={hostingForm.handleSubmit((data) => {
              if (hostingProjectId) {
                if (isEditingHostingTerms) {
                  editHostingTermsMutation.mutate({ projectId: hostingProjectId, hostingTerms: data });
                } else {
                  hostingTransferMutation.mutate({ projectId: hostingProjectId, hostingTerms: data });
                }
              }
            })} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyAmount">Monthly Fee</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="monthlyAmount"
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    className="pl-9"
                    {...hostingForm.register("monthlyFeeCents", { 
                      setValueAs: (v) => Math.round(parseFloat(v || "0") * 100)
                    })}
                    data-testid="input-hosting-monthly-fee"
                  />
                </div>
                {hostingForm.formState.errors.monthlyFeeCents && (
                  <p className="text-sm text-destructive">{hostingForm.formState.errors.monthlyFeeCents.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="startDate"
                    type="date"
                    className="pl-9"
                    {...hostingForm.register("startDate")}
                    data-testid="input-hosting-start-date"
                  />
                </div>
                {hostingForm.formState.errors.startDate && (
                  <p className="text-sm text-destructive">{hostingForm.formState.errors.startDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="billingDay">Billing Day of Month</Label>
                <Select
                  value={hostingForm.watch("billingDay")?.toString() || "1"}
                  onValueChange={(v) => hostingForm.setValue("billingDay", parseInt(v), { shouldValidate: true })}
                >
                  <SelectTrigger data-testid="select-hosting-billing-day">
                    <SelectValue placeholder="Select billing day" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {day === 1 ? "1st" : day === 2 ? "2nd" : day === 3 ? "3rd" : `${day}th`} of each month
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hostingForm.formState.errors.billingDay && (
                  <p className="text-sm text-destructive">{hostingForm.formState.errors.billingDay.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes about the hosting arrangement..."
                  {...hostingForm.register("notes")}
                  data-testid="input-hosting-notes"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsHostingDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isEditingHostingTerms ? editHostingTermsMutation.isPending : hostingTransferMutation.isPending} 
                  data-testid="button-confirm-hosting"
                >
                  {(isEditingHostingTerms ? editHostingTermsMutation.isPending : hostingTransferMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  {isEditingHostingTerms ? "Save Changes" : "Transfer to Hosting"}
                </Button>
              </DialogFooter>
            </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
