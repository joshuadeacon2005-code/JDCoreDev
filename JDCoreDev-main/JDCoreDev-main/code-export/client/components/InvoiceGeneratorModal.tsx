import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download } from "lucide-react";
import type { Project, Client, Milestone } from "@shared/schema";
import { JDCOREDEV_LOGO_BASE64 } from "@/lib/logo-base64";

const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  notes: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

interface InvoiceGeneratorModalProps {
  project: Project & { client: Client };
  milestones: Milestone[];
  currentMilestone: Milestone;
  trigger?: React.ReactNode;
}

const BRAND_TEAL = [0, 128, 128] as const;
const BRAND_DARK = [30, 30, 30] as const;

function generateInvoicePDF(
  data: InvoiceFormData,
  project: Project & { client: Client },
  milestones: Milestone[],
  currentMilestone: Milestone
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const paidMilestones = milestones.filter(m => m.status === "paid");
  const futureMilestones = milestones.filter(m => 
    m.id !== currentMilestone.id && 
    m.status !== "paid" && 
    (m.status === "planned" || m.status === "overdue" || m.status === "invoiced")
  );

  // Add logo (452x120 original, aspect ratio ~3.77:1)
  try {
    doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 60, 16);
  } catch (e) {
    // Fallback if logo fails to load
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

  y = 55;
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO:", pageWidth - margin - 60, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text(project.client.companyName || project.client.name, pageWidth - margin - 60, y);
  y += 5;
  doc.text(project.client.name, pageWidth - margin - 60, y);
  if (project.client.email) {
    y += 5;
    doc.text(project.client.email, pageWidth - margin - 60, y);
  }

  y = 110;
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, contentWidth, 24, 'F');
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Invoice Number:", margin + 5, y + 8);
  doc.text("Invoice Date:", margin + 5, y + 18);
  doc.text("Due Date:", pageWidth / 2, y + 8);
  doc.text("Project:", pageWidth / 2, y + 18);

  doc.setFont("helvetica", "normal");
  doc.text(data.invoiceNumber, margin + 45, y + 8);
  doc.text(format(new Date(data.invoiceDate), "MMMM d, yyyy"), margin + 45, y + 18);
  doc.text(format(new Date(data.dueDate), "MMMM d, yyyy"), pageWidth / 2 + 30, y + 8);
  doc.text(project.name, pageWidth / 2 + 30, y + 18);

  y += 35;

  if (paidMilestones.length > 0) {
    doc.setFillColor(...BRAND_TEAL);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("PREVIOUSLY PAID", margin + 3, y + 6);
    doc.setTextColor(...BRAND_DARK);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    paidMilestones.forEach((m) => {
      doc.text(m.name, margin + 5, y);
      if (m.paidDate) {
        doc.text(`Paid ${format(new Date(m.paidDate), "MMM d, yyyy")}`, margin + 100, y);
      }
      doc.text(`$${(m.amountCents / 100).toLocaleString()}`, pageWidth - margin - 25, y, { align: "right" });
      y += 6;
    });

    const totalPaid = paidMilestones.reduce((sum, m) => sum + m.amountCents, 0);
    doc.setFont("helvetica", "bold");
    doc.text("Total Previously Paid:", margin + 5, y + 2);
    doc.text(`$${(totalPaid / 100).toLocaleString()}`, pageWidth - margin - 25, y + 2, { align: "right" });
    y += 12;
  }

  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("AMOUNT DUE NOW", margin + 3, y + 6);
  doc.setTextColor(...BRAND_DARK);
  y += 14;

  doc.setFillColor(255, 250, 240);
  doc.rect(margin, y - 2, contentWidth, 16, 'F');
  doc.setDrawColor(...BRAND_TEAL);
  doc.setLineWidth(0.5);
  doc.rect(margin, y - 2, contentWidth, 16, 'S');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(currentMilestone.name, margin + 5, y + 6);
  if (currentMilestone.dueDate) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Due: ${format(new Date(currentMilestone.dueDate), "MMMM d, yyyy")}`, margin + 5, y + 12);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`$${(currentMilestone.amountCents / 100).toLocaleString()}`, pageWidth - margin - 25, y + 8, { align: "right" });
  y += 22;

  if (futureMilestones.length > 0) {
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("UPCOMING PAYMENTS", margin + 3, y + 6);
    doc.setTextColor(...BRAND_DARK);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    futureMilestones.forEach((m) => {
      doc.text(m.name, margin + 5, y);
      if (m.dueDate) {
        doc.text(`Due ${format(new Date(m.dueDate), "MMM d, yyyy")}`, margin + 100, y);
      }
      doc.text(`$${(m.amountCents / 100).toLocaleString()}`, pageWidth - margin - 25, y, { align: "right" });
      y += 6;
    });

    const totalFuture = futureMilestones.reduce((sum, m) => sum + m.amountCents, 0);
    doc.setFont("helvetica", "bold");
    doc.text("Total Remaining:", margin + 5, y + 2);
    doc.text(`$${(totalFuture / 100).toLocaleString()}`, pageWidth - margin - 25, y + 2, { align: "right" });
    y += 12;
  }

  doc.setTextColor(...BRAND_DARK);
  y += 5;
  doc.setDrawColor(...BRAND_TEAL);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFillColor(...BRAND_TEAL);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.rect(pageWidth - margin - 80, y - 5, 80, 16, 'F');
  doc.text(`TOTAL DUE: $${(currentMilestone.amountCents / 100).toLocaleString()}`, pageWidth - margin - 75, y + 6);

  if (data.notes) {
    y += 30;
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(data.notes, contentWidth);
    doc.text(noteLines, margin, y + 6);
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(0, pageHeight - 25, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 15, { align: "center" });
  doc.text("JD CoreDev | joshuadeacon888@gmail.com | Hong Kong", pageWidth / 2, pageHeight - 8, { align: "center" });

  return doc;
}

export function InvoiceGeneratorModal({ project, milestones, currentMilestone, trigger }: InvoiceGeneratorModalProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultDueDate = currentMilestone.dueDate || format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  const projectMilestoneIndex = milestones.findIndex(m => m.id === currentMilestone.id) + 1;
  const defaultInvoiceNumber = `INV-${project.id}-${String(projectMilestoneIndex).padStart(2, '0')}`;

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: defaultInvoiceNumber,
      invoiceDate: today,
      dueDate: defaultDueDate,
      notes: "",
    },
  });

  const onSubmit = (data: InvoiceFormData) => {
    try {
      const doc = generateInvoicePDF(data, project, milestones, currentMilestone);
      const fileName = `Invoice_${data.invoiceNumber}_${project.name.replace(/\s+/g, '_')}.pdf`;
      doc.save(fileName);

      toast({
        title: "Invoice Generated",
        description: `Invoice ${data.invoiceNumber} has been downloaded.`,
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate invoice",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-invoice-milestone-${currentMilestone.id}`}>
            <FileText className="h-3 w-3" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
        </DialogHeader>
        <div className="mb-4 p-3 rounded-md bg-muted/50">
          <p className="text-sm text-muted-foreground">Invoice for:</p>
          <p className="font-medium">{currentMilestone.name}</p>
          <p className="text-lg font-mono font-semibold">${(currentMilestone.amountCents / 100).toLocaleString()}</p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    <FormLabel>Payment Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-invoice-due-date" />
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
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Payment terms, bank details, etc." data-testid="input-invoice-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="button-download-invoice">
                <Download className="h-4 w-4 mr-2" />
                Download Invoice
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
