import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ClientLayout } from "@/components/ClientLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { Project, Milestone } from "@shared/schema";

type ProjectWithMilestones = Project & { milestones?: Milestone[] };

export default function PortalProjects() {
  const { data: projects, isLoading } = useQuery<ProjectWithMilestones[]>({
    queryKey: ["/api/portal/projects"],
  });

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Your Projects</h1>
          <p className="text-muted-foreground">View your project details and milestones</p>
        </div>

        {isLoading ? (
          <div className="grid gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-48 mb-4" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No projects assigned yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {projects?.map((project) => {
              const milestones = project.milestones || [];
              const totalValue = milestones.reduce((sum, m) => sum + m.amountCents, 0);
              const paidValue = milestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);
              const outstanding = totalValue - paidValue;

              return (
                <Link key={project.id} href={`/portal/projects/${project.id}`}>
                  <Card className="hover-elevate cursor-pointer h-full" data-testid={`project-${project.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <CardTitle className="text-xl">{project.name}</CardTitle>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={project.status} />
                        <StatusBadge status={project.riskState} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="text-xs text-muted-foreground">Billing Model</p>
                        <p className="text-sm font-medium capitalize">{project.billingModel.replace("_", " ")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Start Date</p>
                        <p className="text-sm font-medium">
                          {project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "TBD"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Value</p>
                        <p className="text-sm font-medium font-mono">
                          ${(totalValue / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Outstanding</p>
                        <p className="text-sm font-medium font-mono text-amber-600 dark:text-amber-400">
                          ${(outstanding / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {milestones.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Milestones</p>
                        <div className="space-y-2">
                          {milestones.map((milestone) => (
                            <div 
                              key={milestone.id} 
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                            >
                              <div>
                                <p className="text-sm font-medium">{milestone.name}</p>
                                {milestone.dueDate && (
                                  <p className="text-xs text-muted-foreground">
                                    Due {format(new Date(milestone.dueDate), "MMM d, yyyy")}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-mono">
                                  ${(milestone.amountCents / 100).toLocaleString()}
                                </p>
                                <StatusBadge status={milestone.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
