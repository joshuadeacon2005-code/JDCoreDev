import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Receipt,
  Calendar,
  Building2,
  Briefcase,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Target,
  Trash2,
  Download,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { generateHostingReceiptPDF, generateMilestoneReceiptPDF } from "@/lib/receipt-pdf";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format, parseISO, isAfter, isBefore, startOfDay, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay, isSameMonth } from "date-fns";
import { Link } from "wouter";
import type { HostingInvoice, Client, HostingInvoiceLineItem, Milestone, Project } from "@shared/schema";

type InvoiceWithDetails = HostingInvoice & { 
  client: Client; 
  lineItems: HostingInvoiceLineItem[] 
};

type MilestoneWithDetails = Milestone & {
  project: Project;
  client: Client;
};

type BillingItem = {
  id: string;
  type: "invoice" | "milestone";
  name: string;
  clientName: string;
  clientId?: number;
  projectName?: string;
  projectId?: number;
  amountCents: number;
  dueDate: string | null;
  status: string;
  createdAt: string | Date;
  originalItem: InvoiceWithDetails | MilestoneWithDetails;
};

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getStatusBadge(status: string) {
  switch (status) {
    case "planned":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Planned</Badge>;
    case "pending":
    case "invoiced":
      return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30"><FileText className="h-3 w-3 mr-1" />Invoiced</Badge>;
    case "paid":
      return <Badge className="bg-green-500/20 text-green-600 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
    case "overdue":
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getDueDateStatus(dueDate: string | null, status: string): string {
  if (!dueDate || status === "paid") return "";
  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(dueDate));
  
  if (isBefore(due, today)) {
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return `${daysOverdue} days overdue`;
  } else if (due.getTime() === today.getTime()) {
    return "Due today";
  } else {
    const daysUntil = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return `Due in ${daysUntil} days`;
  }
}

function BillingItemCard({ item, onStatusChange, onDelete, onDownloadReceipt }: { item: BillingItem; onStatusChange: (item: BillingItem, newStatus: string) => void; onDelete?: (item: BillingItem) => void; onDownloadReceipt?: (item: BillingItem) => void }) {
  const dueDateStatus = getDueDateStatus(item.dueDate, item.status);
  const isOverdue = item.dueDate && isBefore(parseISO(item.dueDate), startOfDay(new Date())) && item.status !== "paid";
  
  const milestoneStatuses = ["planned", "invoiced", "paid", "overdue"];
  const invoiceStatuses = ["pending", "paid", "overdue"];
  const statusOptions = item.type === "milestone" ? milestoneStatuses : invoiceStatuses;
  
  return (
    <Card className="hover-elevate" data-testid={`billing-item-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {item.type === "invoice" ? (
                <Receipt className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="font-medium truncate" data-testid={`item-name-${item.id}`}>{item.name}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {item.clientId ? (
                <Link 
                  href={`/admin/clients/${item.clientId}`}
                  className="flex items-center gap-1 hover:text-primary hover:underline"
                  data-testid={`link-client-${item.id}`}
                >
                  <Building2 className="h-3 w-3" />
                  {item.clientName}
                </Link>
              ) : (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {item.clientName}
                </span>
              )}
              {item.projectName && item.projectId && (
                <Link 
                  href={`/admin/projects/${item.projectId}`}
                  className="flex items-center gap-1 hover:text-primary hover:underline"
                  data-testid={`link-project-${item.id}`}
                >
                  <Briefcase className="h-3 w-3" />
                  {item.projectName}
                </Link>
              )}
              {item.projectName && !item.projectId && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {item.projectName}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {item.status === "paid" && onDownloadReceipt && (
              <Button
                variant="ghost"
                size="icon"
                title="Download Receipt"
                data-testid={`receipt-btn-${item.id}`}
                onClick={() => onDownloadReceipt(item)}
              >
                <Download className="h-4 w-4 text-green-600" />
              </Button>
            )}
            <Select 
              value={item.status} 
              onValueChange={(value) => onStatusChange(item, value)}
              data-testid={`status-select-${item.id}`}
            >
              <SelectTrigger className="w-[130px]" data-testid={`status-trigger-${item.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status} data-testid={`status-option-${status}`}>
                    <div className="flex items-center gap-2">
                      {status === "planned" && <Clock className="h-3 w-3" />}
                      {(status === "invoiced" || status === "pending") && <FileText className="h-3 w-3" />}
                      {status === "paid" && <CheckCircle2 className="h-3 w-3" />}
                      {status === "overdue" && <AlertTriangle className="h-3 w-3" />}
                      <span className="capitalize">{status === "pending" ? "Invoiced" : status}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.type === "invoice" && onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`delete-invoice-${item.id}`}>
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete invoice "{item.name}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(item)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <div className="text-right flex-shrink-0 min-w-[100px]">
              <p className="font-semibold text-lg" data-testid={`item-amount-${item.id}`}>
                {formatAmount(item.amountCents)}
              </p>
              {item.dueDate && (
                <p className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {format(parseISO(item.dueDate), "MMM d, yyyy")}
                </p>
              )}
              {dueDateStatus && (
                <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
                  {dueDateStatus}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BillingSection({ title, items, emptyMessage, onStatusChange, onDelete, onDownloadReceipt }: { title: string; items: BillingItem[]; emptyMessage: string; onStatusChange: (item: BillingItem, newStatus: string) => void; onDelete?: (item: BillingItem) => void; onDownloadReceipt?: (item: BillingItem) => void }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }
  
  const totalAmount = items.reduce((sum, item) => sum + item.amountCents, 0);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
        <span className="text-sm font-medium">
          {items.length} item{items.length !== 1 ? "s" : ""} · {formatAmount(totalAmount)}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <BillingItemCard key={item.id} item={item} onStatusChange={onStatusChange} onDelete={onDelete} onDownloadReceipt={onDownloadReceipt} />
        ))}
      </div>
    </div>
  );
}

function PaymentCalendar({ items }: { items: BillingItem[] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);
  
  const prevMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const goToToday = () => setCurrentMonth(new Date());
  
  const getItemsForDate = (date: Date) => {
    return items.filter(item => {
      if (!item.dueDate) return false;
      return isSameDay(parseISO(item.dueDate), date);
    });
  };
  
  const today = startOfDay(new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Payment Calendar</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={prevMonth} data-testid="calendar-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[140px] text-center">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <Button size="icon" variant="ghost" onClick={nextMonth} data-testid="calendar-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={goToToday} data-testid="calendar-today">
              Today
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
          
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          
          {days.map(date => {
            const dayItems = getItemsForDate(date);
            const hasItems = dayItems.length > 0;
            const isToday = isSameDay(date, today);
            const hasOverdue = dayItems.some(item => item.status === "overdue");
            const hasPending = dayItems.some(item => item.status === "invoiced" || item.status === "pending");
            const hasPlanned = dayItems.some(item => item.status === "planned");
            
            return (
              <div
                key={date.toISOString()}
                className={`aspect-square p-1 rounded-md border ${
                  isToday ? "border-teal-500 bg-teal-500/10" : "border-transparent"
                } ${hasItems ? "hover:bg-muted/50" : ""}`}
                data-testid={`calendar-day-${format(date, "yyyy-MM-dd")}`}
              >
                <div className={`text-xs mb-1 ${isToday ? "font-bold text-teal-600" : ""}`}>
                  {format(date, "d")}
                </div>
                {hasItems && (
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 2).map(item => (
                      <div
                        key={item.id}
                        className={`text-[10px] truncate rounded px-1 ${
                          item.status === "overdue" ? "bg-red-500/20 text-red-600" :
                          item.status === "paid" ? "bg-green-500/20 text-green-600" :
                          item.status === "invoiced" || item.status === "pending" ? "bg-amber-500/20 text-amber-600" :
                          "bg-slate-500/20 text-slate-600"
                        }`}
                        title={`${item.name} - ${formatAmount(item.amountCents)}`}
                      >
                        {item.type === "invoice" ? <Receipt className="h-2 w-2 inline mr-0.5" /> : <Target className="h-2 w-2 inline mr-0.5" />}
                        {formatAmount(item.amountCents)}
                      </div>
                    ))}
                    {dayItems.length > 2 && (
                      <div className="text-[10px] text-muted-foreground text-center">
                        +{dayItems.length - 2} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="flex items-center gap-4 mt-4 pt-4 border-t text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-slate-500/20" />
            <span>Planned</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-500/20" />
            <span>Invoiced</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500/20" />
            <span>Overdue</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500/20" />
            <span>Paid</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Receipt className="h-3 w-3" />
            <span>Invoice</span>
          </div>
          <div className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            <span>Milestone</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminInvoices() {
  const { toast } = useToast();

  const { data: invoices, isLoading: loadingInvoices } = useQuery<InvoiceWithDetails[]>({
    queryKey: ["/api/admin/hosting-invoices"],
  });

  const { data: milestones, isLoading: loadingMilestones } = useQuery<MilestoneWithDetails[]>({
    queryKey: ["/api/admin/milestones-with-clients"],
  });

  const updateMilestoneStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PATCH", `/api/admin/milestones/${id}/reminder-status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones-with-clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoiced-milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      toast({
        title: "Status updated",
        description: "Milestone status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update milestone status.",
        variant: "destructive",
      });
    },
  });

  const updateInvoiceStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PATCH", `/api/admin/hosting-invoices/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      toast({
        title: "Status updated",
        description: "Invoice status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update invoice status.",
        variant: "destructive",
      });
    },
  });

  const deleteInvoice = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/hosting-invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      toast({
        title: "Invoice deleted",
        description: "The invoice has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete invoice.",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (item: BillingItem, newStatus: string) => {
    const originalId = parseInt(item.id.split("-")[1]);
    if (item.type === "milestone") {
      updateMilestoneStatus.mutate({ id: originalId, status: newStatus });
    } else {
      updateInvoiceStatus.mutate({ id: originalId, status: newStatus });
    }
  };

  const handleDelete = (item: BillingItem) => {
    if (item.type === "invoice") {
      const originalId = parseInt(item.id.split("-")[1]);
      deleteInvoice.mutate(originalId);
    }
  };

  const handleDownloadReceipt = (item: BillingItem) => {
    try {
      if (item.type === "invoice") {
        generateHostingReceiptPDF(item.originalItem as InvoiceWithDetails);
      } else {
        generateMilestoneReceiptPDF(item.originalItem as MilestoneWithDetails);
      }
    } catch (err) {
      toast({ title: "Failed to generate receipt", variant: "destructive" });
    }
  };

  const isLoading = loadingInvoices || loadingMilestones;

  const allBillingItems: BillingItem[] = [];

  if (invoices) {
    invoices.forEach((invoice) => {
      allBillingItems.push({
        id: `invoice-${invoice.id}`,
        type: "invoice",
        name: invoice.invoiceNumber,
        clientName: invoice.client.name,
        clientId: invoice.client.id,
        amountCents: invoice.totalAmountCents,
        dueDate: invoice.dueDate,
        status: invoice.status,
        createdAt: invoice.createdAt,
        originalItem: invoice,
      });
    });
  }

  if (milestones) {
    milestones.forEach((milestone) => {
      allBillingItems.push({
        id: `milestone-${milestone.id}`,
        type: "milestone",
        name: milestone.name,
        clientName: milestone.client.name,
        clientId: milestone.client.id,
        projectName: milestone.project.name,
        projectId: milestone.project.id,
        amountCents: milestone.amountCents,
        dueDate: milestone.dueDate,
        status: milestone.status,
        createdAt: milestone.createdAt,
        originalItem: milestone,
      });
    });
  }

  const plannedItems = allBillingItems.filter((item) => item.status === "planned");
  const invoicedItems = allBillingItems.filter((item) => item.status === "invoiced" || item.status === "pending");
  const paidItems = allBillingItems.filter((item) => item.status === "paid");
  const overdueItems = allBillingItems.filter((item) => item.status === "overdue");

  const upcomingItems = allBillingItems
    .filter((item) => item.status !== "paid" && item.dueDate)
    .sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const totalOutstanding = [...invoicedItems, ...overdueItems].reduce((sum, item) => sum + item.amountCents, 0);
  const totalPlanned = plannedItems.reduce((sum, item) => sum + item.amountCents, 0);
  const totalPaid = paidItems.reduce((sum, item) => sum + item.amountCents, 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">View all billing items across hosting invoices and payment milestones</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Outstanding</p>
                  <p className="text-xl font-bold" data-testid="total-outstanding">{formatAmount(totalOutstanding)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Planned</p>
                  <p className="text-xl font-bold" data-testid="total-planned">{formatAmount(totalPlanned)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-xl font-bold text-red-600" data-testid="overdue-count">{overdueItems.length} items</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Collected</p>
                  <p className="text-xl font-bold text-green-600" data-testid="total-paid">{formatAmount(totalPaid)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="upcoming" className="space-y-4">
            <TabsList>
              <TabsTrigger value="calendar" data-testid="tab-calendar">
                <Calendar className="h-4 w-4 mr-1" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                Upcoming ({upcomingItems.length})
              </TabsTrigger>
              <TabsTrigger value="overdue" data-testid="tab-overdue">
                Overdue ({overdueItems.length})
              </TabsTrigger>
              <TabsTrigger value="invoiced" data-testid="tab-invoiced">
                Invoiced ({invoicedItems.length})
              </TabsTrigger>
              <TabsTrigger value="planned" data-testid="tab-planned">
                Planned ({plannedItems.length})
              </TabsTrigger>
              <TabsTrigger value="paid" data-testid="tab-paid">
                Paid ({paidItems.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="space-y-4">
              <PaymentCalendar items={allBillingItems} />
            </TabsContent>

            <TabsContent value="upcoming" className="space-y-4">
              <BillingSection 
                title="Upcoming Payments" 
                items={upcomingItems} 
                emptyMessage="No upcoming payments"
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onDownloadReceipt={handleDownloadReceipt}
              />
            </TabsContent>

            <TabsContent value="overdue" className="space-y-4">
              <BillingSection 
                title="Overdue" 
                items={overdueItems} 
                emptyMessage="No overdue items"
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onDownloadReceipt={handleDownloadReceipt}
              />
            </TabsContent>

            <TabsContent value="invoiced" className="space-y-4">
              <BillingSection 
                title="Awaiting Payment" 
                items={invoicedItems} 
                emptyMessage="No invoiced items awaiting payment"
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onDownloadReceipt={handleDownloadReceipt}
              />
            </TabsContent>

            <TabsContent value="planned" className="space-y-4">
              <BillingSection 
                title="Planned" 
                items={plannedItems} 
                emptyMessage="No planned milestones"
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onDownloadReceipt={handleDownloadReceipt}
              />
            </TabsContent>

            <TabsContent value="paid" className="space-y-4">
              <BillingSection 
                title="Paid" 
                items={paidItems} 
                emptyMessage="No paid items yet"
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onDownloadReceipt={handleDownloadReceipt}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}
