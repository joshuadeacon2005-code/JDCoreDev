import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminLayout } from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, DollarSign, Loader2, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { Milestone, Project } from "@shared/schema";

type MilestoneWithProject = Milestone & { project?: Project };

const milestoneSchema = z.object({
  name: z.string().min(1, "Name is required"),
  projectId: z.number({ required_error: "Project is required" }),
  amountCents: z.number().min(0, "Amount must be positive"),
  dueDate: z.string().optional(),
  paidDate: z.string().optional(),
  status: z.enum(["planned", "invoiced", "paid", "overdue"]),
  invoiceRef: z.string().optional(),
});

type MilestoneFormData = z.infer<typeof milestoneSchema>;

export default function AdminMilestones() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<MilestoneWithProject | null>(null);

  const { data: milestones, isLoading } = useQuery<MilestoneWithProject[]>({
    queryKey: ["/api/admin/milestones"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const form = useForm<MilestoneFormData>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: { 
      name: "", 
      amountCents: 0, 
      status: "planned",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: MilestoneFormData) => {
      const res = await apiRequest("POST", "/api/admin/milestones", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
      toast({ title: "Milestone created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create milestone", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<MilestoneFormData> }) => {
      const res = await apiRequest("PATCH", `/api/admin/milestones/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
      toast({ title: "Milestone updated" });
      setEditingMilestone(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update milestone", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/milestones/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
      toast({ title: "Milestone deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete milestone", description: error.message, variant: "destructive" });
    },
  });

  const editForm = useForm<MilestoneFormData>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: { 
      name: "", 
      amountCents: 0, 
      status: "planned",
    },
  });

  const openEditDialog = (milestone: MilestoneWithProject) => {
    setEditingMilestone(milestone);
    editForm.reset({
      name: milestone.name,
      projectId: milestone.projectId,
      amountCents: milestone.amountCents,
      dueDate: milestone.dueDate || "",
      paidDate: milestone.paidDate || "",
      status: milestone.status as any,
      invoiceRef: milestone.invoiceRef || "",
    });
  };

  const onEditSubmit = (data: MilestoneFormData) => {
    if (editingMilestone) {
      updateMutation.mutate({ id: editingMilestone.id, data });
    }
  };

  const onSubmit = (data: MilestoneFormData) => {
    createMutation.mutate(data);
  };

  const totalValue = milestones?.reduce((sum, m) => sum + m.amountCents, 0) || 0;
  const paidAmount = milestones?.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0) || 0;
  const outstanding = totalValue - paidAmount;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Payment Milestones</h1>
            <p className="text-muted-foreground">Track payment milestones and invoices</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-milestone">
                <Plus className="h-4 w-4 mr-2" /> Add Milestone
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Milestone</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Milestone name"
                    {...form.register("name")}
                    data-testid="input-milestone-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select
                    value={form.watch("projectId")?.toString()}
                    onValueChange={(v) => form.setValue("projectId", parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-milestone-project">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map((project) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    onChange={(e) => form.setValue("amountCents", Math.round(parseFloat(e.target.value || "0") * 100))}
                    data-testid="input-milestone-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    {...form.register("dueDate")}
                    data-testid="input-milestone-date"
                  />
                </div>
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
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="invoiced">Invoiced</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.watch("status") === "paid" && (
                  <div className="space-y-2">
                    <Label htmlFor="paidDate">Paid Date</Label>
                    <Input
                      id="paidDate"
                      type="date"
                      {...form.register("paidDate")}
                      data-testid="input-milestone-paid-date"
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Milestone
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-2xl font-semibold" data-testid="stat-total-value">
                ${(totalValue / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Paid</p>
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400" data-testid="stat-paid">
                ${(paidAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Outstanding</p>
              <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400" data-testid="stat-outstanding">
                ${(outstanding / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : milestones?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <DollarSign className="h-12 w-12 mb-4 opacity-50" />
                <p>No milestones yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {milestones?.map((milestone) => (
                  <div 
                    key={milestone.id} 
                    className="flex items-center justify-between gap-4 p-4 rounded-lg bg-muted/50"
                    data-testid={`milestone-${milestone.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{milestone.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {milestone.project?.name || "Unknown project"}
                        {milestone.dueDate && ` - Due ${format(new Date(milestone.dueDate), "MMM d, yyyy")}`}
                        {milestone.paidDate && ` - Paid ${format(new Date(milestone.paidDate), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-mono font-medium">
                        ${(milestone.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                      <StatusBadge status={milestone.status} />
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => openEditDialog(milestone)}
                        data-testid={`button-edit-milestone-${milestone.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this milestone?")) {
                            deleteMutation.mutate(milestone.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-milestone-${milestone.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editingMilestone} onOpenChange={(open) => !open && setEditingMilestone(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Milestone</DialogTitle>
            </DialogHeader>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  placeholder="Milestone name"
                  {...editForm.register("name")}
                  data-testid="input-edit-milestone-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={editForm.watch("projectId")?.toString()}
                  onValueChange={(v) => editForm.setValue("projectId", parseInt(v))}
                >
                  <SelectTrigger data-testid="select-edit-milestone-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-amount">Amount ($)</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={(editForm.watch("amountCents") / 100).toFixed(2)}
                  onChange={(e) => editForm.setValue("amountCents", Math.round(parseFloat(e.target.value || "0") * 100))}
                  data-testid="input-edit-milestone-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dueDate">Due Date</Label>
                <Input
                  id="edit-dueDate"
                  type="date"
                  {...editForm.register("dueDate")}
                  data-testid="input-edit-milestone-due-date"
                />
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
              {editForm.watch("status") === "paid" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-paidDate">Paid Date</Label>
                  <Input
                    id="edit-paidDate"
                    type="date"
                    {...editForm.register("paidDate")}
                    data-testid="input-edit-milestone-paid-date"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-invoiceRef">Invoice Reference</Label>
                <Input
                  id="edit-invoiceRef"
                  placeholder="Invoice #"
                  {...editForm.register("invoiceRef")}
                  data-testid="input-edit-milestone-invoice-ref"
                />
              </div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
