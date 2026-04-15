import { useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/ClientLayout";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Calendar, DollarSign, FileText } from "lucide-react";
import { format } from "date-fns";
import type { Project, OfficeDayRequest, Milestone, Document } from "@shared/schema";

export default function PortalDashboard() {
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/portal/projects"],
  });

  const { data: officeDays, isLoading: officeDaysLoading } = useQuery<OfficeDayRequest[]>({
    queryKey: ["/api/portal/office-days"],
  });

  const { data: milestones, isLoading: milestonesLoading } = useQuery<Milestone[]>({
    queryKey: ["/api/portal/milestones"],
  });

  const { data: documents, isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/portal/documents"],
  });

  const isLoading = projectsLoading || officeDaysLoading || milestonesLoading || documentsLoading;

  const activeProjects = projects?.filter(p => p.status === "active").length || 0;
  const approvedDays = officeDays?.filter(o => o.status === "approved").length || 0;
  const totalValue = milestones?.reduce((sum, m) => sum + m.amountCents, 0) || 0;
  const documentCount = documents?.length || 0;

  const recentProjects = projects?.slice(0, 3) || [];
  const upcomingDays = officeDays?.filter(o => o.status === "approved").slice(0, 3) || [];

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Welcome Back</h1>
          <p className="text-muted-foreground">Your client portal overview</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <StatCard
                label="Active Projects"
                value={activeProjects}
                icon={<Briefcase className="h-4 w-4" />}
              />
              <StatCard
                label="Approved Days"
                value={approvedDays}
                icon={<Calendar className="h-4 w-4" />}
              />
              <StatCard
                label="Project Value"
                value={`$${(totalValue / 100).toLocaleString()}`}
                icon={<DollarSign className="h-4 w-4" />}
              />
              <StatCard
                label="Documents"
                value={documentCount}
                icon={<FileText className="h-4 w-4" />}
              />
            </>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Projects</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No projects assigned</p>
              ) : (
                <div className="space-y-3">
                  {recentProjects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{project.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {project.billingModel.replace("_", " ")}
                        </p>
                      </div>
                      <StatusBadge status={project.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upcoming Office Days</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : upcomingDays.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No upcoming days</p>
              ) : (
                <div className="space-y-3">
                  {upcomingDays.map((day) => (
                    <div key={day.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">
                          {format(new Date(day.date), "EEEE, MMM d")}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {day.dayType}
                        </p>
                      </div>
                      <StatusBadge status={day.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ClientLayout>
  );
}
