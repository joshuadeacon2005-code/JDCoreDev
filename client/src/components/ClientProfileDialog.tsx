import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { 
  Mail, Phone, MapPin, Building2, Calendar, Clock, 
  FileText, DollarSign, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import type { Client, Project, Milestone } from "@shared/schema";

interface ClientProfileDialogProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProjectWithMilestones = Project & { milestones?: Milestone[] };

export function ClientProfileDialog({ client, open, onOpenChange }: ClientProfileDialogProps) {
  const [activeTab, setActiveTab] = useState("info");

  const { data: projects, isLoading: projectsLoading } = useQuery<ProjectWithMilestones[]>({
    queryKey: ["/api/admin/projects"],
    enabled: !!client,
  });

  const clientProjects = projects?.filter(p => p.clientId === client?.id) || [];
  const ongoingProjects = clientProjects.filter(p => p.status === "active" || p.status === "lead" || p.status === "paused");
  const finishedProjects = clientProjects.filter(p => p.status === "completed");

  const { data: allMilestones } = useQuery<Milestone[]>({
    queryKey: ["/api/admin/milestones"],
    enabled: !!client,
  });

  const getProjectMilestones = (projectId: number) => {
    return allMilestones?.filter(m => m.projectId === projectId) || [];
  };

  const getMilestoneProgress = (projectMilestones: Milestone[]) => {
    if (projectMilestones.length === 0) return 0;
    const paid = projectMilestones.filter(m => m.status === "paid").length;
    return Math.round((paid / projectMilestones.length) * 100);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(client.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-xl">{client.name}</DialogTitle>
              {client.companyName && (
                <p className="text-sm text-muted-foreground">{client.companyName}</p>
              )}
            </div>
            <div className="ml-auto">
              <StatusBadge status={client.status} />
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="info" data-testid="tab-client-info">Contact Info</TabsTrigger>
            <TabsTrigger value="ongoing" data-testid="tab-ongoing-projects">
              Ongoing ({ongoingProjects.length})
            </TabsTrigger>
            <TabsTrigger value="finished" data-testid="tab-finished-projects">
              Finished ({finishedProjects.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="info" className="mt-0 space-y-4">
              <div className="grid gap-4">
                {client.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm">{client.email}</p>
                    </div>
                  </div>
                )}
                
                {client.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm">{client.phone}</p>
                    </div>
                  </div>
                )}

                {(client.address || client.city) && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Address</p>
                      <p className="text-sm">
                        {[client.address, client.city, client.state, client.zipCode, client.country]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                {client.industry && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Industry</p>
                      <p className="text-sm">{client.industry}</p>
                    </div>
                  </div>
                )}

                {client.firstContactDate && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">First Contact</p>
                      <p className="text-sm">{format(new Date(client.firstContactDate), "MMMM d, yyyy")}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Client Since</p>
                    <p className="text-sm">{format(new Date(client.createdAt), "MMMM d, yyyy")}</p>
                  </div>
                </div>

                {client.notes && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm">{client.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="ongoing" className="mt-0 space-y-4">
              {projectsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : ongoingProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No ongoing projects</p>
              ) : (
                ongoingProjects.map((project) => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    milestones={getProjectMilestones(project.id)}
                    progress={getMilestoneProgress(getProjectMilestones(project.id))}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="finished" className="mt-0 space-y-4">
              {projectsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : finishedProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No finished projects</p>
              ) : (
                finishedProjects.map((project) => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    milestones={getProjectMilestones(project.id)}
                    progress={100}
                  />
                ))
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectCardProps {
  project: Project;
  milestones: Milestone[];
  progress: number;
}

function ProjectCard({ project, milestones, progress }: ProjectCardProps) {
  const totalAmount = milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const paidAmount = milestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);
  const hasOverdue = milestones.some(m => m.status === "overdue");

  return (
    <Card data-testid={`card-project-${project.id}`}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-medium">{project.name}</h4>
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <StatusBadge status={project.status} />
            <StatusBadge status={project.riskState} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Project Timeline</span>
            {project.startDate && project.endDate && (
              <span className="text-xs">
                {format(new Date(project.startDate), "MMM d")} - {format(new Date(project.endDate), "MMM d, yyyy")}
              </span>
            )}
          </div>
          
          <div className="relative h-8 rounded-md bg-muted overflow-hidden">
            {milestones.length > 0 ? (
              <div className="flex h-full">
                {milestones.map((milestone, index) => {
                  const width = 100 / milestones.length;
                  const statusColors = {
                    planned: "bg-slate-300 dark:bg-slate-600",
                    invoiced: "bg-blue-400 dark:bg-blue-500",
                    paid: "bg-emerald-400 dark:bg-emerald-500",
                    overdue: "bg-red-400 dark:bg-red-500",
                  };
                  return (
                    <div
                      key={milestone.id}
                      className={`h-full ${statusColors[milestone.status]} flex items-center justify-center text-xs font-medium text-white border-r border-background/20 last:border-r-0`}
                      style={{ width: `${width}%` }}
                      title={`${milestone.name}: $${(milestone.amountCents / 100).toLocaleString()} - ${milestone.status}`}
                    >
                      <span className="truncate px-1 text-[10px]">{index + 1}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                No milestones
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              ${(paidAmount / 100).toLocaleString()} / ${(totalAmount / 100).toLocaleString()}
            </span>
          </div>
          {hasOverdue && (
            <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs">Overdue payment</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
