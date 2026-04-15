import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { jsPDF } from "jspdf";
import { format, addDays } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileText, Download, Loader2 } from "lucide-react";
import type { RecurringPaymentWithProject, Project, Client, Milestone } from "@shared/schema";
import { JDCOREDEV_LOGO_BASE64 } from "@/lib/logo-base64";

const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  periodStart: z.string().min(1, "Period start is required"),
  periodEnd: z.string().min(1, "Period end is required"),
  notes: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

interface RecurringPaymentInvoiceModalProps {
  payment: RecurringPaymentWithProject;
  trigger?: React.ReactNode;
}

interface MaintenanceLogEntry {
  id: number;
  logDate: string;
  minutesSpent: number;
  description: string;
  totalCostCents: number;
  category: string | null;
  logType: string;
}

interface MaintenanceProjectData {
  projectName: string;
  logs: MaintenanceLogEntry[];
  totalMinutes: number;
  totalCostCents: number;
  budgetCents: number | null;
  budgetMinutes: number | null;
  overageCents: number;
}

interface AggregatedMaintenanceData {
  totalMinutes: number;
  totalCostCents: number;
  totalBudgetCents: number | null;
  totalBudgetMinutes: number | null;
  costOverageCents: number;
  overtimeMinutes: number;
  timeOverageCents: number;
  finalOverageCents: number;
  overtimeRatePerHour: number;
}

interface MaintenanceApiResponse {
  projects: Record<number, MaintenanceProjectData>;
  aggregated: AggregatedMaintenanceData;
}

const BRAND_TEAL = [0, 128, 128] as const;
const BRAND_DARK = [30, 30, 30] as const;

function generateHostingInvoicePDF(
  data: InvoiceFormData,
  project: Project & { client: Client },
  milestone: Milestone,
  allProjectsData?: Record<number, MaintenanceProjectData>,
  aggregatedData?: AggregatedMaintenanceData
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const footerHeight = 35;
  const maxY = pageHeight - footerHeight;
  let y = 20;

  const checkPageBreak = (requiredSpace: number) => {
    if (y + requiredSpace > maxY) {
      addFooter();
      doc.addPage();
      y = 30;
      return true;
    }
    return false;
  };

  const addFooter = () => {
    const footerY = pageHeight - 25;
    doc.setFillColor(...BRAND_TEAL);
    doc.rect(0, footerY - 10, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Thank you for your business!", pageWidth / 2, footerY, { align: "center" });
    doc.text("JD CoreDev | joshuadeacon888@gmail.com | Hong Kong", pageWidth / 2, footerY + 7, { align: "center" });
  };

  try {
    doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 60, 16);
  } catch (e) {
  }

  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", pageWidth - margin - 45, 20);

  y = 55;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("FROM:", margin, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text("JD CoreDev", margin, y);
  y += 5;
  doc.text("Joshua Deacon", margin, y);
  y += 5;
  doc.text("Hong Kong", margin, y);
  y += 5;
  doc.text("joshuadeacon888@gmail.com", margin, y);

  let billToY = 55;
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO:", pageWidth - margin - 60, billToY);
  doc.setFont("helvetica", "normal");
  billToY += 6;
  const billToMaxWidth = 58;
  const companyNameLines = doc.splitTextToSize(project.client.companyName || project.client.name, billToMaxWidth);
  companyNameLines.forEach((line: string) => {
    doc.text(line, pageWidth - margin - 60, billToY);
    billToY += 5;
  });
  const billToName = project.client.accountsDeptName || project.client.name;
  const billToEmail = project.client.accountsDeptEmail || project.client.email;
  const nameLines = doc.splitTextToSize(billToName, billToMaxWidth);
  nameLines.forEach((line: string) => {
    doc.text(line, pageWidth - margin - 60, billToY);
    billToY += 5;
  });
  if (billToEmail) {
    const emailLines = doc.splitTextToSize(billToEmail, billToMaxWidth);
    emailLines.forEach((line: string) => {
      doc.text(line, pageWidth - margin - 60, billToY);
      billToY += 5;
    });
  }
  if (project.client.accountsDeptPhone) {
    doc.text(project.client.accountsDeptPhone, pageWidth - margin - 60, billToY);
    billToY += 5;
  }

  y = Math.max(110, billToY + 10);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, contentWidth, 28, 'F');
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Invoice Number:", margin + 5, y + 8);
  doc.text("Invoice Date:", margin + 5, y + 16);
  doc.text("Due Date:", pageWidth / 2, y + 8);
  doc.text("Service Period:", pageWidth / 2, y + 16);
  doc.text("Project:", margin + 5, y + 24);

  doc.setFont("helvetica", "normal");
  doc.text(data.invoiceNumber, margin + 45, y + 8);
  doc.text(format(new Date(data.invoiceDate), "MMMM d, yyyy"), margin + 45, y + 16);
  doc.text(format(new Date(data.dueDate), "MMMM d, yyyy"), pageWidth / 2 + 35, y + 8);
  doc.text(`${format(new Date(data.periodStart), "MMM d")} - ${format(new Date(data.periodEnd), "MMM d, yyyy")}`, pageWidth / 2 + 35, y + 16);
  const projectNameLines = doc.splitTextToSize(project.name, contentWidth - 40);
  doc.text(projectNameLines[0], margin + 30, y + 24);

  y += 40;

  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("HOSTING SERVICE", margin + 3, y + 6);
  doc.setTextColor(...BRAND_DARK);
  y += 14;

  doc.setFillColor(255, 250, 240);
  doc.rect(margin, y - 2, contentWidth, 20, 'F');
  doc.setDrawColor(...BRAND_TEAL);
  doc.setLineWidth(0.5);
  doc.rect(margin, y - 2, contentWidth, 20, 'S');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(milestone.name, margin + 5, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Monthly hosting, maintenance, and support services", margin + 5, y + 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const hostingFee = milestone.amountCents / 100;
  doc.text(`$${hostingFee.toLocaleString()}`, pageWidth - margin - 25, y + 10, { align: "right" });
  y += 28;

  const overageCents = aggregatedData ? aggregatedData.finalOverageCents : 0;

  const formatMins = (m: number) => {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h > 0 ? `${h}h ${r}m` : `${r}m`;
  };

  const allLogs: Array<MaintenanceLogEntry & { projectName: string }> = [];
  if (allProjectsData) {
    for (const [, projData] of Object.entries(allProjectsData)) {
      for (const log of projData.logs) {
        allLogs.push({ ...log, projectName: projData.projectName });
      }
    }
  }

  if (allLogs.length > 0) {
    y += 5;
    checkPageBreak(20);
    doc.setFillColor(...BRAND_TEAL);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("EXTERNAL COSTS - MAINTENANCE & SUPPORT WORK", margin + 3, y + 6);
    doc.setTextColor(...BRAND_DARK);
    y += 14;

    const colDate = margin;
    const colDesc = margin + 28;
    const colTime = pageWidth - margin - 45;
    const colCost = pageWidth - margin - 5;
    const descWidth = colTime - colDesc - 18;

    const addLogTableHeader = () => {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 2, contentWidth, 8, 'F');
      doc.setTextColor(100, 100, 100);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("DATE", colDate + 2, y + 3);
      doc.text("DESCRIPTION", colDesc, y + 3);
      doc.text("TIME", colTime, y + 3, { align: "right" });
      doc.text("EXT. COSTS", colCost, y + 3, { align: "right" });
      doc.setTextColor(...BRAND_DARK);
      y += 10;
    };

    const projectIds = Object.keys(allProjectsData || {}).map(Number);
    const multiProject = projectIds.length > 1;

    for (const pid of projectIds) {
      const projData = allProjectsData![pid];
      if (projData.logs.length === 0) continue;

      if (multiProject) {
        checkPageBreak(18);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...BRAND_TEAL);
        doc.text(projData.projectName, margin + 2, y);
        y += 6;
      }

      addLogTableHeader();

      const sortedLogs = [...projData.logs].sort((a, b) =>
        new Date(a.logDate).getTime() - new Date(b.logDate).getTime()
      );

      sortedLogs.forEach((log, index) => {
        const descLines = doc.splitTextToSize(log.description, descWidth);
        const rowHeight = Math.max(descLines.length * 4 + 2, 6);

        if (y + rowHeight + 4 > maxY) {
          addFooter();
          doc.addPage();
          y = 30;
          addLogTableHeader();
        }

        if (index % 2 === 0) {
          doc.setFillColor(248, 248, 248);
          doc.rect(margin, y - 2, contentWidth, rowHeight + 2, 'F');
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...BRAND_DARK);

        const logDate = format(new Date(log.logDate), "MMM d, yyyy");
        doc.text(logDate, colDate + 2, y + 2);

        doc.setTextColor(60, 60, 60);
        descLines.forEach((line: string, i: number) => {
          doc.text(line, colDesc, y + 2 + (i * 4));
        });

        doc.setTextColor(...BRAND_DARK);
        doc.text(formatMins(log.minutesSpent), colTime, y + 2, { align: "right" });
        doc.text(`$${(log.totalCostCents / 100).toFixed(2)}`, colCost, y + 2, { align: "right" });

        y += rowHeight + 1;
      });

      if (multiProject) {
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 100, 100);
        doc.text(`Subtotal: ${formatMins(projData.totalMinutes)}`, colTime - 30, y, { align: "right" });
        doc.text(`$${(projData.totalCostCents / 100).toFixed(2)}`, colCost, y, { align: "right" });
        y += 8;
      }
    }

    y += 3;
    checkPageBreak(15);
    doc.setDrawColor(...BRAND_TEAL);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    if (aggregatedData) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND_DARK);
      doc.text(`Total: ${allLogs.length} entries`, colDate + 2, y);
      doc.text(formatMins(aggregatedData.totalMinutes), colTime, y, { align: "right" });
      doc.text(`$${(aggregatedData.totalCostCents / 100).toFixed(2)}`, colCost, y, { align: "right" });
      y += 8;

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);

      if (aggregatedData.totalBudgetCents !== null) {
        doc.text(`Combined Cost Budget: $${(aggregatedData.totalBudgetCents / 100).toFixed(2)}`, margin + 2, y);
        if (aggregatedData.costOverageCents > 0) {
          doc.setTextColor(200, 50, 50);
          doc.setFont("helvetica", "bold");
          doc.text(`Cost Overage: +$${(aggregatedData.costOverageCents / 100).toFixed(2)}`, margin + 85, y);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
        } else {
          doc.setTextColor(0, 128, 0);
          doc.text("Within budget", margin + 85, y);
          doc.setTextColor(100, 100, 100);
        }
        y += 5;
      }

      if (aggregatedData.totalBudgetMinutes !== null) {
        doc.text(`Combined Time Budget: ${formatMins(aggregatedData.totalBudgetMinutes)}`, margin + 2, y);
        if (aggregatedData.overtimeMinutes > 0) {
          doc.setTextColor(200, 50, 50);
          doc.setFont("helvetica", "bold");
          doc.text(`Time Overage: ${formatMins(aggregatedData.overtimeMinutes)} @ $${aggregatedData.overtimeRatePerHour}/hr = $${(aggregatedData.timeOverageCents / 100).toFixed(2)}`, margin + 85, y);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
        } else {
          doc.setTextColor(0, 128, 0);
          doc.text("Within allocation", margin + 85, y);
          doc.setTextColor(100, 100, 100);
        }
        y += 5;
      }

      if (overageCents > 0) {
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(200, 50, 50);
        doc.text(`Overage Added to Invoice (lesser of cost/time): $${(overageCents / 100).toFixed(2)}`, margin + 2, y);
        y += 5;
      }
    }
    y += 5;
  }

  const totalDueCents = milestone.amountCents + overageCents;
  const totalDue = totalDueCents / 100;

  doc.setTextColor(...BRAND_DARK);
  checkPageBreak(35);
  doc.setDrawColor(...BRAND_TEAL);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  if (overageCents > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Hosting Fee:", margin + 5, y);
    doc.text(`$${hostingFee.toLocaleString()}`, pageWidth - margin - 25, y, { align: "right" });
    y += 6;
    doc.text("Maintenance Overage:", margin + 5, y);
    doc.text(`$${(overageCents / 100).toFixed(2)}`, pageWidth - margin - 25, y, { align: "right" });
    y += 10;
  }

  doc.setFillColor(...BRAND_TEAL);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const totalText = `TOTAL DUE: $${totalDue.toLocaleString()}`;
  const totalBoxWidth = Math.max(95, doc.getTextWidth(totalText) + 15);
  doc.rect(pageWidth - margin - totalBoxWidth, y - 5, totalBoxWidth, 16, 'F');
  doc.text(totalText, pageWidth - margin - totalBoxWidth + 5, y + 6);

  y += 25;
  checkPageBreak(15);
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text("* All dates shown are estimates and subject to change.", margin, y);

  if (data.notes) {
    y += 12;
    checkPageBreak(25);
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 6;
    const noteLines = doc.splitTextToSize(data.notes, contentWidth);
    noteLines.forEach((line: string) => {
      checkPageBreak(5);
      doc.text(line, margin, y);
      y += 5;
    });
  }

  addFooter();

  return doc;
}

export function RecurringPaymentInvoiceModal({ payment, trigger }: RecurringPaymentInvoiceModalProps) {
  const [open, setOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState<{
    milestone: Milestone;
    project: Project & { client: Client };
  } | null>(null);
  const [allProjectsData, setAllProjectsData] = useState<Record<number, MaintenanceProjectData> | null>(null);
  const [aggregatedData, setAggregatedData] = useState<AggregatedMaintenanceData | null>(null);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(false);
  const { toast } = useToast();

  const { data: milestones } = useQuery<Milestone[]>({
    queryKey: ["/api/admin/milestones", payment.projectId],
    enabled: open,
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultDueDate = format(addDays(new Date(), 14), "yyyy-MM-dd");
  
  const now = new Date();

  const lastHostingEndDate = (() => {
    if (!milestones) return null;
    const hostingMilestones = milestones
      .filter((m: Milestone) => m.projectId === payment.projectId && m.name.startsWith("Hosting:"))
      .map((m: Milestone) => {
        const match = m.name.match(/^Hosting:\s*\d{4}-\d{2}-\d{2}\s*-\s*(\d{4}-\d{2}-\d{2})$/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
      .sort()
      .reverse();
    return hostingMilestones.length > 0 ? hostingMilestones[0] : null;
  })();

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const computedPeriodStart = (() => {
    if (lastHostingEndDate) {
      const dayAfter = format(addDays(new Date(lastHostingEndDate + "T00:00:00"), 1), "yyyy-MM-dd");
      return dayAfter <= todayStr ? dayAfter : todayStr;
    }
    return format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  })();
  const periodStart = computedPeriodStart;
  const periodEnd = todayStr;
  
  const defaultInvoiceNumber = `INV-H${payment.projectId}-${format(now, "yyyyMM")}`;

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: defaultInvoiceNumber,
      invoiceDate: today,
      dueDate: defaultDueDate,
      periodStart,
      periodEnd,
      notes: "",
    },
  });

  useEffect(() => {
    if (milestones && open) {
      form.setValue("periodStart", periodStart);
      form.setValue("periodEnd", periodEnd);
    }
  }, [milestones, open, periodStart, periodEnd]);

  const generateMutation = useMutation({
    mutationFn: async (data: { periodStart: string; periodEnd: string }) => {
      const res = await apiRequest("POST", `/api/admin/recurring-payments/${payment.id}/generate-invoice`, data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate invoice");
      }
      return res.json();
    },
    onSuccess: async (data) => {
      setInvoiceData({
        milestone: data.milestone,
        project: data.project,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });

      const formValues = form.getValues();

      setIsLoadingMaintenance(true);
      try {
        const clientId = data.project.clientId;
        const res = await apiRequest("POST", "/api/admin/invoice-maintenance-data", {
          projectIds: [payment.projectId],
          clientId,
          startDate: formValues.periodStart,
          endDate: formValues.periodEnd,
        });
        const apiResponse: MaintenanceApiResponse = await res.json();
        setAllProjectsData(apiResponse.projects);
        setAggregatedData(apiResponse.aggregated);
        if (apiResponse.aggregated.finalOverageCents > 0) {
          toast({
            title: "Overage Detected",
            description: `$${(apiResponse.aggregated.finalOverageCents / 100).toFixed(2)} overage (lesser of cost/time) will be added to the invoice.`,
          });
        }
      } catch (e) {
        toast({
          title: "Warning",
          description: "Could not fetch maintenance logs. Invoice will not include external costs.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingMaintenance(false);
      }

      toast({
        title: "Milestone Created",
        description: "Click 'Download PDF' to save your invoice.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: InvoiceFormData) => {
    if (!invoiceData) {
      generateMutation.mutate({
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
      });
      return;
    }

    try {
      const doc = generateHostingInvoicePDF(data, invoiceData.project, invoiceData.milestone, allProjectsData || undefined, aggregatedData || undefined);
      const filename = `${data.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
      doc.save(filename);
      
      toast({
        title: "Invoice Generated",
        description: `Invoice ${data.invoiceNumber} has been downloaded.`,
      });
      
      setOpen(false);
      setInvoiceData(null);
      setAllProjectsData(null);
      setAggregatedData(null);
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate invoice PDF",
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setInvoiceData(null);
      setAllProjectsData(null);
      setAggregatedData(null);
      form.reset({
        invoiceNumber: defaultInvoiceNumber,
        invoiceDate: today,
        dueDate: defaultDueDate,
        periodStart,
        periodEnd,
        notes: "",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" data-testid={`button-invoice-${payment.id}`}>
            <FileText className="h-4 w-4 mr-1" />
            Invoice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Hosting Invoice</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{payment.project.name}</p>
              <p className="text-sm text-muted-foreground">
                {payment.project.client.companyName || payment.project.client.name}
              </p>
              <p className="text-lg font-bold text-primary mt-1">
                ${(payment.amountCents / 100).toLocaleString()} / month
              </p>
              {aggregatedData && aggregatedData.totalCostCents > 0 && (
                <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-1" data-testid="maintenance-log-info">
                  <div>
                    <FileText className="h-3 w-3 inline mr-1" />
                    {Object.values(allProjectsData || {}).reduce((sum, p) => sum + p.logs.length, 0)} maintenance log(s) across {Object.keys(allProjectsData || {}).length} project(s)
                  </div>
                  {aggregatedData.finalOverageCents > 0 && (
                    <div className="text-destructive font-medium">
                      Overage: +${(aggregatedData.finalOverageCents / 100).toFixed(2)}
                      <span className="text-muted-foreground font-normal ml-1">
                        (lesser of cost ${(aggregatedData.costOverageCents / 100).toFixed(2)} / time ${(aggregatedData.timeOverageCents / 100).toFixed(2)})
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="periodStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Start</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        disabled={!!invoiceData} 
                        data-testid="input-period-start" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period End</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        disabled={!!invoiceData} 
                        data-testid="input-period-end" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="invoiceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice Number</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-invoice-number" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="invoiceDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-invoice-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-due-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any additional notes for this invoice..."
                      {...field}
                      data-testid="input-invoice-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={generateMutation.isPending || isLoadingMaintenance}
                data-testid="button-generate-invoice"
              >
                {generateMutation.isPending || isLoadingMaintenance ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isLoadingMaintenance ? "Loading logs..." : "Creating..."}
                  </>
                ) : invoiceData ? (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Invoice
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
