import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, Calendar, DollarSign, Building2, FolderOpen, RefreshCw, Power, PowerOff, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { RecurringPaymentWithProject, Project } from "@shared/schema";
import { RecurringPaymentInvoiceModal } from "@/components/RecurringPaymentInvoiceModal";

export default function AdminRecurringPayments() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<RecurringPaymentWithProject | null>(null);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const [formProjectId, setFormProjectId] = useState<string>("");
  const [formAmount, setFormAmount] = useState("");
  const [formPaymentDay, setFormPaymentDay] = useState("1");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formCurrency, setFormCurrency] = useState("USD");

  const { data: payments, isLoading: paymentsLoading } = useQuery<RecurringPaymentWithProject[]>({
    queryKey: ["/api/admin/recurring-payments"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const hostingProjects = projects?.filter(p => p.status === "hosting") || [];

  const createMutation = useMutation({
    mutationFn: async (data: {
      projectId: number;
      paymentDay: number;
      amountCents: number;
      currency: string;
      startDate: string;
      endDate?: string;
      notes?: string;
    }) => {
      const res = await apiRequest("POST", "/api/admin/recurring-payments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recurring-payments"] });
      toast({ title: "Created", description: "Recurring payment schedule created" });
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      paymentDay?: number;
      amountCents?: number;
      isActive?: boolean;
      endDate?: string | null;
      notes?: string | null;
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/recurring-payments/${data.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recurring-payments"] });
      toast({ title: "Updated", description: "Recurring payment updated" });
      setEditingPayment(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/recurring-payments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recurring-payments"] });
      toast({ title: "Deleted", description: "Recurring payment schedule deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormProjectId("");
    setFormAmount("");
    setFormPaymentDay("1");
    setFormStartDate("");
    setFormEndDate("");
    setFormNotes("");
    setFormCurrency("USD");
  };

  const openEditDialog = (payment: RecurringPaymentWithProject) => {
    setEditingPayment(payment);
    setFormAmount((payment.amountCents / 100).toString());
    setFormPaymentDay(payment.paymentDay.toString());
    setFormEndDate(payment.endDate || "");
    setFormNotes(payment.notes || "");
  };

  const handleCreate = () => {
    if (!formProjectId || !formAmount || !formStartDate) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    const amountCents = Math.round(parseFloat(formAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      projectId: parseInt(formProjectId),
      paymentDay: parseInt(formPaymentDay),
      amountCents,
      currency: formCurrency,
      startDate: formStartDate,
      endDate: formEndDate || undefined,
      notes: formNotes || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingPayment || !formAmount) return;
    const amountCents = Math.round(parseFloat(formAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingPayment.id,
      paymentDay: parseInt(formPaymentDay),
      amountCents,
      endDate: formEndDate || null,
      notes: formNotes || null,
    });
  };

  const toggleActive = (payment: RecurringPaymentWithProject) => {
    updateMutation.mutate({
      id: payment.id,
      isActive: !payment.isActive,
    });
  };

  const filteredPayments = payments?.filter(p => {
    if (filterActive === "active") return p.isActive;
    if (filterActive === "inactive") return !p.isActive;
    return true;
  }) || [];

  const totalMonthlyRevenue = payments?.filter(p => p.isActive).reduce((sum, p) => sum + p.amountCents, 0) || 0;

  const formatCurrency = (cents: number, currency: string = "USD") => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  };

  const getOrdinalSuffix = (day: number) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">Recurring Payments</h1>
              <Badge variant="secondary" className="gap-1">
                <RefreshCw className="h-3 w-3" />
                Monthly
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Manage monthly recurring payments for hosted projects
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-recurring-payment">
                <Plus className="h-4 w-4 mr-2" />
                Add Payment Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Recurring Payment</DialogTitle>
                <DialogDescription>
                  Set up a monthly recurring payment for a hosted project
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="project">Project *</Label>
                  <Select value={formProjectId} onValueChange={setFormProjectId}>
                    <SelectTrigger data-testid="select-project">
                      <SelectValue placeholder="Select a hosting project" />
                    </SelectTrigger>
                    <SelectContent>
                      {hostingProjects.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          No projects in "hosting" status
                        </div>
                      ) : (
                        hostingProjects.map(project => (
                          <SelectItem key={project.id} value={project.id.toString()}>
                            {project.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount *</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="99.00"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        className="pl-7"
                        data-testid="input-amount"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentDay">Day of Month *</Label>
                    <Select value={formPaymentDay} onValueChange={setFormPaymentDay}>
                      <SelectTrigger data-testid="select-payment-day">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <SelectItem key={day} value={day.toString()}>
                            {day}{getOrdinalSuffix(day)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date (Optional)</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    data-testid="input-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-create-payment">
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Card className="flex-1 min-w-[200px]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Recurring Revenue</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalMonthlyRevenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button
              variant={filterActive === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterActive("all")}
              data-testid="filter-all"
            >
              All
            </Button>
            <Button
              variant={filterActive === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterActive("active")}
              data-testid="filter-active"
            >
              Active
            </Button>
            <Button
              variant={filterActive === "inactive" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterActive("inactive")}
              data-testid="filter-inactive"
            >
              Inactive
            </Button>
          </div>
        </div>

        {paymentsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredPayments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Recurring Payments</h3>
              <p className="text-muted-foreground text-center mb-4">
                {filterActive !== "all" 
                  ? `No ${filterActive} recurring payments found.`
                  : "Set up recurring payments for projects in hosting status."}
              </p>
              {filterActive === "all" && (
                <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-payment">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Payment Schedule
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPayments.map(payment => (
              <Card key={payment.id} className={!payment.isActive ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate" data-testid={`payment-project-${payment.id}`}>
                        {payment.project.name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {payment.project.client.companyName || payment.project.client.name}
                      </CardDescription>
                    </div>
                    <Badge variant={payment.isActive ? "primary" : "secondary"}>
                      {payment.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary" data-testid={`payment-amount-${payment.id}`}>
                      {formatCurrency(payment.amountCents, payment.currency)}
                    </span>
                    <span className="text-sm text-muted-foreground">/ month</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Charged on the {payment.paymentDay}{getOrdinalSuffix(payment.paymentDay)} of each month</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>Next payment:</span>
                      <span className="font-medium text-foreground">
                        {payment.nextPaymentDate ? format(parseISO(payment.nextPaymentDate), "MMM d, yyyy") : "N/A"}
                      </span>
                    </div>
                    {payment.startDate && (
                      <div className="text-muted-foreground">
                        Started: {format(parseISO(payment.startDate), "MMM d, yyyy")}
                      </div>
                    )}
                    {payment.endDate && (
                      <div className="text-muted-foreground">
                        Ends: {format(parseISO(payment.endDate), "MMM d, yyyy")}
                      </div>
                    )}
                    {payment.notes && (
                      <div className="text-muted-foreground italic mt-2">
                        {payment.notes}
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2 pt-0">
                  <RecurringPaymentInvoiceModal payment={payment} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(payment)}
                    data-testid={`button-toggle-${payment.id}`}
                  >
                    {payment.isActive ? (
                      <>
                        <PowerOff className="h-4 w-4 mr-1" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <Power className="h-4 w-4 mr-1" />
                        Activate
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(payment)}
                    data-testid={`button-edit-${payment.id}`}
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive" data-testid={`button-delete-${payment.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Recurring Payment?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the recurring payment schedule for {payment.project.name}.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(payment.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!editingPayment} onOpenChange={(open) => { if (!open) { setEditingPayment(null); resetForm(); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Recurring Payment</DialogTitle>
              <DialogDescription>
                Update the payment schedule for {editingPayment?.project.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-amount">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="edit-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="pl-7"
                      data-testid="input-edit-amount"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-paymentDay">Day of Month</Label>
                  <Select value={formPaymentDay} onValueChange={setFormPaymentDay}>
                    <SelectTrigger data-testid="select-edit-payment-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <SelectItem key={day} value={day.toString()}>
                          {day}{getOrdinalSuffix(day)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endDate">End Date (Optional)</Label>
                <Input
                  id="edit-endDate"
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  data-testid="input-edit-end-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes (Optional)</Label>
                <Textarea
                  id="edit-notes"
                  placeholder="Any additional notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  data-testid="input-edit-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPayment(null)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-update-payment">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
