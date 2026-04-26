import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { jsPDF } from "jspdf";
import { format, addDays, parse } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { currencySymbol, convertUSDCents, DEFAULT_USD_FX_RATES } from "@shared/currency";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileText, Download, Loader2, Server, Check } from "lucide-react";
import type { Project, Client, ProjectHostingTerms, PaymentSettings } from "@shared/schema";
import { JDCOREDEV_LOGO_BASE64 } from "@/lib/logo-base64";

const hostingInvoiceFormSchema = z.object({
  invoiceDate: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  billingPeriod: z.string().min(1, "Billing period is required"),
  notes: z.string().optional(),
});

type HostingInvoiceFormData = z.infer<typeof hostingInvoiceFormSchema>;

type ProjectWithHostingTerms = Project & { 
  hostingTerms?: ProjectHostingTerms | null;
  client?: Client;
};

interface MaintenanceLogEntry {
  id: number;
  logDate: string;
  minutesSpent: number;
  description: string;
  totalCostCents: number;
  category: string | null;
  logType: string;
}

interface ProjectMaintenanceData {
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
  projects: Record<number, ProjectMaintenanceData>;
  aggregated: AggregatedMaintenanceData;
}

type MaintenanceInvoiceData = Record<number, ProjectMaintenanceData>;

interface HostingInvoiceGeneratorDialogProps {
  clientId?: number;
  trigger: React.ReactNode;
  onSuccess?: (invoiceNumber: string) => void;
}

const BRAND_TEAL = [0, 128, 128] as const;
const BRAND_DARK = [30, 30, 30] as const;
const DEFAULT_USD_TO_HKD_RATE = 7.8;

function parseBillingPeriod(billingPeriod: string): { year: number; month: number } | null {
  const formats = ["MMMM yyyy", "MMM yyyy", "MMMM, yyyy", "MMM, yyyy", "MM/yyyy", "yyyy-MM"];
  for (const fmt of formats) {
    try {
      const parsed = parse(billingPeriod.trim(), fmt, new Date());
      if (!isNaN(parsed.getTime())) {
        return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
      }
    } catch {}
  }
  const match = billingPeriod.match(/(\w+)\s+(\d{4})/);
  if (match) {
    const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const shortNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const name = match[1].toLowerCase();
    let monthIdx = monthNames.indexOf(name);
    if (monthIdx === -1) monthIdx = shortNames.indexOf(name);
    if (monthIdx !== -1) {
      return { year: parseInt(match[2]), month: monthIdx + 1 };
    }
  }
  return null;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function getPaymentMethodsText(settings: PaymentSettings | undefined): string {
  if (!settings) return "Bank Transfer, PayPal, Wise";
  
  const methods: string[] = [];
  if (settings.bankName) methods.push("Bank Transfer");
  if (settings.paypalEmail) methods.push("PayPal");
  if (settings.venmoUsername) methods.push("Venmo");
  if (settings.cashappTag) methods.push("Cash App");
  if (settings.zelleEmail) methods.push("Zelle");
  if (settings.stripePaymentLink) methods.push("Credit/Debit Card (Stripe)");
  if (settings.bitcoinAddress) methods.push("Bitcoin");
  if (settings.ethereumAddress) methods.push("Ethereum");
  if (settings.checkPayableTo) methods.push("Check");
  
  return methods.length > 0 ? methods.join(", ") : "Bank Transfer, PayPal, Wise";
}

function generateHostingInvoicePDF(
  data: HostingInvoiceFormData,
  invoiceNumber: string,
  client: Client,
  selectedProjects: ProjectWithHostingTerms[],
  paymentSettings?: PaymentSettings,
  maintenanceData?: MaintenanceInvoiceData,
  aggregatedData?: AggregatedMaintenanceData
) {
  const doc = new jsPDF();
  // All primary amounts on the invoice are USD. The client's "local
  // currency" (clients.invoiceCurrency) is shown as a secondary "≈"
  // line for the convenience of clients who think in their own
  // currency. paymentSettings.usdToHkdRate overrides the static map for
  // HKD specifically; everything else uses DEFAULT_USD_FX_RATES.
  const localCurrency = (client.invoiceCurrency || "USD").toUpperCase();
  const showLocal = localCurrency !== "USD";
  const localSym = currencySymbol(localCurrency);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const footerHeight = 25;
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
    const footerY = pageHeight - 15;
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text("Thank you for your business!", pageWidth / 2, footerY, { align: "center" });
    doc.text("JD CoreDev - Custom Software Development & Consulting", pageWidth / 2, footerY + 5, { align: "center" });
  };

  const usdToHkdRate = paymentSettings?.usdToHkdRate
    ? parseFloat(paymentSettings.usdToHkdRate)
    : DEFAULT_USD_TO_HKD_RATE;

  // FX rate for the client's secondary display currency. Look-up order:
  //   1. paymentSettings.fxRates[CODE] — user-editable on the Payment
  //      Settings page, lets the user keep rates current.
  //   2. paymentSettings.usdToHkdRate (legacy single-currency override
  //      that pre-dated the JSON column).
  //   3. DEFAULT_USD_FX_RATES from shared/currency.ts (static fallback).
  const fxOverride = (paymentSettings?.fxRates as Record<string, number> | null | undefined)?.[localCurrency];
  const fxAuto = (paymentSettings?.fxRatesAuto as Record<string, number> | null | undefined)?.[localCurrency];
  const localFxRate =
    fxOverride && fxOverride > 0
      ? fxOverride
      : fxAuto && fxAuto > 0
      ? fxAuto
      : localCurrency === "HKD"
      ? usdToHkdRate
      : (DEFAULT_USD_FX_RATES[localCurrency] ?? 1);

  const hostingFeeCents = selectedProjects.reduce((sum, p) =>
    sum + (p.hostingTerms?.monthlyFeeCents || 0), 0
  );

  const totalOverageCents = aggregatedData ? aggregatedData.finalOverageCents : 0;

  const totalCents = hostingFeeCents + totalOverageCents;
  const totalUSD = totalCents / 100;
  const totalLocal = totalUSD * localFxRate;

  try {
    doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 60, 16);
  } catch (e) {}

  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("HOSTING INVOICE", pageWidth - margin - 75, 20);

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
  y = Math.max(110, billToY + 10);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, contentWidth, 24, 'F');
  
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
  doc.text("Period:", pageWidth / 2 + 10, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(data.billingPeriod, pageWidth / 2 + 30, y + 16);

  y = 145;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("MONTHLY HOSTING SERVICES", margin + 5, y + 7);

  y += 18;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Project", margin + 5, y);
  doc.text("Service", margin + 75, y);
  doc.text("Monthly Fee", pageWidth - margin - 25, y, { align: "right" });

  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  selectedProjects.forEach((project) => {
    checkPageBreak(15);
    const fee = (project.hostingTerms?.monthlyFeeCents || 0) / 100;
    
    doc.setFont("helvetica", "bold");
    const projectTableNameLines = doc.splitTextToSize(project.name, 65);
    doc.text(projectTableNameLines[0], margin + 5, y);
    if (projectTableNameLines.length > 1) {
      y += 4;
      doc.text(projectTableNameLines[1], margin + 5, y);
    }
    doc.setFont("helvetica", "normal");
    doc.text("Monthly Hosting & Support", margin + 75, y);
    doc.text(`USD $${fee.toLocaleString()}`, pageWidth - margin - 25, y, { align: "right" });
    
    y += 5;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    const services = ["Infrastructure & Database", "Security & Updates", "Technical Support"];
    services.forEach((service) => {
      checkPageBreak(6);
      doc.text(`• ${service}`, margin + 77, y);
      y += 4;
    });
    doc.setTextColor(...BRAND_DARK);
    doc.setFontSize(9);
    y += 4;
  });

  // Maintenance / External Costs Section
  if (maintenanceData) {
    const projectIdsWithLogs = Object.keys(maintenanceData).map(Number).filter(
      id => maintenanceData[id].logs.length > 0
    );

    if (projectIdsWithLogs.length > 0) {
      y += 8;
      checkPageBreak(20);
      doc.setFillColor(...BRAND_TEAL);
      doc.rect(margin, y, contentWidth, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("EXTERNAL COSTS - MAINTENANCE & SUPPORT WORK", margin + 5, y + 7);
      y += 18;

      let grandTotalMinutes = 0;
      let grandTotalCostCents = 0;
      let grandTotalOverageCents = 0;

      for (const projectId of projectIdsWithLogs) {
        const projData = maintenanceData[projectId];
        grandTotalMinutes += projData.totalMinutes;
        grandTotalCostCents += projData.totalCostCents;
        grandTotalOverageCents += projData.overageCents;

        checkPageBreak(20);
        doc.setTextColor(...BRAND_DARK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        const projNameLines = doc.splitTextToSize(projData.projectName, contentWidth - 10);
        projNameLines.forEach((line: string) => {
          doc.text(line, margin + 5, y);
          y += 5;
        });

        y += 2;
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 80, 80);
        doc.text("Date", margin + 5, y);
        doc.text("Description", margin + 30, y);
        doc.text("Time", pageWidth - margin - 45, y, { align: "right" });
        doc.text("Cost (USD)", pageWidth - margin - 5, y, { align: "right" });
        y += 3;
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.line(margin + 5, y, pageWidth - margin - 5, y);
        y += 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);

        for (const log of projData.logs) {
          checkPageBreak(10);
          const logDate = format(new Date(log.logDate), "MMM d");
          doc.text(logDate, margin + 5, y);

          const descMaxWidth = pageWidth - margin - 100;
          const descLines = doc.splitTextToSize(log.description, descMaxWidth);
          doc.text(descLines[0], margin + 30, y);

          doc.text(formatMinutes(log.minutesSpent), pageWidth - margin - 45, y, { align: "right" });
          const logCost = (log.totalCostCents / 100).toFixed(2);
          doc.text(`$${logCost}`, pageWidth - margin - 5, y, { align: "right" });
          y += 4;

          if (descLines.length > 1) {
            for (let i = 1; i < Math.min(descLines.length, 3); i++) {
              checkPageBreak(5);
              doc.text(descLines[i], margin + 30, y);
              y += 4;
            }
          }
          y += 1;
        }

        y += 2;
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.line(margin + 5, y, pageWidth - margin - 5, y);
        y += 5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...BRAND_DARK);
        doc.text(`Total: ${formatMinutes(projData.totalMinutes)} spent`, margin + 5, y);
        doc.text(`$${(projData.totalCostCents / 100).toFixed(2)}`, pageWidth - margin - 5, y, { align: "right" });
        y += 5;

        if (projData.budgetMinutes !== null) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(100, 100, 100);
          doc.text(`Time Budget: ${formatMinutes(projData.budgetMinutes)}`, margin + 5, y);
          y += 4;

          const overtimeMins = Math.max(0, projData.totalMinutes - projData.budgetMinutes);
          if (projData.overageCents > 0) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(180, 50, 50);
            const hours = (overtimeMins / 60).toFixed(2);
            const overageUSD = (projData.overageCents / 100).toFixed(2);
            doc.text(`Time Overage: ${hours}h @ $30/hr = $${overageUSD}`, margin + 5, y);
            y += 4;
          } else {
            doc.setTextColor(50, 150, 50);
            doc.text("Within budget", margin + 5, y);
            y += 4;
          }
        }

        if (projData.budgetCents !== null) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(100, 100, 100);
          const budgetUSD = (projData.budgetCents / 100).toFixed(2);
          doc.text(`Cost Budget (informational): $${budgetUSD}`, margin + 5, y);
          y += 4;
        }

        y += 6;
      }

      checkPageBreak(35);
      doc.setFillColor(245, 245, 245);
      const summaryBoxHeight = aggregatedData && totalOverageCents > 0 ? 26 : 18;
      doc.rect(margin, y, contentWidth, summaryBoxHeight, 'F');
      doc.setTextColor(...BRAND_DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`MAINTENANCE & SUPPORT SUMMARY (All Client Projects)`, margin + 5, y + 6);
      doc.text(`Total Time: ${formatMinutes(grandTotalMinutes)}`, margin + 5, y + 13);
      doc.text(`Total External Costs: $${(grandTotalCostCents / 100).toFixed(2)}`, pageWidth / 2, y + 6);
      if (aggregatedData) {
        if (aggregatedData.totalBudgetMinutes !== null) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(100, 100, 100);
          doc.text(`Combined Time Budget: ${formatMinutes(aggregatedData.totalBudgetMinutes)}`, pageWidth / 2, y + 13);
        }
        if (totalOverageCents > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(180, 50, 50);
          const overHours = (aggregatedData.overtimeMinutes / 60).toFixed(2);
          doc.text(
            `Time Overage: ${overHours}h @ $${aggregatedData.overtimeRatePerHour}/hr = $${(totalOverageCents / 100).toFixed(2)}`,
            margin + 5,
            y + 20,
          );
        }
      } else if (grandTotalOverageCents > 0) {
        doc.setTextColor(180, 50, 50);
        doc.text(`Time Overage Added to Invoice: $${(grandTotalOverageCents / 100).toFixed(2)}`, pageWidth / 2, y + 13);
      }
      y += summaryBoxHeight + 7;
    }
  }

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
  doc.text(`TOTAL DUE: USD $${totalUSD.toLocaleString()}`, pageWidth - margin - 90, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (showLocal) {
    doc.text(`(approx. ${localCurrency} ${localSym}${totalLocal.toLocaleString(undefined, { maximumFractionDigits: 0 })})`, pageWidth - margin - 90, y + 12);
  }

  if (totalOverageCents > 0) {
    doc.setTextColor(...BRAND_DARK);
    doc.setFontSize(8);
    const hostingFeeUSD = (hostingFeeCents / 100).toLocaleString();
    const overageUSD = (totalOverageCents / 100).toLocaleString();
    doc.text(`Hosting Fees: $${hostingFeeUSD} + Maintenance Overage: $${overageUSD}`, margin, y + 4);
  }

  y += 30;
  checkPageBreak(15);
  doc.setTextColor(...BRAND_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("What's Included:", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const includedItems = [
    "Hosting infrastructure (Replit/Cloud)",
    "PostgreSQL database with backups",
    "File storage & CDN",
    "Security patches & platform updates",
    "Technical support",
    "Performance monitoring"
  ];
  includedItems.forEach((item) => {
    checkPageBreak(5);
    doc.text(`✓ ${item}`, margin + 5, y);
    y += 4;
  });

  y += 5;
  checkPageBreak(15);
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

  // Add footer to last page
  addFooter();

  return doc;
}

export function HostingInvoiceGeneratorDialog({ 
  clientId: initialClientId, 
  trigger, 
  onSuccess 
}: HostingInvoiceGeneratorDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(initialClientId || null);
  const [manualProjectIds, setManualProjectIds] = useState<number[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: clients, isLoading: clientsLoading, error: clientsError } = useQuery<Client[]>({
    queryKey: ["/api/admin/clients"],
    enabled: !initialClientId,
  });

  const { data: projects, isLoading: projectsLoading, error: projectsError } = useQuery<ProjectWithHostingTerms[]>({
    queryKey: ["/api/admin/projects/hosting", selectedClientId],
    enabled: !!selectedClientId,
  });

  const { data: selectedClient, error: selectedClientError } = useQuery<Client>({
    queryKey: ["/api/admin/clients", selectedClientId],
    enabled: !!selectedClientId,
  });

  // Handle errors gracefully
  const hasError = clientsError || projectsError || selectedClientError;
  if (hasError && isOpen) {
    console.error("Hosting invoice dialog error:", clientsError || projectsError || selectedClientError);
  }

  const hostingProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter(p => 
      p.status === "hosting" && 
      p.clientId === selectedClientId &&
      p.hostingTerms?.monthlyFeeCents
    );
  }, [projects, selectedClientId]);

  const selectedProjectIds = useMemo(() => {
    if (manualProjectIds !== null) return manualProjectIds;
    return hostingProjects.map(p => p.id);
  }, [manualProjectIds, hostingProjects]);

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId]);

  const totalAmount = useMemo(() => {
    return hostingProjects
      .filter(p => selectedProjectIds.includes(p.id))
      .reduce((sum, p) => sum + (p.hostingTerms?.monthlyFeeCents || 0), 0);
  }, [hostingProjects, selectedProjectIds]);

  const today = new Date();
  const form = useForm<HostingInvoiceFormData>({
    resolver: zodResolver(hostingInvoiceFormSchema),
    defaultValues: {
      invoiceDate: format(today, "yyyy-MM-dd"),
      dueDate: format(addDays(today, 7), "yyyy-MM-dd"),
      billingPeriod: format(today, "MMMM yyyy"),
      notes: "",
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (payload: { 
      clientId: number; 
      projectIds: number[]; 
      invoiceDate: string;
      dueDate: string;
      billingPeriod: string;
      notes?: string;
      billingYear?: number;
      billingMonth?: number;
    }) => {
      const res = await apiRequest("POST", "/api/admin/invoices/hosting", payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-invoices"] });
      onSuccess?.(data.invoiceNumber);
    },
  });

  const toggleProject = (projectId: number) => {
    const current = manualProjectIds !== null ? manualProjectIds : hostingProjects.map(p => p.id);
    const updated = current.includes(projectId)
      ? current.filter(id => id !== projectId)
      : [...current, projectId];
    setManualProjectIds(updated);
  };

  const onSubmit = async (formData: HostingInvoiceFormData) => {
    if (!selectedClientId || !selectedClient) {
      toast({ title: "Please select a client", variant: "destructive" });
      return;
    }
    if (selectedProjectIds.length === 0) {
      toast({ title: "Please select at least one project", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const billingPeriodParsed = parseBillingPeriod(formData.billingPeriod);

      if (!billingPeriodParsed) {
        toast({ 
          title: "Could not parse billing period", 
          description: "Use format like 'February 2026'. Maintenance logs won't be included.",
          variant: "destructive" 
        });
        setIsGenerating(false);
        return;
      }

      let maintenanceData: MaintenanceInvoiceData | undefined;
      let aggregatedData: AggregatedMaintenanceData | undefined;
      if (billingPeriodParsed) {
        const y = billingPeriodParsed.year;
        const m = billingPeriodParsed.month;
        const bpStartStr = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const bpEndStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const maintenanceRes = await apiRequest("POST", "/api/admin/invoice-maintenance-data", {
          projectIds: selectedProjectIds,
          clientId: selectedClientId,
          startDate: bpStartStr,
          endDate: bpEndStr,
          // Mirror the hosting-invoice creation logic: pull logs from each
          // project's currentCycleStartDate when set, so the PDF reflects the
          // exact same cycle the server will bill against.
          useCycleStart: true,
        });
        const apiResponse: MaintenanceApiResponse = await maintenanceRes.json();
        maintenanceData = apiResponse.projects;
        aggregatedData = apiResponse.aggregated;
      }

      const result = await createInvoiceMutation.mutateAsync({
        clientId: selectedClientId,
        projectIds: selectedProjectIds,
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate,
        billingPeriod: formData.billingPeriod,
        notes: formData.notes,
        ...(billingPeriodParsed ? {
          billingYear: billingPeriodParsed.year,
          billingMonth: billingPeriodParsed.month,
        } : {}),
      });

      const selectedProjectsData = hostingProjects.filter(p => selectedProjectIds.includes(p.id));

      const paymentSettingsRes = await fetch("/api/admin/payment-settings", { credentials: "include" });
      const paymentSettings = paymentSettingsRes.ok ? await paymentSettingsRes.json() : undefined;

      const doc = generateHostingInvoicePDF(
        formData, result.invoiceNumber, selectedClient, selectedProjectsData,
        paymentSettings, maintenanceData, aggregatedData
      );
      doc.save(`${result.invoiceNumber}.pdf`);

      toast({ title: "Hosting invoice generated successfully" });
      setIsOpen(false);
      form.reset();
      setManualProjectIds(null);
    } catch (error) {
      toast({ 
        title: "Failed to generate invoice", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const clientsWithHosting = useMemo(() => {
    if (!clients) return [];
    return clients.filter(c => c.status === "active");
  }, [clients]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        setManualProjectIds(null);
      }
    }}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Generate Hosting Invoice
          </DialogTitle>
          <DialogDescription>
            Create a monthly hosting invoice for one or more projects.
          </DialogDescription>
        </DialogHeader>

        {hasError ? (
          <Card className="border-destructive">
            <CardContent className="py-6 text-center">
              <p className="text-destructive font-medium">Error loading data</p>
              <p className="text-sm text-muted-foreground mt-2">
                {(clientsError || projectsError || selectedClientError)?.message || "Please try again"}
              </p>
            </CardContent>
          </Card>
        ) : (
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
                      setManualProjectIds(null);
                    }}
                  >
                    <SelectTrigger data-testid="select-hosting-invoice-client">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientsWithHosting.map((client) => (
                        <SelectItem key={client.id} value={client.id.toString()}>
                          {client.companyName || client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {selectedClientId && (
              <>
                <div className="space-y-2">
                  <Label>Hosting Projects</Label>
                  {projectsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : hostingProjects.length === 0 ? (
                    <Card>
                      <CardContent className="py-6 text-center text-muted-foreground">
                        <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No hosting projects found for this client</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {hostingProjects.map((project) => {
                        const isSelected = selectedProjectIds.includes(project.id);
                        const fee = (project.hostingTerms?.monthlyFeeCents || 0) / 100;
                        return (
                          <Card 
                            key={project.id}
                            className={`cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`}
                            onClick={() => toggleProject(project.id)}
                            data-testid={`checkbox-project-${project.id}`}
                          >
                            <CardContent className="p-3 flex items-center gap-3">
                              <Checkbox 
                                checked={isSelected}
                                onCheckedChange={() => toggleProject(project.id)}
                              />
                              <div className="flex-1">
                                <p className="font-medium">{project.name}</p>
                                <p className="text-sm text-muted-foreground">Monthly Hosting</p>
                              </div>
                              <p className="font-mono font-medium">
                                ${fee.toLocaleString()}/mo
                              </p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>

                {hostingProjects.length > 0 && (
                  <>
                    <Card className="bg-muted/50">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {selectedProjectIds.length} project{selectedProjectIds.length !== 1 ? 's' : ''} selected
                          </p>
                          <p className="text-lg font-semibold font-mono">
                            USD ${(totalAmount / 100).toLocaleString()}/month
                          </p>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          {selectedClient?.invoiceCurrency && selectedClient.invoiceCurrency !== "USD" && (() => {
                            const conv = convertUSDCents(totalAmount, selectedClient.invoiceCurrency);
                            return <p>≈ {conv.code} {conv.symbol}{conv.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>;
                          })()}
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="invoiceDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Invoice Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-hosting-invoice-date" />
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
                              <Input type="date" {...field} data-testid="input-hosting-due-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="billingPeriod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Period</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., January 2026" 
                              {...field} 
                              data-testid="input-hosting-billing-period"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes (optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Additional notes for the invoice" 
                              {...field} 
                              data-testid="input-hosting-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isGenerating || selectedProjectIds.length === 0}
                      data-testid="button-generate-hosting-invoice"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
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
              </>
            )}
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
