import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { jsPDF } from "jspdf";
import { format, addDays } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Briefcase, Download, Loader2, CheckCircle2, Receipt } from "lucide-react";
import type { Project, Client, Milestone, PaymentSettings, MaintenanceLog } from "@shared/schema";
import { JDCOREDEV_LOGO_BASE64 } from "@/lib/logo-base64";

const developmentInvoiceFormSchema = z.object({
  invoiceDate: z.string().min(1, "Date is required"),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

type DevelopmentInvoiceFormData = z.infer<typeof developmentInvoiceFormSchema>;

type ProjectWithClient = Project & { 
  client?: Client;
};

type MilestoneWithProject = Milestone & {
  project?: ProjectWithClient;
};

interface DevelopmentInvoiceGeneratorDialogProps {
  clientId?: number;
  projectId?: number;
  trigger: React.ReactNode;
  onSuccess?: (invoiceNumber: string) => void;
}

const BRAND_TEAL = [0, 128, 128] as const;
const BRAND_DARK = [30, 30, 30] as const;
const DEFAULT_USD_TO_HKD_RATE = 7.8;

type MaintenanceLogWithCosts = MaintenanceLog & {
  additionalCosts?: Array<{ id: number; costCents: number; description: string | null }>;
};

function generateDevelopmentInvoicePDF(
  data: DevelopmentInvoiceFormData,
  invoiceNumber: string,
  client: Client,
  project: Project,
  milestone: Milestone,
  paymentSettings?: PaymentSettings,
  developmentLogs?: MaintenanceLogWithCosts[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const footerHeight = 25;
  const maxY = pageHeight - footerHeight;
  let y = 20;

  // Helper function to check if we need a new page
  const checkPageBreak = (requiredSpace: number) => {
    if (y + requiredSpace > maxY) {
      addFooter();
      doc.addPage();
      y = 30;
      return true;
    }
    return false;
  };

  // Helper function to add footer
  const addFooter = () => {
    const footerY = pageHeight - 15;
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text("Thank you for your business!", pageWidth / 2, footerY, { align: "center" });
    doc.text("JD CoreDev - Custom Software Development & Consulting", pageWidth / 2, footerY + 5, { align: "center" });
  };

  const usdToHkdRate = paymentSettings?.usdToHkdRate 
    ? parseFloat(paymentSettings.usdToHkdRate) 
    : DEFAULT_USD_TO_HKD_RATE;

  const amountUSD = milestone.amountCents / 100;
  const amountHKD = amountUSD * usdToHkdRate;

  try {
    doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 60, 16);
  } catch (e) {}

  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("DEVELOPMENT INVOICE", pageWidth - margin - 85, 20);

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
  // Company name with wrapping
  const companyNameLines = doc.splitTextToSize(client.companyName || client.name, billToMaxWidth);
  companyNameLines.forEach((line: string) => {
    doc.text(line, pageWidth - margin - 60, billToY);
    billToY += 5;
  });
  // Use accounts department contact if available, otherwise use main client contact
  const billToName = client.accountsDeptName || client.name;
  const billToEmail = client.accountsDeptEmail || client.email;
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
  if (client.accountsDeptPhone) {
    doc.text(client.accountsDeptPhone, pageWidth - margin - 60, billToY);
    billToY += 5;
  }

  // Dynamic header height - ensure content starts below BILL TO section
  y = Math.max(115, billToY + 10);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, contentWidth, 28, 'F');
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Invoice #:", margin + 5, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(invoiceNumber, margin + 35, y + 8);
  
  doc.setFont("helvetica", "bold");
  doc.text("Invoice Date:", margin + 5, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(format(new Date(data.invoiceDate), "MMMM d, yyyy"), margin + 40, y + 16);
  
  doc.setFont("helvetica", "bold");
  doc.text("Due Date:", pageWidth / 2 + 10, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(format(new Date(data.dueDate), "MMMM d, yyyy"), pageWidth / 2 + 35, y + 8);
  
  doc.setFont("helvetica", "bold");
  doc.text("Project:", pageWidth / 2 + 10, y + 16);
  doc.setFont("helvetica", "normal");
  const projectNameLines = doc.splitTextToSize(project.name, 55);
  doc.text(projectNameLines[0], pageWidth / 2 + 30, y + 16);
  if (projectNameLines.length > 1) {
    doc.text(projectNameLines[1], pageWidth / 2 + 30, y + 20);
  }

  y = 155;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DEVELOPMENT MILESTONE", margin + 5, y + 7);

  y += 18;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Description", margin + 5, y);
  doc.text("Amount", pageWidth - margin - 25, y, { align: "right" });

  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const milestoneNameLines = doc.splitTextToSize(milestone.name, contentWidth - 60);
  milestoneNameLines.forEach((line: string, i: number) => {
    if (i > 0) checkPageBreak(5);
    doc.text(line, margin + 5, y);
    y += i === 0 ? 0 : 5;
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`USD $${amountUSD.toLocaleString()}`, pageWidth - margin - 25, y, { align: "right" });
  
  y += 7;
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  const projectLineText = `Project: ${project.name}`;
  const projectTextLines = doc.splitTextToSize(projectLineText, contentWidth - 15);
  projectTextLines.forEach((line: string) => {
    checkPageBreak(5);
    doc.text(line, margin + 5, y);
    y += 4;
  });
  y -= 4; // Adjust for the last line increment
  
  if (milestone.notes) {
    y += 5;
    const noteLines = doc.splitTextToSize(milestone.notes, contentWidth - 40);
    noteLines.forEach((line: string) => {
      checkPageBreak(6);
      doc.text(line, margin + 5, y);
      y += 4;
    });
  }

  y += 15;
  checkPageBreak(35);
  doc.setDrawColor(...BRAND_TEAL);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFillColor(...BRAND_TEAL);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.rect(pageWidth - margin - 95, y - 5, 95, 20, 'F');
  doc.text(`TOTAL DUE: USD $${amountUSD.toLocaleString()}`, pageWidth - margin - 90, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`(approx. HKD $${amountHKD.toLocaleString(undefined, { maximumFractionDigits: 0 })})`, pageWidth - margin - 90, y + 12);

  y += 25;
  // Calculate total payment details height (left column ~35mm + buffer for right column)
  checkPageBreak(70);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(10);
  doc.text("PAYMENT DETAILS", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);

  // Single-column layout with per-line page break checks and text wrapping
  const lineHeight = 4;
  
  const addPaymentLine = (label: string, value: string, isBold = false) => {
    const maxWidth = contentWidth - 5;
    const fullText = `${label} ${value}`;
    const lines = doc.splitTextToSize(fullText, maxWidth);
    lines.forEach((line: string, i: number) => {
      checkPageBreak(lineHeight + 2);
      if (i === 0 && isBold) doc.setFont("helvetica", "bold");
      doc.text(line, margin, y);
      doc.setFont("helvetica", "normal");
      y += lineHeight;
    });
  };

  if (paymentSettings?.bankName || paymentSettings?.accountNumber) {
    checkPageBreak(8);
    doc.setFont("helvetica", "bold");
    doc.text("Bank Transfer:", margin, y);
    doc.setFont("helvetica", "normal");
    y += 4;
    if (paymentSettings?.accountHolderName) addPaymentLine("Name:", paymentSettings.accountHolderName);
    if (paymentSettings?.bankName) addPaymentLine("Bank:", paymentSettings.bankName);
    if (paymentSettings?.accountNumber) addPaymentLine("Account:", paymentSettings.accountNumber);
    if (paymentSettings?.routingNumber) addPaymentLine("Routing:", paymentSettings.routingNumber);
    if (paymentSettings?.swiftCode) addPaymentLine("SWIFT:", paymentSettings.swiftCode);
    if (paymentSettings?.iban) addPaymentLine("IBAN:", paymentSettings.iban);
    y += 3;
  }

  if (paymentSettings?.ukBankName || paymentSettings?.ukAccountNumber || paymentSettings?.ukSortCode) {
    checkPageBreak(8);
    doc.setFont("helvetica", "bold");
    doc.text("UK Bank Transfer:", margin, y);
    doc.setFont("helvetica", "normal");
    y += 4;
    if (paymentSettings?.ukAccountHolderName) addPaymentLine("Name:", paymentSettings.ukAccountHolderName);
    if (paymentSettings?.ukBankName) addPaymentLine("Bank:", paymentSettings.ukBankName);
    if (paymentSettings?.ukSortCode) addPaymentLine("Sort Code:", paymentSettings.ukSortCode);
    if (paymentSettings?.ukAccountNumber) addPaymentLine("Account:", paymentSettings.ukAccountNumber);
    y += 3;
  }

  if (paymentSettings?.paypalEmail) addPaymentLine("PayPal:", paymentSettings.paypalEmail, true);
  if (paymentSettings?.zelleEmail) addPaymentLine("Zelle:", paymentSettings.zelleEmail, true);
  if (paymentSettings?.venmoUsername) addPaymentLine("Venmo:", `@${paymentSettings.venmoUsername}`, true);
  if (paymentSettings?.cashappTag) addPaymentLine("CashApp:", `$${paymentSettings.cashappTag}`, true);
  
  if (paymentSettings?.stripePaymentLink) {
    addPaymentLine("Online:", paymentSettings.stripePaymentLink, true);
  }

  if (paymentSettings?.bitcoinAddress) {
    addPaymentLine("BTC:", paymentSettings.bitcoinAddress, true);
  }

  if (paymentSettings?.ethereumAddress) {
    addPaymentLine("ETH:", paymentSettings.ethereumAddress, true);
  }

  if (paymentSettings?.checkPayableTo) {
    addPaymentLine("Check:", paymentSettings.checkPayableTo, true);
    if (paymentSettings?.mailingAddress) {
      checkPageBreak(8);
      const addrLines = doc.splitTextToSize(paymentSettings.mailingAddress, contentWidth - 10);
      addrLines.forEach((line: string) => {
        checkPageBreak(lineHeight);
        doc.text(line, margin + 5, y);
        y += lineHeight;
      });
    }
  }

  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Please reference invoice number in your payment.", margin, y);

  if (data.notes) {
    y += 10;
    checkPageBreak(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_DARK);
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    y += 5;
    const noteLines = doc.splitTextToSize(data.notes, contentWidth - 10);
    noteLines.forEach((line: string) => {
      checkPageBreak(5);
      doc.text(line, margin, y);
      y += 5;
    });
  }

  if (developmentLogs && developmentLogs.length > 0) {
    addFooter();
    doc.addPage();
    y = 20;

    try {
      doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 40, 10);
    } catch (e) {}

    doc.setTextColor(...BRAND_DARK);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("EXTERNAL COSTS - DEVELOPMENT LOG", margin + 45, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Project: ${project.name}  |  Invoice: ${invoiceNumber}`, margin, 26);

    y = 35;

    const colDate = margin;
    const colDesc = margin + 28;
    const colTime = pageWidth - margin - 40;
    const colCost = pageWidth - margin - 5;
    const descWidth = colTime - colDesc - 5;

    doc.setFillColor(...BRAND_TEAL);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("DATE", colDate + 2, y + 5.5);
    doc.text("DESCRIPTION", colDesc, y + 5.5);
    doc.text("TIME", colTime, y + 5.5, { align: "right" });
    doc.text("EXT. COSTS", colCost, y + 5.5, { align: "right" });
    y += 12;

    let totalMinutes = 0;
    let totalCostCents = 0;

    const sortedLogs = [...developmentLogs].sort((a, b) => 
      new Date(a.logDate).getTime() - new Date(b.logDate).getTime()
    );

    const addLogTableHeader = () => {
      doc.setFillColor(...BRAND_TEAL);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("DATE", colDate + 2, y + 5.5);
      doc.text("DESCRIPTION", colDesc, y + 5.5);
      doc.text("TIME", colTime, y + 5.5, { align: "right" });
      doc.text("EXT. COSTS", colCost, y + 5.5, { align: "right" });
      y += 12;
    };

    sortedLogs.forEach((log, index) => {
      const descLines = doc.splitTextToSize(log.description, descWidth);
      const rowHeight = Math.max(descLines.length * 4 + 2, 6);
      if (checkPageBreak(rowHeight + 4)) {
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

      const hours = Math.floor(log.minutesSpent / 60);
      const mins = log.minutesSpent % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      doc.setTextColor(...BRAND_DARK);
      doc.text(timeStr, colTime, y + 2, { align: "right" });

      let logTotalCost = log.estimatedCostCents || 0;
      if (log.additionalCosts) {
        logTotalCost += log.additionalCosts.reduce((sum, c) => sum + c.costCents, 0);
      }
      const costStr = `$${(logTotalCost / 100).toFixed(2)}`;
      doc.text(costStr, colCost, y + 2, { align: "right" });

      totalMinutes += log.minutesSpent;
      totalCostCents += logTotalCost;

      y += rowHeight + 1;
    });

    y += 3;
    checkPageBreak(15);
    doc.setDrawColor(...BRAND_TEAL);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_DARK);
    doc.text("TOTALS", colDate + 2, y);

    doc.text(`${developmentLogs.length} entries`, colDesc, y);

    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;
    const totalTimeStr = totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`;
    doc.text(totalTimeStr, colTime, y, { align: "right" });
    doc.text(`$${(totalCostCents / 100).toFixed(2)}`, colCost, y, { align: "right" });
  }

  // Add footer to last page
  addFooter();

  return doc;
}

function generateReceiptPDF(
  data: DevelopmentInvoiceFormData,
  receiptNumber: string,
  client: Client,
  project: Project,
  milestone: Milestone,
  developmentLogs?: MaintenanceLogWithCosts[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const footerHeight = 25;
  const maxY = pageHeight - footerHeight;
  let y = 20;

  const BRAND_GREEN = [22, 163, 74] as const;

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
    const footerY = pageHeight - 15;
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text("Thank you for your payment!", pageWidth / 2, footerY, { align: "center" });
    doc.text("JD CoreDev - Custom Software Development & Consulting", pageWidth / 2, footerY + 5, { align: "center" });
  };

  const amountUSD = milestone.amountCents / 100;

  try {
    doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 60, 16);
  } catch (e) {}

  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("RECEIPT OF SERVICES", pageWidth - margin - 95, 20);

  y = 55;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("FROM:", margin, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text("JD CoreDev", margin, y); y += 5;
  doc.text("Joshua Deacon", margin, y); y += 5;
  doc.text("Hong Kong", margin, y); y += 5;
  doc.text("joshuadeacon888@gmail.com", margin, y);

  let billToY = 55;
  doc.setFont("helvetica", "bold");
  doc.text("RECEIVED FROM:", pageWidth - margin - 60, billToY);
  doc.setFont("helvetica", "normal");
  billToY += 6;
  const billToMaxWidth = 58;
  const companyNameLines = doc.splitTextToSize(client.companyName || client.name, billToMaxWidth);
  companyNameLines.forEach((line: string) => { doc.text(line, pageWidth - margin - 60, billToY); billToY += 5; });
  const billToName = client.accountsDeptName || client.name;
  const billToEmail = client.accountsDeptEmail || client.email;
  const nameLines = doc.splitTextToSize(billToName, billToMaxWidth);
  nameLines.forEach((line: string) => { doc.text(line, pageWidth - margin - 60, billToY); billToY += 5; });
  if (billToEmail) {
    const emailLines = doc.splitTextToSize(billToEmail, billToMaxWidth);
    emailLines.forEach((line: string) => { doc.text(line, pageWidth - margin - 60, billToY); billToY += 5; });
  }

  y = Math.max(115, billToY + 10);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, contentWidth, 28, 'F');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Receipt #:", margin + 5, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(receiptNumber, margin + 33, y + 8);

  doc.setFont("helvetica", "bold");
  doc.text("Receipt Date:", margin + 5, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(format(new Date(data.invoiceDate), "MMMM d, yyyy"), margin + 40, y + 16);

  doc.setFont("helvetica", "bold");
  doc.text("Project:", pageWidth / 2 + 10, y + 8);
  doc.setFont("helvetica", "normal");
  const projectNameLines = doc.splitTextToSize(project.name, 55);
  doc.text(projectNameLines[0], pageWidth / 2 + 30, y + 8);

  doc.setFont("helvetica", "bold");
  doc.text("Status:", pageWidth / 2 + 10, y + 16);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("PAID IN FULL", pageWidth / 2 + 28, y + 16);
  doc.setTextColor(...BRAND_DARK);

  y = 155;
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(margin, y, contentWidth, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("SERVICES RENDERED", margin + 5, y + 7);

  y += 18;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Description", margin + 5, y);
  doc.text("Amount Paid", pageWidth - margin - 25, y, { align: "right" });

  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const milestoneNameLines = doc.splitTextToSize(milestone.name, contentWidth - 60);
  milestoneNameLines.forEach((line: string, i: number) => {
    if (i > 0) checkPageBreak(5);
    doc.text(line, margin + 5, y);
    y += i === 0 ? 0 : 5;
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`USD $${amountUSD.toLocaleString()}`, pageWidth - margin - 25, y, { align: "right" });

  y += 7;
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  const projectTextLines = doc.splitTextToSize(`Project: ${project.name}`, contentWidth - 15);
  projectTextLines.forEach((line: string) => { checkPageBreak(5); doc.text(line, margin + 5, y); y += 4; });
  y -= 4;

  if (milestone.notes) {
    y += 5;
    const noteLines = doc.splitTextToSize(milestone.notes, contentWidth - 40);
    noteLines.forEach((line: string) => { checkPageBreak(6); doc.text(line, margin + 5, y); y += 4; });
  }

  y += 15;
  checkPageBreak(35);
  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFillColor(...BRAND_GREEN);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.rect(pageWidth - margin - 95, y - 5, 95, 20, 'F');
  doc.text(`PAID: USD $${amountUSD.toLocaleString()}`, pageWidth - margin - 90, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Payment received — thank you", pageWidth - margin - 90, y + 12);

  if (data.notes) {
    y += 30;
    checkPageBreak(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_DARK);
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    y += 5;
    const notesLines = doc.splitTextToSize(data.notes, contentWidth - 10);
    notesLines.forEach((line: string) => { checkPageBreak(5); doc.text(line, margin, y); y += 5; });
  }

  if (developmentLogs && developmentLogs.length > 0) {
    addFooter();
    doc.addPage();
    y = 20;
    try { doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 40, 10); } catch (e) {}

    doc.setTextColor(...BRAND_DARK);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("EXTERNAL COSTS - DEVELOPMENT LOG", margin + 45, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Project: ${project.name}  |  Receipt: ${receiptNumber}`, margin, 26);
    y = 35;

    const colDate = margin;
    const colDesc = margin + 28;
    const colTime = pageWidth - margin - 40;
    const colCost = pageWidth - margin - 5;
    const descWidth = colTime - colDesc - 5;

    const drawLogHeader = () => {
      doc.setFillColor(...BRAND_GREEN);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("DATE", colDate + 2, y + 5.5);
      doc.text("DESCRIPTION", colDesc, y + 5.5);
      doc.text("TIME", colTime, y + 5.5, { align: "right" });
      doc.text("EXT. COSTS", colCost, y + 5.5, { align: "right" });
      y += 12;
    };
    drawLogHeader();

    let totalMinutes = 0, totalCostCents = 0;
    const sortedLogs = [...developmentLogs].sort((a, b) => new Date(a.logDate).getTime() - new Date(b.logDate).getTime());
    sortedLogs.forEach((log, index) => {
      const descLines = doc.splitTextToSize(log.description, descWidth);
      const rowHeight = Math.max(descLines.length * 4 + 2, 6);
      if (checkPageBreak(rowHeight + 4)) drawLogHeader();
      if (index % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(margin, y - 2, contentWidth, rowHeight + 2, 'F');
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND_DARK);
      doc.text(format(new Date(log.logDate), "MMM d, yyyy"), colDate + 2, y + 2);
      doc.setTextColor(60, 60, 60);
      descLines.forEach((line: string, i: number) => { doc.text(line, colDesc, y + 2 + (i * 4)); });
      const hours = Math.floor(log.minutesSpent / 60);
      const mins = log.minutesSpent % 60;
      doc.setTextColor(...BRAND_DARK);
      doc.text(hours > 0 ? `${hours}h ${mins}m` : `${mins}m`, colTime, y + 2, { align: "right" });
      let logTotal = log.estimatedCostCents || 0;
      if (log.additionalCosts) logTotal += log.additionalCosts.reduce((s, c) => s + c.costCents, 0);
      doc.text(`$${(logTotal / 100).toFixed(2)}`, colCost, y + 2, { align: "right" });
      totalMinutes += log.minutesSpent;
      totalCostCents += logTotal;
      y += rowHeight + 1;
    });

    y += 3;
    checkPageBreak(15);
    doc.setDrawColor(...BRAND_GREEN);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_DARK);
    doc.text("TOTALS", colDate + 2, y);
    doc.text(`${developmentLogs.length} entries`, colDesc, y);
    const th = Math.floor(totalMinutes / 60), tm = totalMinutes % 60;
    doc.text(th > 0 ? `${th}h ${tm}m` : `${tm}m`, colTime, y, { align: "right" });
    doc.text(`$${(totalCostCents / 100).toFixed(2)}`, colCost, y, { align: "right" });
  }

  addFooter();
  return doc;
}

export function DevelopmentInvoiceGeneratorDialog({ 
  clientId: initialClientId, 
  projectId: initialProjectId,
  trigger, 
  onSuccess 
}: DevelopmentInvoiceGeneratorDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(initialClientId || null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialProjectId || null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<number>>(new Set());

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/admin/clients"],
    enabled: !initialClientId,
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const { data: allMilestones, isLoading: milestonesLoading } = useQuery<MilestoneWithProject[]>({
    queryKey: ["/api/admin/milestones-with-clients"],
  });

  const { data: paymentSettings } = useQuery<PaymentSettings>({
    queryKey: ["/api/admin/payment-settings"],
  });

  const { data: developmentLogs } = useQuery<MaintenanceLogWithCosts[]>({
    queryKey: [`/api/admin/projects/${selectedProjectId}/maintenance-logs?logType=development`],
    enabled: !!selectedProjectId && isOpen,
  });

  const { data: selectedClient } = useQuery<Client>({
    queryKey: ["/api/admin/clients", selectedClientId],
    enabled: !!selectedClientId,
  });

  const clientProjects = useMemo(() => {
    if (!projects || !selectedClientId) return [];
    return projects.filter(p => 
      p.clientId === selectedClientId && 
      p.status !== "hosting"
    );
  }, [projects, selectedClientId]);

  const projectMilestones = useMemo(() => {
    if (!allMilestones || !selectedProjectId) return [];
    return allMilestones.filter(m => m.projectId === selectedProjectId);
  }, [allMilestones, selectedProjectId]);

  const selectedMilestone = useMemo(() => {
    if (!projectMilestones || !selectedMilestoneId) return null;
    return projectMilestones.find(m => m.id === selectedMilestoneId) || null;
  }, [projectMilestones, selectedMilestoneId]);

  // Derive document mode from the selected milestone's status
  const docMode: "invoice" | "reprint" | "receipt" = useMemo(() => {
    if (!selectedMilestone) return "invoice";
    if (selectedMilestone.status === "paid") return "receipt";
    if (selectedMilestone.status === "invoiced" || selectedMilestone.status === "overdue") return "reprint";
    return "invoice";
  }, [selectedMilestone]);

  const selectedProject = useMemo(() => {
    if (!projects || !selectedProjectId) return null;
    return projects.find(p => p.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId]);

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  useEffect(() => {
    setSelectedMilestoneId(null);
    setSelectedLogIds(new Set());
  }, [selectedProjectId]);

  useEffect(() => {
    if (developmentLogs) {
      setSelectedLogIds(new Set(developmentLogs.map(l => l.id)));
    }
  }, [developmentLogs]);

  const today = new Date();
  const form = useForm<DevelopmentInvoiceFormData>({
    resolver: zodResolver(developmentInvoiceFormSchema),
    defaultValues: {
      invoiceDate: format(today, "yyyy-MM-dd"),
      dueDate: format(addDays(today, 7), "yyyy-MM-dd"),
      notes: "",
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (payload: { 
      clientId: number; 
      projectId: number;
      milestoneId: number;
      invoiceDate: string;
      dueDate: string;
      notes?: string;
    }) => {
      const res = await apiRequest("POST", "/api/admin/invoices/development", payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones-with-clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestones"] });
      onSuccess?.(data.invoiceNumber);
    },
  });

  const onSubmit = async (formData: DevelopmentInvoiceFormData) => {
    if (!selectedClientId || !selectedClient) {
      toast({ title: "Please select a client", variant: "destructive" });
      return;
    }
    if (!selectedProjectId || !selectedProject) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    if (!selectedMilestoneId || !selectedMilestone) {
      toast({ title: "Please select a milestone", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const filteredLogs = developmentLogs?.filter(l => selectedLogIds.has(l.id));

      if (docMode === "receipt") {
        // Paid milestone → generate a Receipt of Services (no API call)
        const receiptRef = selectedMilestone.invoiceRef || `RCP-${selectedMilestoneId}`;
        const doc = generateReceiptPDF(
          formData,
          receiptRef,
          selectedClient,
          selectedProject,
          selectedMilestone,
          filteredLogs
        );
        doc.save(`Receipt-${receiptRef}.pdf`);
        toast({ title: "Receipt of services generated" });

      } else if (docMode === "reprint") {
        // Invoiced/overdue milestone → reprint existing invoice (no API call)
        const invoiceRef = selectedMilestone.invoiceRef || `INV-${selectedMilestoneId}`;
        const doc = generateDevelopmentInvoicePDF(
          formData,
          invoiceRef,
          selectedClient,
          selectedProject,
          selectedMilestone,
          paymentSettings,
          filteredLogs
        );
        doc.save(`${invoiceRef}.pdf`);
        toast({ title: "Invoice reprinted successfully" });

      } else {
        // Planned milestone → create invoice record, then generate PDF
        const result = await createInvoiceMutation.mutateAsync({
          clientId: selectedClientId,
          projectId: selectedProjectId,
          milestoneId: selectedMilestoneId,
          invoiceDate: formData.invoiceDate,
          dueDate: formData.dueDate || "",
          notes: formData.notes,
        });
        const doc = generateDevelopmentInvoicePDF(
          formData,
          result.invoiceNumber,
          selectedClient,
          selectedProject,
          selectedMilestone,
          paymentSettings,
          filteredLogs
        );
        doc.save(`${result.invoiceNumber}.pdf`);
        toast({ title: "Development invoice generated successfully" });
        onSuccess?.(result.invoiceNumber);
      }

      setIsOpen(false);
      form.reset();
      setSelectedMilestoneId(null);
      setSelectedLogIds(new Set());
      if (!initialProjectId) setSelectedProjectId(null);
      if (!initialClientId) setSelectedClientId(null);
    } catch (error) {
      toast({ 
        title: "Failed to generate document", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const activeClients = useMemo(() => {
    if (!clients) return [];
    return clients.filter(c => c.status === "active" || c.status === "lead");
  }, [clients]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {docMode === "receipt"
              ? <><CheckCircle2 className="h-5 w-5 text-green-600" /> Generate Receipt of Services</>
              : docMode === "reprint"
              ? <><Receipt className="h-5 w-5 text-blue-500" /> Reprint Invoice</>
              : <><Briefcase className="h-5 w-5" /> Generate Development Invoice</>
            }
          </DialogTitle>
          <DialogDescription>
            {docMode === "receipt"
              ? "This milestone is marked as paid. A receipt of services will be generated."
              : docMode === "reprint"
              ? "Reprint the existing invoice for this invoiced milestone."
              : "Create an invoice for a planned project milestone."
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!initialClientId && (
              <div className="space-y-2">
                <Label>Client</Label>
                {clientsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={selectedClientId?.toString() || ""}
                    onValueChange={(v) => {
                      setSelectedClientId(parseInt(v));
                      setSelectedProjectId(null);
                      setSelectedMilestoneId(null);
                    }}
                  >
                    <SelectTrigger data-testid="select-dev-invoice-client">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeClients.map((client) => (
                        <SelectItem key={client.id} value={client.id.toString()}>
                          {client.companyName || client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {selectedClientId && !initialProjectId && (
              <div className="space-y-2">
                <Label>Project</Label>
                {projectsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : clientProjects.length === 0 ? (
                  <Card>
                    <CardContent className="py-4 text-center text-muted-foreground">
                      No development projects found for this client
                    </CardContent>
                  </Card>
                ) : (
                  <Select
                    value={selectedProjectId?.toString() || ""}
                    onValueChange={(v) => {
                      setSelectedProjectId(parseInt(v));
                      setSelectedMilestoneId(null);
                    }}
                  >
                    <SelectTrigger data-testid="select-dev-invoice-project">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {selectedProjectId && (
              <div className="space-y-2">
                <Label>Milestone</Label>
                {milestonesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : projectMilestones.length === 0 ? (
                  <Card>
                    <CardContent className="py-4 text-center text-muted-foreground">
                      No available milestones for this project
                    </CardContent>
                  </Card>
                ) : (
                  <Select
                    value={selectedMilestoneId?.toString() || ""}
                    onValueChange={(v) => setSelectedMilestoneId(parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-dev-invoice-milestone">
                      <SelectValue placeholder="Select a milestone" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectMilestones.map((milestone) => {
                        const statusLabel =
                          milestone.status === "paid" ? " ✓ Paid"
                          : milestone.status === "invoiced" ? " · Invoiced"
                          : milestone.status === "overdue" ? " · Overdue"
                          : "";
                        return (
                          <SelectItem key={milestone.id} value={milestone.id.toString()}>
                            {milestone.name} — ${(milestone.amountCents / 100).toLocaleString()}{statusLabel}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {selectedMilestone && (
              <>
                <Card className="bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{selectedMilestone.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedProject?.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold font-mono">
                          USD ${(selectedMilestone.amountCents / 100).toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          ≈ HKD ${((selectedMilestone.amountCents / 100) * DEFAULT_USD_TO_HKD_RATE).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {developmentLogs && developmentLogs.length > 0 && (
                  <div className="space-y-2" data-testid="dev-logs-selection">
                    <div className="flex items-center justify-between">
                      <Label>Development Logs to Include</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setSelectedLogIds(new Set(developmentLogs.map(l => l.id)))}
                          data-testid="button-select-all-logs"
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setSelectedLogIds(new Set())}
                          data-testid="button-deselect-all-logs"
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    <Card>
                      <CardContent className="p-0 max-h-48 overflow-y-auto divide-y">
                        {[...developmentLogs]
                          .sort((a, b) => new Date(a.logDate).getTime() - new Date(b.logDate).getTime())
                          .map((log) => {
                            let logCost = log.estimatedCostCents || 0;
                            if ((log as MaintenanceLogWithCosts).additionalCosts) {
                              logCost += (log as MaintenanceLogWithCosts).additionalCosts!.reduce((sum, c) => sum + c.costCents, 0);
                            }
                            return (
                              <label
                                key={log.id}
                                className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                                data-testid={`log-select-${log.id}`}
                              >
                                <Checkbox
                                  checked={selectedLogIds.has(log.id)}
                                  onCheckedChange={(checked) => {
                                    const next = new Set(selectedLogIds);
                                    if (checked) {
                                      next.add(log.id);
                                    } else {
                                      next.delete(log.id);
                                    }
                                    setSelectedLogIds(next);
                                  }}
                                  className="mt-0.5"
                                  data-testid={`checkbox-log-${log.id}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{log.description}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{format(new Date(log.logDate), "MMM d, yyyy")}</span>
                                    {log.minutesSpent > 0 && (
                                      <span>
                                        {Math.floor(log.minutesSpent / 60) > 0
                                          ? `${Math.floor(log.minutesSpent / 60)}h ${log.minutesSpent % 60}m`
                                          : `${log.minutesSpent}m`}
                                      </span>
                                    )}
                                    {logCost > 0 && (
                                      <span className="font-mono">${(logCost / 100).toFixed(2)}</span>
                                    )}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                      </CardContent>
                    </Card>
                    <p className="text-xs text-muted-foreground" data-testid="text-selected-logs-count">
                      {selectedLogIds.size} of {developmentLogs.length} log{developmentLogs.length !== 1 ? 's' : ''} selected for {docMode === "receipt" ? "receipt" : "invoice"}
                    </p>
                  </div>
                )}

                {/* Paid milestone notice */}
                {docMode === "receipt" && (
                  <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Payment received — this will generate a <strong>Receipt of Services</strong></span>
                  </div>
                )}
                {docMode === "reprint" && (
                  <div className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
                    <Receipt className="h-4 w-4 shrink-0" />
                    <span>Invoice already issued (<strong>{selectedMilestone?.invoiceRef || "ref pending"}</strong>) — reprinting with today's date</span>
                  </div>
                )}

                <div className={docMode === "receipt" ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
                  <FormField
                    control={form.control}
                    name="invoiceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{docMode === "receipt" ? "Receipt Date" : "Invoice Date"}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-dev-invoice-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {docMode !== "receipt" && (
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-dev-due-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder={docMode === "receipt" ? "Additional notes for the receipt" : "Additional notes for the invoice"}
                          {...field} 
                          data-testid="input-dev-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className={`w-full ${docMode === "receipt" ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                  disabled={isGenerating}
                  data-testid="button-generate-dev-invoice"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : docMode === "receipt" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Generate Receipt of Services
                    </>
                  ) : docMode === "reprint" ? (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Reprint Invoice
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Generate Invoice
                    </>
                  )}
                </Button>
              </>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
