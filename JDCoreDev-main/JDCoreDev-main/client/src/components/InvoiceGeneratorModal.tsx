import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download } from "lucide-react";
import type { Project, Client, Milestone, PaymentSettings, MaintenanceLog } from "@shared/schema";
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
const USD_TO_HKD_RATE = 7.8; // Approximate exchange rate

function generateInvoicePDF(
  data: InvoiceFormData,
  project: Project & { client: Client },
  milestones: Milestone[],
  currentMilestone: Milestone,
  paymentSettings?: PaymentSettings,
  developmentLogs?: MaintenanceLog[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const footerHeight = 35; // Reserve space for footer
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
    const footerY = pageHeight - 25;
    doc.setFillColor(...BRAND_TEAL);
    doc.rect(0, footerY - 10, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Thank you for your business!", pageWidth / 2, footerY, { align: "center" });
    doc.text("JD CoreDev | joshuadeacon888@gmail.com | Hong Kong", pageWidth / 2, footerY + 7, { align: "center" });
  };

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

  let billToY = 55;
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO:", pageWidth - margin - 60, billToY);
  doc.setFont("helvetica", "normal");
  billToY += 6;
  const billToMaxWidth = 58;
  // Company name with wrapping
  const companyNameLines = doc.splitTextToSize(project.client.companyName || project.client.name, billToMaxWidth);
  companyNameLines.forEach((line: string) => {
    doc.text(line, pageWidth - margin - 60, billToY);
    billToY += 5;
  });
  // Use accounts department contact if available, otherwise use main client contact
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

  // Dynamic header height - ensure content starts below BILL TO section
  y = Math.max(110, billToY + 10);
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
  const projectHeaderLines = doc.splitTextToSize(project.name, 60);
  doc.text(projectHeaderLines[0], pageWidth / 2 + 30, y + 18);
  if (projectHeaderLines.length > 1) {
    doc.text(projectHeaderLines[1], pageWidth / 2 + 30, y + 22);
  }

  y += 35;

  if (paidMilestones.length > 0) {
    checkPageBreak(20 + paidMilestones.length * 6);
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
      checkPageBreak(8);
      const paidMilestoneNameLines = doc.splitTextToSize(m.name, 90);
      paidMilestoneNameLines.forEach((line: string, idx: number) => {
        if (idx > 0) checkPageBreak(5);
        doc.text(line, margin + 5, y);
        if (idx < paidMilestoneNameLines.length - 1) y += 4;
      });
      if (m.paidDate) {
        doc.text(`Paid ${format(new Date(m.paidDate), "MMM d, yyyy")}`, margin + 100, y);
      }
      doc.text(`USD $${(m.amountCents / 100).toLocaleString()}`, pageWidth - margin - 25, y, { align: "right" });
      y += 6;
    });

    const totalPaid = paidMilestones.reduce((sum, m) => sum + m.amountCents, 0);
    doc.setFont("helvetica", "bold");
    doc.text("Total Previously Paid:", margin + 5, y + 2);
    doc.text(`USD $${(totalPaid / 100).toLocaleString()}`, pageWidth - margin - 25, y + 2, { align: "right" });
    y += 12;
  }

  checkPageBreak(40);
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
  const milestoneNameLines = doc.splitTextToSize(currentMilestone.name, contentWidth - 80);
  doc.text(milestoneNameLines[0], margin + 5, y + 6);
  if (milestoneNameLines.length > 1) {
    doc.text(milestoneNameLines[1], margin + 5, y + 10);
  }
  // Use the invoice due date (from form) instead of milestone's original due date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const dueTextY = milestoneNameLines.length > 1 ? y + 14 : y + 12;
  doc.text(`Due: ${format(new Date(data.dueDate), "MMMM d, yyyy")}`, margin + 5, dueTextY);
  
  // Show USD amount with HKD equivalent for current milestone
  const usdAmount = currentMilestone.amountCents / 100;
  const hkdAmount = usdAmount * USD_TO_HKD_RATE;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`USD $${usdAmount.toLocaleString()}`, pageWidth - margin - 25, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`(approx. HKD $${hkdAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })})`, pageWidth - margin - 25, y + 12, { align: "right" });
  doc.setTextColor(...BRAND_DARK);
  y += 22;

  // Display milestone notes prominently right after the current milestone
  if (currentMilestone.notes) {
    checkPageBreak(15);
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Milestone Description:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 5;
    const milestoneNoteLines = doc.splitTextToSize(currentMilestone.notes, contentWidth - 10);
    milestoneNoteLines.forEach((line: string) => {
      checkPageBreak(5);
      doc.text(line, margin + 5, y);
      y += 5;
    });
    y += 3;
  }

  if (futureMilestones.length > 0) {
    checkPageBreak(20 + futureMilestones.length * 6);
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
      checkPageBreak(8);
      const futureMilestoneNameLines = doc.splitTextToSize(m.name, 90);
      futureMilestoneNameLines.forEach((line: string, idx: number) => {
        if (idx > 0) checkPageBreak(5);
        doc.text(line, margin + 5, y);
        if (idx < futureMilestoneNameLines.length - 1) y += 4;
      });
      if (m.dueDate) {
        doc.text(`Due ${format(new Date(m.dueDate), "MMM d, yyyy")}`, margin + 100, y);
      }
      doc.text(`USD $${(m.amountCents / 100).toLocaleString()}`, pageWidth - margin - 25, y, { align: "right" });
      y += 6;
    });

    const totalFuture = futureMilestones.reduce((sum, m) => sum + m.amountCents, 0);
    doc.setFont("helvetica", "bold");
    doc.text("Total Remaining:", margin + 5, y + 2);
    doc.text(`USD $${(totalFuture / 100).toLocaleString()}`, pageWidth - margin - 25, y + 2, { align: "right" });
    y += 12;
  }

  doc.setTextColor(...BRAND_DARK);
  y += 5;
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
  doc.text(`TOTAL DUE: USD $${usdAmount.toLocaleString()}`, pageWidth - margin - 90, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`(approx. HKD $${hkdAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })})`, pageWidth - margin - 90, y + 12);

  // Add dates are estimates disclaimer
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

  // Add second page with payment details if payment settings exist
  if (paymentSettings && (paymentSettings.bankName || paymentSettings.accountNumber || paymentSettings.paypalEmail || paymentSettings.zelleEmail)) {
    // Add footer to first page before creating second page
    addFooter();
    doc.addPage();
    let py = 30;

    // Helper for page breaks on payment info page
    const checkPaymentPageBreak = (requiredSpace: number) => {
      if (py + requiredSpace > maxY) {
        addFooter();
        doc.addPage();
        py = 30;
        return true;
      }
      return false;
    };
    
    // Add logo to second page
    try {
      doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 10, 50, 13);
    } catch (e) {
      // Fallback if logo fails
    }

    doc.setTextColor(...BRAND_DARK);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT INFORMATION", margin, py);
    
    py += 15;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice Reference: ${data.invoiceNumber}`, margin, py);
    py += 5;
    doc.text(`Amount Due: USD $${usdAmount.toLocaleString()} (approx. HKD $${hkdAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })})`, margin, py);
    
    py += 20;

    // Helper for adding payment line with page break check and text wrapping
    const addPaymentInfoLine = (label: string, value: string) => {
      const maxValueWidth = contentWidth - 45;
      const valueLines = doc.splitTextToSize(value, maxValueWidth);
      valueLines.forEach((line: string, i: number) => {
        checkPaymentPageBreak(10);
        if (i === 0) {
          doc.setFont("helvetica", "bold");
          doc.text(label, margin, py);
        }
        doc.setFont("helvetica", "normal");
        doc.text(line, margin + 40, py);
        py += 7;
      });
    };

    // Bank Transfer Section
    if (paymentSettings.bankName || paymentSettings.accountNumber) {
      checkPaymentPageBreak(25);
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, py - 5, contentWidth, 10, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Bank Transfer", margin + 5, py + 2);
      py += 15;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      
      if (paymentSettings.accountHolderName) addPaymentInfoLine("Account Name:", paymentSettings.accountHolderName);
      if (paymentSettings.bankName) addPaymentInfoLine("Bank:", paymentSettings.bankName);
      if (paymentSettings.accountNumber) addPaymentInfoLine("Account Number:", paymentSettings.accountNumber);
      if (paymentSettings.routingNumber) addPaymentInfoLine("Routing Number:", paymentSettings.routingNumber);
      if (paymentSettings.swiftCode) addPaymentInfoLine("SWIFT Code:", paymentSettings.swiftCode);
      if (paymentSettings.iban) addPaymentInfoLine("IBAN:", paymentSettings.iban);
      py += 10;
    }

    // Digital Payments Section
    if (paymentSettings.paypalEmail || paymentSettings.zelleEmail || paymentSettings.venmoUsername || paymentSettings.cashappTag || paymentSettings.stripePaymentLink) {
      checkPaymentPageBreak(25);
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, py - 5, contentWidth, 10, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Digital Payments", margin + 5, py + 2);
      py += 15;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);

      if (paymentSettings.paypalEmail) addPaymentInfoLine("PayPal:", paymentSettings.paypalEmail);
      if (paymentSettings.zelleEmail) addPaymentInfoLine("Zelle:", paymentSettings.zelleEmail);
      if (paymentSettings.venmoUsername) addPaymentInfoLine("Venmo:", `@${paymentSettings.venmoUsername}`);
      if (paymentSettings.cashappTag) addPaymentInfoLine("CashApp:", `$${paymentSettings.cashappTag}`);
      if (paymentSettings.stripePaymentLink) addPaymentInfoLine("Pay Online:", paymentSettings.stripePaymentLink);
      py += 10;
    }

    // Crypto Section
    if (paymentSettings.bitcoinAddress || paymentSettings.ethereumAddress) {
      checkPaymentPageBreak(25);
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, py - 5, contentWidth, 10, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Cryptocurrency", margin + 5, py + 2);
      py += 15;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);

      if (paymentSettings.bitcoinAddress) addPaymentInfoLine("Bitcoin (BTC):", paymentSettings.bitcoinAddress);
      if (paymentSettings.ethereumAddress) addPaymentInfoLine("Ethereum (ETH):", paymentSettings.ethereumAddress);
      py += 10;
    }

    // Check Section
    if (paymentSettings.checkPayableTo) {
      checkPaymentPageBreak(25);
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, py - 5, contentWidth, 10, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Check Payment", margin + 5, py + 2);
      py += 15;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);

      addPaymentInfoLine("Make Payable To:", paymentSettings.checkPayableTo);

      if (paymentSettings.mailingAddress) {
        checkPaymentPageBreak(10);
        doc.setFont("helvetica", "bold");
        doc.text("Mail To:", margin, py);
        doc.setFont("helvetica", "normal");
        const addrLines = doc.splitTextToSize(paymentSettings.mailingAddress, contentWidth - 50);
        doc.text(addrLines[0] || "", margin + 45, py);
        py += 7;
        for (let i = 1; i < addrLines.length; i++) {
          checkPaymentPageBreak(7);
          doc.text(addrLines[i], margin + 45, py);
          py += 7;
        }
      }
      py += 10;
    }

    // Payment Notes
    if (paymentSettings.paymentNotes) {
      checkPaymentPageBreak(20);
      py += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Payment Notes:", margin, py);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      py += 6;
      const noteLines = doc.splitTextToSize(paymentSettings.paymentNotes, contentWidth);
      noteLines.forEach((line: string) => {
        checkPaymentPageBreak(6);
        doc.text(line, margin, py);
        py += 5;
      });
    }

    // Important reminder - position at bottom of current content or at a reasonable spot
    checkPaymentPageBreak(20);
    py += 15;
    doc.setFillColor(255, 248, 220);
    doc.rect(margin, py - 5, contentWidth, 15, 'F');
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("IMPORTANT: Please include invoice number in payment reference.", margin + 5, py + 3);
  }

  if (developmentLogs && developmentLogs.length > 0) {
    addFooter();
    doc.addPage();
    let ly = 20;

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
    doc.text(`Project: ${project.name}  |  Invoice: ${data.invoiceNumber}`, margin, 26);

    ly = 35;

    const colDate = margin;
    const colDesc = margin + 28;
    const colTime = pageWidth - margin - 40;
    const colCost = pageWidth - margin - 5;
    const descWidth = colTime - colDesc - 5;

    const addLogTableHeader = () => {
      doc.setFillColor(...BRAND_TEAL);
      doc.rect(margin, ly, contentWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("DATE", colDate + 2, ly + 5.5);
      doc.text("DESCRIPTION", colDesc, ly + 5.5);
      doc.text("TIME", colTime, ly + 5.5, { align: "right" });
      doc.text("EXT. COSTS", colCost, ly + 5.5, { align: "right" });
      ly += 12;
    };

    addLogTableHeader();

    let totalMinutes = 0;
    let totalCostCents = 0;

    const sortedLogs = [...developmentLogs].sort((a, b) => 
      new Date(a.logDate).getTime() - new Date(b.logDate).getTime()
    );

    sortedLogs.forEach((log, index) => {
      const descLines = doc.splitTextToSize(log.description, descWidth);
      const rowHeight = Math.max(descLines.length * 4 + 2, 6);
      
      if (ly + rowHeight + 4 > maxY) {
        addFooter();
        doc.addPage();
        ly = 30;
        addLogTableHeader();
      }

      if (index % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(margin, ly - 2, contentWidth, rowHeight + 2, 'F');
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND_DARK);

      const logDate = format(new Date(log.logDate), "MMM d, yyyy");
      doc.text(logDate, colDate + 2, ly + 2);

      doc.setTextColor(60, 60, 60);
      descLines.forEach((line: string, i: number) => {
        doc.text(line, colDesc, ly + 2 + (i * 4));
      });

      const hours = Math.floor(log.minutesSpent / 60);
      const mins = log.minutesSpent % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      doc.setTextColor(...BRAND_DARK);
      doc.text(timeStr, colTime, ly + 2, { align: "right" });

      const logCost = log.estimatedCostCents || 0;
      const costStr = `$${(logCost / 100).toFixed(2)}`;
      doc.text(costStr, colCost, ly + 2, { align: "right" });

      totalMinutes += log.minutesSpent;
      totalCostCents += logCost;

      ly += rowHeight + 1;
    });

    ly += 3;
    if (ly + 15 > maxY) {
      addFooter();
      doc.addPage();
      ly = 30;
    }
    doc.setDrawColor(...BRAND_TEAL);
    doc.setLineWidth(0.8);
    doc.line(margin, ly, pageWidth - margin, ly);
    ly += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_DARK);
    doc.text("TOTALS", colDate + 2, ly);
    doc.text(`${developmentLogs.length} entries`, colDesc, ly);

    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;
    const totalTimeStr = totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`;
    doc.text(totalTimeStr, colTime, ly, { align: "right" });
    doc.text(`$${(totalCostCents / 100).toFixed(2)}`, colCost, ly, { align: "right" });
  }

  // Add footer to the last page
  addFooter();

  return doc;
}

export function InvoiceGeneratorModal({ project, milestones, currentMilestone, trigger }: InvoiceGeneratorModalProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: paymentSettings } = useQuery<PaymentSettings>({
    queryKey: ["/api/admin/payment-settings"],
  });

  const { data: developmentLogs, isLoading: logsLoading } = useQuery<MaintenanceLog[]>({
    queryKey: [`/api/admin/projects/${project.id}/maintenance-logs?logType=development`],
    enabled: open,
  });

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
      notes: currentMilestone.notes || "",
    },
  });

  const onSubmit = (data: InvoiceFormData) => {
    try {
      const doc = generateInvoicePDF(data, project, milestones, currentMilestone, paymentSettings, developmentLogs);
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
          {developmentLogs && developmentLogs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 border-t pt-2" data-testid="dev-logs-count">
              <FileText className="h-3 w-3 inline mr-1" />
              {developmentLogs.length} development log{developmentLogs.length !== 1 ? 's' : ''} will be included
            </p>
          )}
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
                  <FormLabel>
                    Additional Notes
                    {currentMilestone.notes && (
                      <span className="text-xs text-muted-foreground ml-2">(Pre-filled from milestone)</span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Payment terms, bank details, milestone description..." 
                      className="min-h-[80px] resize-none"
                      data-testid="input-invoice-notes" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={logsLoading} data-testid="button-download-invoice">
                <Download className="h-4 w-4 mr-2" />
                {logsLoading ? "Loading logs..." : "Download Invoice"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
