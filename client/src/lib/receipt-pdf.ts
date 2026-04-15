import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { JDCOREDEV_LOGO_BASE64 } from "@/lib/logo-base64";
import type { Milestone, Project, Client, HostingInvoice, HostingInvoiceLineItem } from "@shared/schema";

export type MilestoneForReceipt = Milestone & { project: Project; client: Client };
export type InvoiceForReceipt = HostingInvoice & { client: Client; lineItems: HostingInvoiceLineItem[] };

const RECEIPT_GREEN: [number, number, number] = [22, 163, 74];
const RECEIPT_DARK: [number, number, number] = [30, 30, 30];

function addStandardHeader(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  clientName: string,
  clientEmail: string | null | undefined,
): number {
  try { doc.addImage(JDCOREDEV_LOGO_BASE64, "PNG", margin, 8, 60, 16); } catch {}

  doc.setTextColor(...RECEIPT_GREEN);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("RECEIPT OF SERVICES", pageWidth - margin - 90, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...RECEIPT_DARK);
  doc.text("PAID IN FULL", pageWidth - margin - 35, 26);

  let y = 55;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("FROM:", margin, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text("JD CoreDev", margin, y); y += 5;
  doc.text("Joshua Deacon", margin, y); y += 5;
  doc.text("Hong Kong", margin, y); y += 5;
  doc.text("joshuadeacon888@gmail.com", margin, y);

  let rightY = 55;
  doc.setFont("helvetica", "bold");
  doc.text("RECEIVED FROM:", pageWidth - margin - 60, rightY);
  doc.setFont("helvetica", "normal");
  rightY += 6;
  const nameLines = doc.splitTextToSize(clientName, 58);
  nameLines.forEach((line: string) => { doc.text(line, pageWidth - margin - 60, rightY); rightY += 5; });
  if (clientEmail) { doc.text(clientEmail, pageWidth - margin - 60, rightY); rightY += 5; }

  return Math.max(y, rightY) + 12;
}

function addPageFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const footerY = pageHeight - 15;
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text("Thank you for your payment!", pageWidth / 2, footerY, { align: "center" });
  doc.text("JD CoreDev - Custom Software Development & Consulting", pageWidth / 2, footerY + 5, { align: "center" });
}

export function generateMilestoneReceiptPDF(milestone: MilestoneForReceipt) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxY = pageHeight - 25;

  const addFooter = () => addPageFooter(doc, pageWidth, pageHeight);

  const clientName = milestone.client.companyName || milestone.client.name;
  let y = addStandardHeader(doc, pageWidth, margin, clientName, milestone.client.contactEmail);

  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(margin, y, pageWidth - margin * 2, 0.5, "F");
  y += 8;

  const infoBoxY = y;
  const infoBoxH = 22;
  doc.setFillColor(240, 250, 244);
  doc.rect(margin, infoBoxY, pageWidth - margin * 2, infoBoxH, "F");
  doc.setFontSize(9);
  const receiptDate = milestone.paidDate
    ? format(new Date(milestone.paidDate), "MMMM d, yyyy")
    : format(new Date(), "MMMM d, yyyy");
  doc.setFont("helvetica", "bold");
  doc.text("Receipt Ref:", margin + 4, infoBoxY + 7);
  doc.text("Date Paid:", margin + 60, infoBoxY + 7);
  doc.text("Project:", margin + 110, infoBoxY + 7);
  doc.text("Status:", margin + 155, infoBoxY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(milestone.invoiceRef || "—", margin + 4, infoBoxY + 15);
  doc.text(receiptDate, margin + 60, infoBoxY + 15);
  const projLines = doc.splitTextToSize(milestone.project.name, 40);
  doc.text(projLines[0], margin + 110, infoBoxY + 15);
  doc.setTextColor(...RECEIPT_GREEN);
  doc.setFont("helvetica", "bold");
  doc.text("PAID", margin + 155, infoBoxY + 15);
  doc.setTextColor(...RECEIPT_DARK);
  doc.setFont("helvetica", "normal");

  y = infoBoxY + infoBoxH + 14;

  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("MILESTONE / SERVICE", margin + 4, y + 5);
  doc.text("AMOUNT (USD)", pageWidth - margin - 4, y + 5, { align: "right" });
  doc.setTextColor(...RECEIPT_DARK);
  y += 7;

  doc.setFillColor(248, 255, 250);
  doc.rect(margin, y, pageWidth - margin * 2, 10, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(milestone.name, margin + 4, y + 7);
  doc.setFont("helvetica", "bold");
  doc.text(`$${(milestone.amountCents / 100).toFixed(2)}`, pageWidth - margin - 4, y + 7, { align: "right" });
  y += 14;

  if (milestone.description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const descLines = doc.splitTextToSize(milestone.description, pageWidth - margin * 2 - 8);
    descLines.forEach((line: string) => {
      if (y < maxY) { doc.text(line, margin + 4, y); y += 5; }
    });
    doc.setTextColor(...RECEIPT_DARK);
  }

  y += 4;
  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(margin, y, pageWidth - margin * 2, 0.5, "F");
  y += 6;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...RECEIPT_GREEN);
  doc.text(`PAID: USD $${(milestone.amountCents / 100).toFixed(2)}`, pageWidth - margin - 4, y + 6, { align: "right" });
  doc.setTextColor(...RECEIPT_DARK);

  y += 22;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("This document serves as an official receipt of payment for the milestone listed above.", margin, y);

  addFooter();
  const safeRef = (milestone.invoiceRef || milestone.name).replace(/[^a-zA-Z0-9-_]/g, "-");
  doc.save(`receipt-${safeRef}.pdf`);
}

export function generateHostingReceiptPDF(invoice: InvoiceForReceipt) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxY = pageHeight - 25;

  const addFooter = () => addPageFooter(doc, pageWidth, pageHeight);

  const checkPageBreak = (space: number) => {
    if (doc.internal.pageSize.getHeight() - (doc as any).internal.getCurrentPageInfo().pageContext.mediaBox.topRightY + space > maxY) {
      addFooter();
      doc.addPage();
    }
  };

  const clientName = invoice.client.companyName || invoice.client.name;
  let y = addStandardHeader(doc, pageWidth, margin, clientName, invoice.client.contactEmail);

  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(margin, y, pageWidth - margin * 2, 0.5, "F");
  y += 8;

  const infoBoxY = y;
  const infoBoxH = 22;
  doc.setFillColor(240, 250, 244);
  doc.rect(margin, infoBoxY, pageWidth - margin * 2, infoBoxH, "F");
  doc.setFontSize(9);
  const receiptDate = format(new Date(invoice.createdAt), "MMMM d, yyyy");
  doc.setFont("helvetica", "bold");
  doc.text("Receipt No:", margin + 4, infoBoxY + 7);
  doc.text("Date:", margin + 60, infoBoxY + 7);
  doc.text("Billing Period:", margin + 100, infoBoxY + 7);
  doc.text("Status:", margin + 155, infoBoxY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoiceNumber, margin + 4, infoBoxY + 15);
  doc.text(receiptDate, margin + 60, infoBoxY + 15);
  doc.text(invoice.billingPeriod || "—", margin + 100, infoBoxY + 15);
  doc.setTextColor(...RECEIPT_GREEN);
  doc.setFont("helvetica", "bold");
  doc.text("PAID", margin + 155, infoBoxY + 15);
  doc.setTextColor(...RECEIPT_DARK);
  doc.setFont("helvetica", "normal");

  y = infoBoxY + infoBoxH + 14;

  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("PROJECT / SERVICE", margin + 4, y + 5);
  doc.text("AMOUNT (USD)", pageWidth - margin - 4, y + 5, { align: "right" });
  doc.setTextColor(...RECEIPT_DARK);
  y += 7;

  invoice.lineItems.forEach((item, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 255, 250);
      doc.rect(margin, y, pageWidth - margin * 2, 10, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(item.projectName, margin + 4, y + 7);
    if (item.description) {
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(8);
      doc.text(item.description, margin + 4, y + 12);
      doc.setTextColor(...RECEIPT_DARK);
      doc.setFontSize(9);
    }
    doc.setFont("helvetica", "bold");
    doc.text(`$${(item.amountCents / 100).toFixed(2)}`, pageWidth - margin - 4, y + 7, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 10;
  });

  y += 4;
  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(margin, y, pageWidth - margin * 2, 0.5, "F");
  y += 6;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...RECEIPT_GREEN);
  doc.text(`PAID: USD $${(invoice.totalAmountCents / 100).toFixed(2)}`, pageWidth - margin - 4, y + 6, { align: "right" });
  doc.setTextColor(...RECEIPT_DARK);

  y += 22;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("This document serves as an official receipt of payment for the services listed above.", margin, y);

  addFooter();
  doc.save(`receipt-${invoice.invoiceNumber}.pdf`);
}
