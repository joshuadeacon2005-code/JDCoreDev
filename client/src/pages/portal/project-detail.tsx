import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ClientLayout } from "@/components/ClientLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ChevronRight, DollarSign, FileText,
  CheckCircle2, Circle, Clock, MessageSquare, FileCheck,
  Video, Mail, Phone, ClipboardList, FileCode, Loader2, Check, Server
} from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/utils";
import type { 
  Project, Client, Milestone, ProjectProcessStep, 
  ProjectPrompt, ProjectAgreement, Document, ProjectHistoryEvent,
  ProjectHostingTerms
} from "@shared/schema";

type ProjectDetailData = Project & {
  client: Client;
  milestones: Milestone[];
  processSteps: ProjectProcessStep[];
  prompts: ProjectPrompt[];
  agreements: ProjectAgreement[];
  documents: Document[];
  historyEvents: ProjectHistoryEvent[];
};

export default function PortalProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");

  const { data: project, isLoading } = useQuery<ProjectDetailData>({
    queryKey: ["/api/portal/projects", projectId],
  });

  if (isLoading) {
    return (
      <ClientLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ClientLayout>
    );
  }

  if (!project) {
    return (
      <ClientLayout>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-muted-foreground">Project not found</p>
          <Link href="/portal/projects" className="text-primary hover:underline">
            Back to Projects
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const totalValue = project.milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const paidValue = project.milestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/portal/projects" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span>{project.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {project.name}
              <StatusBadge status={project.status} />
            </h1>
            {project.description && (
              <p className="text-muted-foreground mt-1">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-semibold font-mono">
                ${(paidValue / 100).toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">
                of ${(totalValue / 100).toLocaleString()} total
              </div>
            </div>
          </div>
        </div>

        <ProcessBar steps={project.processSteps} />

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap gap-1">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="milestones" data-testid="tab-milestones">
              Milestones ({project.milestones.length})
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              Documents ({project.documents.length + project.agreements.length})
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              Activity ({project.historyEvents?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Billing Model</Label>
                    <p className="mt-1 capitalize">{project.billingModel.replace("_", " ")}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <div className="mt-1">
                      <StatusBadge status={project.status} />
                    </div>
                  </div>
                  {project.startDate && (
                    <div>
                      <Label className="text-muted-foreground">Start Date</Label>
                      <p className="mt-1">{format(new Date(project.startDate), "MMM d, yyyy")}</p>
                    </div>
                  )}
                  {project.endDate && (
                    <div>
                      <Label className="text-muted-foreground">End Date</Label>
                      <p className="mt-1">{format(new Date(project.endDate), "MMM d, yyyy")}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {project.status === "completed" && (
              <HostingTermsSection projectId={projectId} />
            )}

            {project.prompts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Project Updates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {project.prompts
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((prompt) => (
                        <div
                          key={prompt.id}
                          className="p-4 rounded-md bg-muted/50"
                          data-testid={`prompt-${prompt.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="font-medium">{prompt.promptTitle}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(prompt.createdAt), "MMM d, yyyy")}
                            </p>
                          </div>
                          {prompt.outputSummary && (
                            <p className="text-sm text-muted-foreground">{prompt.outputSummary}</p>
                          )}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="milestones" className="space-y-4">
            <MilestonesSection milestones={project.milestones} />
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <DocumentationSection 
              documents={project.documents} 
              agreements={project.agreements} 
            />
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <HistorySection events={project.historyEvents || []} />
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
}

function ProcessBar({ steps }: { steps: ProjectProcessStep[] }) {
  const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const doneCount = steps.filter(s => s.status === "done").length;
  const progressPercent = steps.length > 0 ? (doneCount / steps.length) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <div className="flex items-center gap-4">
          <CardTitle className="text-base">Progress</CardTitle>
          <span className="text-sm text-muted-foreground">
            {doneCount} of {steps.length} complete
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-2 w-full bg-muted rounded-full mb-4 overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {steps.length === 0 ? (
          <p className="text-muted-foreground text-sm">No progress steps defined yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sortedSteps.map((step) => {
              const statusColors: Record<string, string> = {
                planned: "bg-muted text-muted-foreground",
                in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                done: "bg-green-500/10 text-green-600 dark:text-green-400",
              };
              const statusIcons: Record<string, JSX.Element> = {
                planned: <Circle className="h-3 w-3" />,
                in_progress: <Loader2 className="h-3 w-3 animate-spin" />,
                done: <Check className="h-3 w-3" />,
              };
              return (
                <div
                  key={step.id}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm ${statusColors[step.status] || statusColors.planned}`}
                  data-testid={`step-${step.id}`}
                >
                  {statusIcons[step.status] || statusIcons.planned}
                  <span>{step.title}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MilestonesSection({ milestones }: { milestones: Milestone[] }) {
  const totalValue = milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const paidValue = milestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);
  const paidCount = milestones.filter(m => m.status === "paid").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-lg">Payment Milestones</CardTitle>
            <CardDescription>
              {paidCount} of {milestones.length} milestones completed
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold font-mono">
              ${(paidValue / 100).toLocaleString()} <span className="text-muted-foreground font-normal">of</span> ${(totalValue / 100).toLocaleString()}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <p className="text-muted-foreground text-sm">No milestones defined yet</p>
        ) : (
          <div className="space-y-3">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center justify-between gap-4 p-4 rounded-md bg-muted/50"
                data-testid={`milestone-${milestone.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    milestone.status === "paid" 
                      ? "bg-green-500/10" 
                      : milestone.status === "invoiced" 
                      ? "bg-blue-500/10" 
                      : "bg-muted"
                  }`}>
                    {milestone.status === "paid" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : milestone.status === "invoiced" ? (
                      <Clock className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{milestone.name}</p>
                    {milestone.dueDate && (
                      <p className="text-sm text-muted-foreground">
                        Due {format(new Date(milestone.dueDate), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium">
                    ${(milestone.amountCents / 100).toLocaleString()}
                  </span>
                  <StatusBadge status={milestone.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistorySection({ events }: { events: ProjectHistoryEvent[] }) {
  const eventIcons: Record<string, JSX.Element> = {
    meeting: <Video className="h-4 w-4" />,
    email: <Mail className="h-4 w-4" />,
    call: <Phone className="h-4 w-4" />,
    note: <ClipboardList className="h-4 w-4" />,
    deliverable: <FileCode className="h-4 w-4" />,
    other: <ClipboardList className="h-4 w-4" />,
  };

  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">History</CardTitle>
        <CardDescription>Meetings, emails, calls, and notes for this project</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No history events recorded</p>
        ) : (
          <div className="space-y-4">
            {sortedEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-4 p-4 rounded-md bg-muted/50"
                data-testid={`event-${event.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-muted-foreground">
                    {eventIcons[event.eventType] || eventIcons.note}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{event.summary}</p>
                      <Badge appearance="stroke" className="text-xs capitalize">{event.eventType}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {format(new Date(event.occurredAt), "MMM d, yyyy")}
                    </p>
                    {event.details && (
                      <p className="text-sm mt-2">{event.details}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentationSection({ 
  documents, 
  agreements 
}: { 
  documents: Document[]; 
  agreements: ProjectAgreement[];
}) {
  const typeLabels: Record<string, string> = {
    sow: "SOW",
    msa: "MSA",
    nda: "NDA",
    contract: "Contract",
    other: "Other",
  };

  const docTypeLabels: Record<string, string> = {
    contract: "Contract",
    prd: "PRD",
    brief: "Brief",
    report: "Report",
    other: "Other",
  };

  const docTypeIcons: Record<string, JSX.Element> = {
    contract: <FileCheck className="h-4 w-4" />,
    prd: <FileCode className="h-4 w-4" />,
    brief: <ClipboardList className="h-4 w-4" />,
    report: <FileText className="h-4 w-4" />,
    other: <FileText className="h-4 w-4" />,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agreements</CardTitle>
          <CardDescription>Contracts, SOWs, and legal documents</CardDescription>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <p className="text-muted-foreground text-sm">No agreements added</p>
          ) : (
            <div className="space-y-2">
              {agreements.map((agreement) => (
                <div
                  key={agreement.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`agreement-${agreement.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FileCheck className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{agreement.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <Badge appearance="stroke" className="text-xs">{typeLabels[agreement.agreementType]}</Badge>
                        {agreement.notes && <span>{agreement.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <Badge appearance={agreement.signed ? "solid" : "stroke"}>
                    {agreement.signed ? "Signed" : "Unsigned"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Documents</CardTitle>
          <CardDescription>PRDs, briefs, and other project files</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No documents uploaded</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`document-${doc.id}`}
                >
                  <div className="flex items-center gap-3">
                    {docTypeIcons[doc.docType] || docTypeIcons.other}
                    <div>
                      <p className="font-medium">{doc.filename}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <Badge appearance="stroke" className="text-xs">{docTypeLabels[doc.docType] || doc.docType}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HostingTermsSection({ projectId }: { projectId: number }) {
  const { data: hostingTerms, isLoading } = useQuery<ProjectHostingTerms | null>({
    queryKey: ["/api/portal/projects", projectId, "hosting-terms"],
  });
  
  if (isLoading) {
    return (
      <Card data-testid="hosting-terms-section">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Hosting & Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  if (!hostingTerms || (hostingTerms as any).status === "none") {
    return null;
  }
  
  const terms = hostingTerms as any;
  const statusLabels: Record<string, string> = {
    draft: "Draft",
    active: "Active",
    ended: "Ended",
  };
  
  return (
    <Card data-testid="hosting-terms-section">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Server className="h-5 w-5" />
          Hosting & Maintenance
        </CardTitle>
        <CardDescription>
          Your hosting agreement details
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-muted-foreground">Status</Label>
            <div className="mt-1">
              <Badge variant={terms.status === "active" ? "primary" : "secondary"}>
                {statusLabels[terms.status] || terms.status}
              </Badge>
            </div>
          </div>
          {terms.startDate && (
            <div>
              <Label className="text-muted-foreground">Start Date</Label>
              <p className="mt-1">{format(new Date(terms.startDate), "MMM d, yyyy")}</p>
            </div>
          )}
          <div>
            <Label className="text-muted-foreground">Initial Term</Label>
            <p className="mt-1">{terms.initialTermMonths || 6} months</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Monthly Fee</Label>
            <p className="mt-1 font-mono">
              {formatMoney(terms.monthlyFeeCents, { currency: terms.currency || "USD", showCurrency: true })}
            </p>
          </div>
        </div>
        
        {terms.includedServices && (
          <div>
            <Label className="text-muted-foreground">Included Services</Label>
            <p className="mt-1 text-sm whitespace-pre-wrap">{terms.includedServices}</p>
          </div>
        )}
        
        {terms.availabilityDisclaimer && (
          <div>
            <Label className="text-muted-foreground">Availability</Label>
            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{terms.availabilityDisclaimer}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
