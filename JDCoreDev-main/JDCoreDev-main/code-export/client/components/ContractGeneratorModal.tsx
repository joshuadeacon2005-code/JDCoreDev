import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileText, Download, Loader2 } from "lucide-react";
import type { Project, Client, Milestone, GeneratedContract } from "@shared/schema";
import { JDCOREDEV_LOGO_BASE64 } from "@/lib/logo-base64";

const contractFormSchema = z.object({
  contractType: z.enum(["development", "hosting"]),
  startDate: z.string().min(1, "Start date is required"),
  deliveryDeadline: z.string().optional(),
  totalAmount: z.number().min(0).optional(),
  currency: z.string().default("USD"),
  monthlyHostingFee: z.number().min(0).optional(),
  minHostingMonths: z.number().min(1).default(6),
  scopeOfWork: z.string().optional(),
  milestones: z.array(z.object({
    name: z.string(),
    amountCents: z.number(),
  })).optional(),
  governingLaw: z.string().default("Hong Kong SAR"),
  warrantyDays: z.number().default(30),
});

type ContractFormData = z.infer<typeof contractFormSchema>;

interface ContractGeneratorModalProps {
  project: Project & { client: Client; milestones: Milestone[] };
  trigger?: React.ReactNode;
}

const BRAND_TEAL = [0, 128, 128] as const;
const BRAND_DARK = [30, 30, 30] as const;

function generateDevelopmentContractPDF(contract: GeneratedContract, project: Project & { client: Client }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  doc.setFillColor(...BRAND_TEAL);
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Add logo (452x120 original, aspect ratio ~3.77:1)
  try {
    doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 60, 16);
  } catch (e) {
    // Fallback if logo fails to load
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Software Development Agreement", margin + 65, 18);

  doc.setFontSize(8);
  doc.text(`Ref: ${contract.referenceNumber}`, pageWidth - margin - 40, 20);
  doc.text(format(new Date(contract.createdAt), "MMMM d, yyyy"), pageWidth - margin - 40, 28);

  y = 50;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("SOFTWARE DEVELOPMENT AGREEMENT", margin, y);

  y += 15;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const intro = `This Software Development Agreement ("Agreement") is entered into as of ${contract.startDate ? format(new Date(contract.startDate), "MMMM d, yyyy") : "[Date]"} by and between:`;
  doc.text(intro, margin, y, { maxWidth: contentWidth });

  y += 15;
  doc.setFont("helvetica", "bold");
  doc.text("Developer:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text("JD CoreDev (Joshua Deacon), Hong Kong", margin + 25, y);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Client:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(contract.clientName, margin + 25, y);

  y += 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("1. PROJECT DETAILS", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  doc.text(`Project Name: ${contract.projectName}`, margin, y);
  y += 8;
  if (contract.deliveryDeadline) {
    doc.text(`Delivery Deadline: ${format(new Date(contract.deliveryDeadline), "MMMM d, yyyy")}`, margin, y);
    y += 8;
  }
  doc.text(`Total Project Value: ${contract.currency} ${((contract.totalAmount || 0) / 100).toLocaleString()}`, margin, y);

  y += 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("2. SCOPE OF WORK", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  const scope = contract.scopeOfWork || "To be defined in attached Product Requirements Document (PRD).";
  const scopeLines = doc.splitTextToSize(scope, contentWidth);
  doc.text(scopeLines, margin, y);
  y += scopeLines.length * 5 + 10;

  if (contract.milestonesJson && Array.isArray(contract.milestonesJson) && contract.milestonesJson.length > 0) {
    doc.setFillColor(...BRAND_TEAL);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("3. PAYMENT MILESTONES", margin + 2, y + 6);
    doc.setTextColor(...BRAND_DARK);

    y += 15;
    doc.setFont("helvetica", "normal");
    (contract.milestonesJson as Array<{ name: string; amountCents: number; description?: string }>).forEach((milestone, index) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}. ${milestone.name}`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(`${contract.currency} ${(milestone.amountCents / 100).toLocaleString()}`, pageWidth - margin - 30, y);
      y += 6;
      if (milestone.description) {
        const descLines = doc.splitTextToSize(milestone.description, contentWidth - 10);
        doc.text(descLines, margin + 5, y);
        y += descLines.length * 5;
      }
      y += 4;
    });
  }

  if (y > 200) {
    doc.addPage();
    y = 20;
  }

  y += 5;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("4. WARRANTY & SUPPORT", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  doc.text(`Developer provides a ${contract.warrantyDays}-day warranty period after final delivery.`, margin, y);
  y += 6;
  doc.text("Bug fixes and minor adjustments are included during the warranty period.", margin, y);

  y += 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("5. INTELLECTUAL PROPERTY", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  const ipText = "Upon full payment, all intellectual property rights to the deliverables shall transfer to the Client, except for any pre-existing Developer tools or frameworks.";
  const ipLines = doc.splitTextToSize(ipText, contentWidth);
  doc.text(ipLines, margin, y);

  y += ipLines.length * 5 + 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("6. GOVERNING LAW", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  doc.text(`This Agreement shall be governed by the laws of ${contract.governingLaw}.`, margin, y);

  if (y > 220) {
    doc.addPage();
    y = 30;
  }

  y += 25;
  doc.setFont("helvetica", "bold");
  doc.text("SIGNATURES", margin, y);
  y += 10;

  doc.setDrawColor(...BRAND_TEAL);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 15, margin + 70, y + 15);
  doc.line(pageWidth - margin - 70, y + 15, pageWidth - margin, y + 15);

  doc.setFont("helvetica", "normal");
  doc.text("Developer: JD CoreDev", margin, y + 22);
  doc.text(`Client: ${contract.clientName}`, pageWidth - margin - 70, y + 22);

  doc.text("Date: _______________", margin, y + 32);
  doc.text("Date: _______________", pageWidth - margin - 70, y + 32);

  const pageCount = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
  }

  return doc;
}

function generateHostingContractPDF(contract: GeneratedContract, project: Project & { client: Client }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  doc.setFillColor(...BRAND_TEAL);
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Add logo (452x120 original, aspect ratio ~3.77:1)
  try {
    doc.addImage(JDCOREDEV_LOGO_BASE64, 'PNG', margin, 8, 60, 16);
  } catch (e) {
    // Fallback if logo fails to load
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Hosting & Maintenance Agreement", margin + 65, 18);

  doc.setFontSize(8);
  doc.text(`Ref: ${contract.referenceNumber}`, pageWidth - margin - 40, 20);
  doc.text(format(new Date(contract.createdAt), "MMMM d, yyyy"), pageWidth - margin - 40, 28);

  y = 50;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("HOSTING & MAINTENANCE AGREEMENT", margin, y);

  y += 15;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const intro = `This Hosting & Maintenance Agreement ("Agreement") is entered into as of ${contract.startDate ? format(new Date(contract.startDate), "MMMM d, yyyy") : "[Date]"} by and between:`;
  doc.text(intro, margin, y, { maxWidth: contentWidth });

  y += 15;
  doc.setFont("helvetica", "bold");
  doc.text("Provider:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text("JD CoreDev (Joshua Deacon), Hong Kong", margin + 25, y);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Client:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(contract.clientName, margin + 25, y);

  y += 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("1. HOSTED APPLICATION", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  doc.text(`Application: ${contract.projectName}`, margin, y);

  y += 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("2. MONTHLY FEES", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  const monthlyFee = ((contract.monthlyHostingFee || 0) / 100).toLocaleString();
  doc.text(`Monthly Hosting Fee: ${contract.currency} ${monthlyFee}`, margin, y);
  y += 8;
  doc.text(`Minimum Commitment: ${contract.minHostingMonths} months`, margin, y);
  y += 8;
  doc.text("Payment due on the 1st of each month.", margin, y);

  y += 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("3. SERVICES INCLUDED", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  const services = [
    "Cloud hosting infrastructure management",
    "SSL certificate maintenance",
    "Regular security updates and patches",
    "Daily automated backups",
    "99.9% uptime SLA (excluding scheduled maintenance)",
    "Email support during business hours (response within 24 hours)",
    "Minor bug fixes and adjustments (up to 2 hours/month)",
  ];

  services.forEach((service) => {
    doc.text(`• ${service}`, margin + 5, y);
    y += 6;
  });

  y += 10;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("4. ADDITIONAL SERVICES", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  const additionalText = "Feature development, major updates, and support beyond the included hours are billed separately at the agreed hourly rate.";
  const additionalLines = doc.splitTextToSize(additionalText, contentWidth);
  doc.text(additionalLines, margin, y);

  y += additionalLines.length * 5 + 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("5. TERMINATION", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  const termText = `After the minimum commitment period, either party may terminate with 30 days written notice. Early termination before ${contract.minHostingMonths} months requires payment of remaining months.`;
  const termLines = doc.splitTextToSize(termText, contentWidth);
  doc.text(termLines, margin, y);

  y += termLines.length * 5 + 15;
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("6. GOVERNING LAW", margin + 2, y + 6);
  doc.setTextColor(...BRAND_DARK);

  y += 15;
  doc.setFont("helvetica", "normal");
  doc.text(`This Agreement shall be governed by the laws of ${contract.governingLaw}.`, margin, y);

  y += 25;
  doc.setFont("helvetica", "bold");
  doc.text("SIGNATURES", margin, y);
  y += 10;

  doc.setDrawColor(...BRAND_TEAL);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 15, margin + 70, y + 15);
  doc.line(pageWidth - margin - 70, y + 15, pageWidth - margin, y + 15);

  doc.setFont("helvetica", "normal");
  doc.text("Provider: JD CoreDev", margin, y + 22);
  doc.text(`Client: ${contract.clientName}`, pageWidth - margin - 70, y + 22);

  doc.text("Date: _______________", margin, y + 32);
  doc.text("Date: _______________", pageWidth - margin - 70, y + 32);

  const pageCount = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
  }

  return doc;
}

export function ContractGeneratorModal({ project, trigger }: ContractGeneratorModalProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ContractFormData>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      contractType: "development",
      startDate: format(new Date(), "yyyy-MM-dd"),
      currency: "USD",
      minHostingMonths: 6,
      governingLaw: "Hong Kong SAR",
      warrantyDays: 30,
      totalAmount: project.milestones.reduce((sum, m) => sum + m.amountCents, 0),
      milestones: project.milestones.map(m => ({
        name: m.name,
        amountCents: m.amountCents,
      })),
    },
  });

  const contractType = form.watch("contractType");

  const createContract = useMutation({
    mutationFn: async (data: ContractFormData) => {
      const response = await apiRequest("POST", `/api/admin/projects/${project.id}/contracts`, {
        ...data,
        milestones: contractType === "development" ? data.milestones : undefined,
      });
      return await response.json() as GeneratedContract;
    },
    onSuccess: async (contract) => {
      const doc = contract.contractType === "hosting" 
        ? generateHostingContractPDF(contract, project)
        : generateDevelopmentContractPDF(contract, project);
      
      const fileName = `${contract.referenceNumber}_${project.name.replace(/\s+/g, '_')}.pdf`;
      doc.save(fileName);

      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", project.id, "contracts"] });
      toast({
        title: "Contract Generated",
        description: `${contract.contractType === "hosting" ? "Hosting" : "Development"} contract has been created and downloaded.`,
      });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate contract",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContractFormData) => {
    createContract.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" data-testid="button-generate-contract">
            <FileText className="h-4 w-4 mr-2" />
            Generate Contract
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Contract</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="contractType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-contract-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="development">Development Agreement</SelectItem>
                      <SelectItem value="hosting">Hosting Agreement</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-start-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {contractType === "development" && (
                <FormField
                  control={form.control}
                  name="deliveryDeadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Deadline</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-delivery-deadline" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {contractType === "development" ? (
              <>
                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Project Value (USD)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={field.value ? (field.value / 100).toFixed(2) : ""}
                          onChange={(e) => field.onChange(Math.round(parseFloat(e.target.value || "0") * 100))}
                          data-testid="input-total-amount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scopeOfWork"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scope of Work (PRD Summary)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the project scope, features, and deliverables..."
                          className="min-h-[100px]"
                          {...field}
                          data-testid="input-scope-of-work"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="warrantyDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Warranty Period (Days)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value || "30"))}
                          data-testid="input-warranty-days"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="monthlyHostingFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Hosting Fee (USD)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={field.value ? (field.value / 100).toFixed(2) : ""}
                          onChange={(e) => field.onChange(Math.round(parseFloat(e.target.value || "0") * 100))}
                          data-testid="input-monthly-fee"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="minHostingMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Commitment (Months)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value || "6"))}
                          data-testid="input-min-months"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="governingLaw"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Governing Law</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-governing-law" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createContract.isPending} data-testid="button-submit-contract">
                {createContract.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Generate & Download
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
