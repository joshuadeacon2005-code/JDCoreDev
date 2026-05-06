import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Mail, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Send,
  XCircle,
  Building2,
  Eye,
  FileText,
  Briefcase,
  TestTube,
  Ban,
  Calendar,
  Trash2,
  Undo2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { format, addDays, parseISO, isAfter, isToday, isBefore, startOfDay } from "date-fns";
import type { HostingInvoice, Client, HostingInvoiceLineItem, Milestone, Project } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InvoiceWithDetails = HostingInvoice & { 
  client: Client; 
  lineItems: HostingInvoiceLineItem[] 
};

type MilestoneWithDetails = Milestone & {
  project: Project;
  client: Client;
};

const REMINDER_SCHEDULE = [
  { reminderNum: 1, daysFromDue: -3, label: "3 days before due" },
  { reminderNum: 2, daysFromDue: 0, label: "On due date" },
  { reminderNum: 3, daysFromDue: 3, label: "3 days overdue" },
  { reminderNum: 4, daysFromDue: 7, label: "7 days overdue" },
  { reminderNum: 5, daysFromDue: 14, label: "14 days overdue" },
];

function getScheduledDate(dueDate: string | null, daysFromDue: number): Date | null {
  if (!dueDate) return null;
  return addDays(parseISO(dueDate), daysFromDue);
}

function getReminderStatus(
  reminderNum: number, 
  reminderCount: number, 
  dueDate: string | null,
  cancelledReminders: number[] = []
) {
  if (!dueDate) return { status: "no_date", label: "No due date" };
  
  if (cancelledReminders.includes(reminderNum)) {
    return { status: "cancelled", label: "Cancelled" };
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduledDate = getScheduledDate(dueDate, REMINDER_SCHEDULE[reminderNum - 1].daysFromDue);
  
  if (!scheduledDate) return { status: "unknown", label: "Unknown" };
  
  if (reminderNum <= reminderCount) {
    return { status: "sent", label: "Sent" };
  }
  
  if (today >= scheduledDate) {
    return { status: "pending", label: "Due to send" };
  }
  
  return { status: "scheduled", label: "Scheduled" };
}

function getStatusBadge(status: string) {
  switch (status) {
    case "paid":
      return <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
    case "pending":
    case "planned":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case "invoiced":
      return <Badge variant="info"><FileText className="h-3 w-3 mr-1" />Invoiced</Badge>;
    case "overdue":
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    case "cancelled":
      return <Badge variant="mono"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getScheduleTimeLabel(scheduledDate: Date | null, isPending: boolean): string {
  if (!scheduledDate) return "";
  const today = startOfDay(new Date());
  const scheduleDay = startOfDay(scheduledDate);
  
  if (isPending) {
    if (isBefore(scheduleDay, today) || scheduleDay.getTime() === today.getTime()) {
      return "Sending today";
    }
    return `Scheduled: ${format(scheduledDate, "MMM d, yyyy")}`;
  }
  return format(scheduledDate, "MMM d, yyyy");
}

function ReminderTimeline({ 
  reminderCount, 
  dueDate, 
  isPaidOrCancelled,
  cancelledReminders = [],
  onCancelReminder,
  onUncancelReminder,
  isCancelling,
  isUncancelling
}: { 
  reminderCount: number; 
  dueDate: string | null; 
  isPaidOrCancelled: boolean;
  cancelledReminders?: number[];
  onCancelReminder?: (reminderNum: number) => void;
  onUncancelReminder?: (reminderNum: number) => void;
  isCancelling?: boolean;
  isUncancelling?: boolean;
}) {
  return (
    <div className="space-y-2 mt-4">
      <p className="text-sm font-medium text-muted-foreground mb-3">Email Reminders</p>
      <div className="space-y-1.5">
        {REMINDER_SCHEDULE.map((schedule) => {
          const { status } = getReminderStatus(
            schedule.reminderNum, 
            reminderCount, 
            dueDate,
            cancelledReminders
          );
          
          const scheduledDate = dueDate ? getScheduledDate(dueDate, schedule.daysFromDue) : null;
          const isSent = status === "sent";
          const isPending = status === "pending" && !isPaidOrCancelled;
          const isIndividuallyCancelled = cancelledReminders.includes(schedule.reminderNum);
          const isFullyCancelled = (isPaidOrCancelled && !isSent) || isIndividuallyCancelled;
          const canCancel = !isSent && !isIndividuallyCancelled && !isPaidOrCancelled && onCancelReminder;
          const timeLabel = getScheduleTimeLabel(scheduledDate, isPending);
          
          // Check if this reminder is due today or overdue
          const isDueNow = scheduledDate && isPending && 
            (isToday(scheduledDate) || isBefore(scheduledDate, new Date()));
          
          return (
            <div 
              key={schedule.reminderNum}
              className={`flex items-center gap-3 text-sm px-3 py-2 rounded-md ${
                isSent 
                  ? "bg-green-500/10 text-green-600 dark:text-green-400" 
                  : isDueNow
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  : isPending
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : isFullyCancelled
                  ? "bg-muted/30 text-muted-foreground"
                  : "bg-muted/20 text-muted-foreground"
              }`}
              data-testid={`reminder-${schedule.reminderNum}-status`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                isSent 
                  ? "bg-green-500/20" 
                  : isDueNow
                  ? "bg-blue-500/20"
                  : isPending 
                  ? "bg-amber-500/20" 
                  : "bg-muted/30"
              }`}>
                {isSent ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : isDueNow ? (
                  <Clock className="h-3 w-3" />
                ) : isPending ? (
                  <Send className="h-3 w-3" />
                ) : isFullyCancelled ? (
                  <XCircle className="h-3 w-3" />
                ) : (
                  <Mail className="h-3 w-3" />
                )}
              </div>
              <div className={`flex-1 ${isIndividuallyCancelled ? "line-through" : ""}`}>
                <span className="font-medium">#{schedule.reminderNum}</span>
                <span className="mx-1">·</span>
                <span>{schedule.label}</span>
                {timeLabel && (
                  <>
                    <span className="mx-1">·</span>
                    <span className={`text-xs ${isDueNow ? "font-medium" : "opacity-75"}`}>
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {timeLabel}
                    </span>
                  </>
                )}
              </div>
              {isSent && (
                <Badge variant="secondary" className="text-xs">Sent</Badge>
              )}
              {isDueNow && (
                <Badge className="text-xs bg-blue-500/20 text-blue-600 border-blue-500/30">Due Now</Badge>
              )}
              {isPending && !isDueNow && (
                <Badge className="text-xs bg-amber-500/20 text-amber-600 border-amber-500/30">Scheduled</Badge>
              )}
              {isIndividuallyCancelled && (
                <>
                  <Badge variant="mono" className="text-xs">Cancelled</Badge>
                  {onUncancelReminder && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => onUncancelReminder(schedule.reminderNum)}
                      disabled={isUncancelling}
                      title="Restore reminder"
                      data-testid={`uncancel-reminder-${schedule.reminderNum}`}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
              {canCancel && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => onCancelReminder(schedule.reminderNum)}
                  disabled={isCancelling}
                  title="Cancel reminder"
                  data-testid={`cancel-reminder-${schedule.reminderNum}`}
                >
                  <Ban className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmailPreviewDialog({ 
  type, 
  id, 
  name,
  mode = "preview",
  onSend,
  isSending,
  disabled,
}: { 
  type: "hosting-invoice" | "milestone"; 
  id: number; 
  name: string;
  mode?: "preview" | "send";
  onSend?: (id: number) => void;
  isSending?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: preview, isLoading } = useQuery<{
    subject: string;
    clientName: string;
    recipientEmail?: string;
    invoiceNumber?: string;
    projectName?: string;
    milestoneName?: string;
    amount: string;
    dueDate: string;
    isOverdue: boolean;
    daysOverdue?: number;
    reminderCount: number;
  }>({
    queryKey: ["/api/admin/email-preview", type, id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/email-preview/${type}/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch preview");
      return res.json();
    },
    enabled: open,
  });

  const handleSend = () => {
    if (onSend) {
      onSend(id);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "send" ? (
          <Button 
            variant="default" 
            size="sm" 
            disabled={disabled}
            data-testid={`send-now-${type}-${id}`}
          >
            <Send className="h-4 w-4 mr-1" />
            Send Now
          </Button>
        ) : (
          <Button variant="ghost" size="icon" data-testid={`preview-email-${type}-${id}`}>
            <Eye className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "send" ? "Send Reminder" : "Email Preview"}: {name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {preview.recipientEmail && (
              <div className="bg-muted/30 rounded-lg p-4 flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Sending to</p>
                  <p className="font-medium">{preview.recipientEmail}</p>
                  {preview.clientName && <p className="text-sm text-muted-foreground">{preview.clientName}</p>}
                </div>
              </div>
            )}

            {preview.isOverdue && preview.daysOverdue !== undefined && preview.daysOverdue > 0 && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <div>
                  <p className="font-semibold text-red-700 dark:text-red-400">{preview.daysOverdue} day{preview.daysOverdue !== 1 ? 's' : ''} overdue</p>
                  <p className="text-sm text-red-600 dark:text-red-400/80">Due date was {preview.dueDate}</p>
                </div>
              </div>
            )}

            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Subject</p>
              <p className="font-medium">{preview.subject}</p>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <div style={{ background: "linear-gradient(135deg, #008080 0%, #006666 100%)", padding: "24px" }}>
                <h2 className="text-white text-xl font-bold m-0">JD CoreDev</h2>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-900 p-6">
                <h3 className="text-lg font-semibold mb-4">
                  {preview.isOverdue ? "Payment Overdue" : "Payment Reminder"}
                </h3>
                
                <p className="mb-4">Dear {preview.clientName},</p>
                
                <p className="mb-4">
                  {preview.isOverdue 
                    ? `This ${type === "milestone" ? "payment" : "invoice"} was due on ${preview.dueDate} and is now overdue.`
                    : `This ${type === "milestone" ? "payment" : "invoice"} is due on ${preview.dueDate}.`
                  }
                  {preview.reminderCount > 0 && ` This is reminder #${preview.reminderCount + 1}.`}
                </p>
                
                <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 my-4">
                  <table className="w-full">
                    <tbody>
                      {preview.invoiceNumber && (
                        <tr>
                          <td className="py-2 text-muted-foreground">Invoice Number:</td>
                          <td className="py-2 text-right font-semibold">{preview.invoiceNumber}</td>
                        </tr>
                      )}
                      {preview.milestoneName && (
                        <tr>
                          <td className="py-2 text-muted-foreground">Milestone:</td>
                          <td className="py-2 text-right font-semibold">{preview.milestoneName}</td>
                        </tr>
                      )}
                      {preview.projectName && (
                        <tr>
                          <td className="py-2 text-muted-foreground">Project:</td>
                          <td className="py-2 text-right font-semibold">{preview.projectName}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-2 text-muted-foreground">Amount Due:</td>
                        <td className={`py-2 text-right font-semibold text-lg ${preview.isOverdue ? "text-red-500" : "text-teal-600"}`}>
                          {preview.amount}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-muted-foreground">Due Date:</td>
                        <td className={`py-2 text-right ${preview.isOverdue ? "text-red-500" : ""}`}>
                          {preview.dueDate}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <p className="mb-4">
                  Please ensure payment is made at your earliest convenience to avoid any service interruptions.
                </p>
                
                <p className="text-muted-foreground text-sm">
                  If you have already made this payment, please disregard this reminder or contact us to confirm receipt.
                </p>
                
                <p className="mt-6">
                  Best regards,<br />
                  <strong>JD CoreDev</strong>
                </p>
              </div>
            </div>

            {mode === "send" && (
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)} data-testid={`email-preview-cancel-${type}-${id}`}>Cancel</Button>
                <Button onClick={handleSend} disabled={isSending} data-testid={`confirm-send-${type}-${id}`}>
                  <Send className="h-4 w-4 mr-2" />
                  {isSending ? "Sending..." : `Send to ${preview.recipientEmail || "client"}`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">Unable to load email preview.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HostingInvoiceBreakdown({
  invoice,
  formatAmount,
}: {
  invoice: InvoiceWithDetails;
  formatAmount: (cents: number) => string;
}) {
  const [open, setOpen] = useState(false);
  if (invoice.lineItems.length === 0) return null;
  const lineSum = invoice.lineItems.reduce((s, li) => s + li.amountCents, 0);
  const itemWord = invoice.lineItems.length === 1 ? "item" : "items";
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider mb-2 hover:text-foreground transition-colors"
        data-testid={`toggle-breakdown-${invoice.id}`}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Breakdown ({invoice.lineItems.length} {itemWord})
      </button>
      {open && (
        <>
          <div className="space-y-1 rounded-md border border-border/50 divide-y divide-border/40">
            {invoice.lineItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{item.projectName}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <span className="font-mono text-sm shrink-0">
                  {formatAmount(item.amountCents)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-muted/30">
              <span className="font-semibold">Total</span>
              <span className="font-mono font-semibold">{formatAmount(invoice.totalAmountCents)}</span>
            </div>
          </div>
          {lineSum !== invoice.totalAmountCents && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              ⚠ Line items sum to {formatAmount(lineSum)} — does not match invoice total.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminInvoiceReminders() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("hosting");
  const [showPaidInvoices, setShowPaidInvoices] = useState(false);

  const { data: invoices, isLoading: loadingInvoices } = useQuery<InvoiceWithDetails[]>({
    queryKey: ["/api/admin/hosting-invoices"],
  });

  const { data: milestones, isLoading: loadingMilestones } = useQuery<MilestoneWithDetails[]>({
    queryKey: ["/api/admin/invoiced-milestones"],
  });

  const updateInvoiceStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/hosting-invoices/${id}`, { status });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      if (variables.status === "paid") {
        toast({ 
          title: "Invoice marked as paid", 
          description: "Remaining email reminders have been cancelled" 
        });
      } else {
        toast({ title: "Status updated" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMilestoneStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/milestones/${id}/reminder-status`, { status });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoiced-milestones"] });
      if (variables.status === "paid") {
        toast({ 
          title: "Milestone marked as paid", 
          description: "Remaining email reminders have been cancelled" 
        });
      } else {
        toast({ title: "Status updated" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelInvoiceReminderMutation = useMutation({
    mutationFn: async ({ id, reminderNum }: { id: number; reminderNum: number }) => {
      const res = await apiRequest("POST", `/api/admin/hosting-invoices/${id}/cancel-reminder`, { reminderNum });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      toast({ title: "Reminder cancelled" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelMilestoneReminderMutation = useMutation({
    mutationFn: async ({ id, reminderNum }: { id: number; reminderNum: number }) => {
      const res = await apiRequest("POST", `/api/admin/milestones/${id}/cancel-reminder`, { reminderNum });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoiced-milestones"] });
      toast({ title: "Reminder cancelled" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const recalculateInvoiceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/hosting-invoices/${id}/recalculate`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      const prev = (data.previousTotalCents / 100).toFixed(2);
      const next = (data.newTotalCents / 100).toFixed(2);
      const delta = (data.delta / 100).toFixed(2);
      toast({
        title: "Invoice recalculated",
        description: `${data.invoiceNumber}: $${prev} → $${next} (Δ ${data.delta >= 0 ? "+" : ""}$${delta})`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Recalculation failed", description: error.message, variant: "destructive" });
    },
  });

  const recalculateAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/hosting-invoices/recalculate-all", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      const changed = (data.results || []).filter((r: any) => r.delta !== undefined && r.delta !== 0).length;
      toast({
        title: `Recalculated ${data.ok} invoice(s)`,
        description: `${changed} changed total · ${data.errors || 0} errors · paid/cancelled skipped`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk recalculate failed", description: error.message, variant: "destructive" });
    },
  });

  const uncancelInvoiceReminderMutation = useMutation({
    mutationFn: async ({ id, reminderNum }: { id: number; reminderNum: number }) => {
      const res = await apiRequest("POST", `/api/admin/hosting-invoices/${id}/uncancel-reminder`, { reminderNum });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      toast({ title: "Reminder restored" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const uncancelMilestoneReminderMutation = useMutation({
    mutationFn: async ({ id, reminderNum }: { id: number; reminderNum: number }) => {
      const res = await apiRequest("POST", `/api/admin/milestones/${id}/uncancel-reminder`, { reminderNum });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoiced-milestones"] });
      toast({ title: "Reminder restored" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendTestInvoiceEmailMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/hosting-invoices/${id}/test-email`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Test email sent", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendNowInvoiceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/hosting-invoices/${id}/send-now`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Reminder sent", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-preview"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendNowMilestoneMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/milestones/${id}/send-now`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Reminder sent", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoiced-milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-preview"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendTestMilestoneEmailMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/milestones/${id}/test-email`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Test email sent", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/hosting-invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      toast({ title: "Invoice deleted", description: "The invoice has been deleted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const activeInvoices = invoices?.filter(inv => inv.status !== "cancelled" && inv.status !== "paid") || [];
  const paidInvoices   = invoices?.filter(inv => inv.status === "paid") || [];
  const filteredMilestones = milestones || [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Invoice Reminders</h1>
            <p className="text-muted-foreground">
              Track email reminders for invoices and payment milestones. Reminders are automatically cancelled when marked as paid.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Recalculate ALL non-paid hosting invoices using the current combined-budget logic? This replaces line items + total on each. Paid/cancelled invoices are skipped.")) {
                recalculateAllMutation.mutate();
              }
            }}
            disabled={recalculateAllMutation.isPending}
            className="text-xs"
            data-testid="button-recalc-all"
          >
            ↻ Recalculate ALL invoices
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="hosting" data-testid="tab-hosting-invoices">
              <FileText className="h-4 w-4 mr-2" />
              Hosting Invoices ({activeInvoices.length})
            </TabsTrigger>
            <TabsTrigger value="milestones" data-testid="tab-milestones">
              <Briefcase className="h-4 w-4 mr-2" />
              Payment Milestones ({filteredMilestones.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hosting" className="mt-6">
            {loadingInvoices ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-32 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {activeInvoices.map((invoice) => (
                  <Card key={invoice.id} data-testid={`invoice-card-${invoice.id}`}>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-2 flex-wrap">
                            <span data-testid={`invoice-number-${invoice.id}`}>{invoice.invoiceNumber}</span>
                            {getStatusBadge(invoice.status)}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 flex-wrap">
                            <Building2 className="h-3.5 w-3.5" />
                            <span data-testid={`invoice-client-${invoice.id}`}>{invoice.client.name}</span>
                            {(invoice.client.accountsDeptEmail || invoice.client.email) && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <Mail className="h-3.5 w-3.5" />
                                <span className="text-xs">
                                  {invoice.client.accountsDeptEmail || invoice.client.email}
                                  {invoice.client.accountsDeptEmail && invoice.client.accountsDeptName && (
                                    <span className="text-muted-foreground"> ({invoice.client.accountsDeptName})</span>
                                  )}
                                </span>
                              </>
                            )}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => recalculateInvoiceMutation.mutate(invoice.id)}
                            disabled={recalculateInvoiceMutation.isPending}
                            data-testid={`recalculate-invoice-${invoice.id}`}
                            title="Re-run combined-budget overage calc; replaces line items + total"
                          >
                            ↻ Recalc
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendTestInvoiceEmailMutation.mutate(invoice.id)}
                            disabled={sendTestInvoiceEmailMutation.isPending}
                            data-testid={`test-email-invoice-${invoice.id}`}
                          >
                            <TestTube className="h-4 w-4 mr-1" />
                            Test
                          </Button>
                          <EmailPreviewDialog 
                            type="hosting-invoice" 
                            id={invoice.id} 
                            name={invoice.invoiceNumber}
                            mode="send"
                            onSend={(id) => sendNowInvoiceMutation.mutate(id)}
                            isSending={sendNowInvoiceMutation.isPending}
                            disabled={sendNowInvoiceMutation.isPending || invoice.status === "paid"}
                          />
                          <EmailPreviewDialog 
                            type="hosting-invoice" 
                            id={invoice.id} 
                            name={invoice.invoiceNumber}
                          />
                          <Select
                            value={invoice.status}
                            onValueChange={(value) => updateInvoiceStatusMutation.mutate({ id: invoice.id, status: value })}
                            disabled={updateInvoiceStatusMutation.isPending}
                          >
                            <SelectTrigger className="w-32" data-testid={`status-select-${invoice.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3 w-3" />
                                  <span>Invoiced</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="paid">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span>Paid</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="overdue">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>Overdue</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`delete-invoice-${invoice.id}`}>
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete invoice "{invoice.invoiceNumber}"? This will also remove all associated reminder data. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteInvoiceMutation.mutate(invoice.id)} 
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">Amount</p>
                          <p className="text-lg font-semibold" data-testid={`invoice-amount-${invoice.id}`}>
                            {formatAmount(invoice.totalAmountCents)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">Invoice Date</p>
                          <p className="font-medium">
                            {format(parseISO(invoice.invoiceDate), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</p>
                          <p className={`font-medium ${
                            isAfter(new Date(), parseISO(invoice.dueDate)) && invoice.status !== "paid" 
                              ? "text-red-500" 
                              : ""
                          }`}>
                            {format(parseISO(invoice.dueDate), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>

                      <HostingInvoiceBreakdown invoice={invoice} formatAmount={formatAmount} />

                      <ReminderTimeline 
                        reminderCount={invoice.reminderCount}
                        dueDate={invoice.dueDate}
                        isPaidOrCancelled={invoice.status === "paid" || invoice.status === "cancelled"}
                        cancelledReminders={invoice.cancelledReminders || []}
                        onCancelReminder={(reminderNum) => 
                          cancelInvoiceReminderMutation.mutate({ id: invoice.id, reminderNum })
                        }
                        onUncancelReminder={(reminderNum) => 
                          uncancelInvoiceReminderMutation.mutate({ id: invoice.id, reminderNum })
                        }
                        isCancelling={cancelInvoiceReminderMutation.isPending}
                        isUncancelling={uncancelInvoiceReminderMutation.isPending}
                      />
                      
                      {invoice.lastReminderSent && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Last reminder sent: {format(new Date(invoice.lastReminderSent), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {activeInvoices.length === 0 && paidInvoices.length === 0 && (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No active hosting invoices</h3>
                      <p className="text-muted-foreground">
                        Create hosting invoices from client pages to see their reminder status here.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {activeInvoices.length === 0 && paidInvoices.length === 0 ? null : paidInvoices.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowPaidInvoices(v => !v)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-1 w-full text-left"
                    >
                      {showPaidInvoices
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />
                      }
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-medium">Completed / Paid ({paidInvoices.length})</span>
                      <span className="text-xs text-muted-foreground/60">— click to {showPaidInvoices ? "hide" : "view"}</span>
                    </button>
                    {showPaidInvoices && (
                      <div className="space-y-3 mt-2">
                        {paidInvoices.map((invoice) => (
                          <Card key={invoice.id} className="border-emerald-500/20 bg-emerald-500/5 opacity-80">
                            <CardHeader className="pb-2 pt-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <CardTitle className="flex items-center gap-2 text-sm flex-wrap">
                                    <span>{invoice.invoiceNumber}</span>
                                    <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-xs">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />Paid
                                    </Badge>
                                  </CardTitle>
                                  <CardDescription className="flex items-center gap-2 flex-wrap text-xs">
                                    <Building2 className="h-3 w-3" />
                                    {invoice.client.name}
                                    <span className="text-muted-foreground">·</span>
                                    <span>{formatAmount(invoice.totalAmountCents)}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span>Due {format(parseISO(invoice.dueDate), "MMM d, yyyy")}</span>
                                    {invoice.lineItems.length > 0 && (
                                      <>
                                        <span className="text-muted-foreground">·</span>
                                        <span>{invoice.lineItems.map(li => li.projectName).join(", ")}</span>
                                      </>
                                    )}
                                  </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => updateInvoiceStatusMutation.mutate({ id: invoice.id, status: "pending" })}
                                    disabled={updateInvoiceStatusMutation.isPending}
                                  >
                                    <Undo2 className="h-3 w-3 mr-1" />Reopen
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Delete invoice "{invoice.invoiceNumber}"? This cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteInvoiceMutation.mutate(invoice.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            </CardHeader>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="milestones" className="mt-6">
            {loadingMilestones ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-32 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredMilestones.length > 0 ? (
              <div className="space-y-4">
                {filteredMilestones.map((milestone) => (
                  <Card key={milestone.id} data-testid={`milestone-card-${milestone.id}`}>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-2 flex-wrap">
                            <span data-testid={`milestone-name-${milestone.id}`}>{milestone.name}</span>
                            {getStatusBadge(milestone.status)}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 flex-wrap">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>{milestone.client.name}</span>
                            {(milestone.client.accountsDeptEmail || milestone.client.email) && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <Mail className="h-3.5 w-3.5" />
                                <span className="text-xs">
                                  {milestone.client.accountsDeptEmail || milestone.client.email}
                                  {milestone.client.accountsDeptEmail && milestone.client.accountsDeptName && (
                                    <span className="text-muted-foreground"> ({milestone.client.accountsDeptName})</span>
                                  )}
                                </span>
                              </>
                            )}
                            <span className="text-muted-foreground">·</span>
                            <Briefcase className="h-3.5 w-3.5" />
                            <span>{milestone.project.name}</span>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendTestMilestoneEmailMutation.mutate(milestone.id)}
                            disabled={sendTestMilestoneEmailMutation.isPending}
                            data-testid={`test-email-milestone-${milestone.id}`}
                          >
                            <TestTube className="h-4 w-4 mr-1" />
                            Test
                          </Button>
                          <EmailPreviewDialog 
                            type="milestone" 
                            id={milestone.id} 
                            name={milestone.name}
                            mode="send"
                            onSend={(id) => sendNowMilestoneMutation.mutate(id)}
                            isSending={sendNowMilestoneMutation.isPending}
                            disabled={sendNowMilestoneMutation.isPending || milestone.status === "paid"}
                          />
                          <EmailPreviewDialog 
                            type="milestone" 
                            id={milestone.id} 
                            name={milestone.name}
                          />
                          <Select
                            value={milestone.status}
                            onValueChange={(value) => updateMilestoneStatusMutation.mutate({ id: milestone.id, status: value })}
                            disabled={updateMilestoneStatusMutation.isPending}
                          >
                            <SelectTrigger className="w-32" data-testid={`milestone-status-select-${milestone.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="invoiced">Invoiced</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                              <SelectItem value="overdue">Overdue</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">Amount</p>
                          <p className="text-lg font-semibold" data-testid={`milestone-amount-${milestone.id}`}>
                            {formatAmount(milestone.amountCents)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</p>
                          <p className={`font-medium ${
                            milestone.dueDate && isAfter(new Date(), parseISO(milestone.dueDate)) && milestone.status !== "paid" 
                              ? "text-red-500" 
                              : ""
                          }`}>
                            {milestone.dueDate 
                              ? format(parseISO(milestone.dueDate), "MMM d, yyyy")
                              : "Not specified"
                            }
                          </p>
                        </div>
                      </div>

                      {milestone.invoiceRef && (
                        <div className="mb-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Invoice Reference</p>
                          <Badge variant="secondary">{milestone.invoiceRef}</Badge>
                        </div>
                      )}

                      <ReminderTimeline 
                        reminderCount={milestone.reminderCount}
                        dueDate={milestone.dueDate}
                        isPaidOrCancelled={milestone.status === "paid"}
                        cancelledReminders={milestone.cancelledReminders || []}
                        onCancelReminder={(reminderNum) => 
                          cancelMilestoneReminderMutation.mutate({ id: milestone.id, reminderNum })
                        }
                        onUncancelReminder={(reminderNum) => 
                          uncancelMilestoneReminderMutation.mutate({ id: milestone.id, reminderNum })
                        }
                        isCancelling={cancelMilestoneReminderMutation.isPending}
                        isUncancelling={uncancelMilestoneReminderMutation.isPending}
                      />
                      
                      {milestone.lastReminderSent && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Last reminder sent: {format(new Date(milestone.lastReminderSent), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No invoiced milestones</h3>
                  <p className="text-muted-foreground">
                    Mark payment milestones as "Invoiced" from project pages to track their reminders here.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
