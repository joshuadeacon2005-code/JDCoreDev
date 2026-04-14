import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, Users, Briefcase, TrendingUp, 
  Calendar, Clock, AlertCircle, Activity, Wrench, Code
} from "lucide-react";
import { formatMoney } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type AnalyticsData = {
  summary: {
    totalRevenueCents: number;
    totalPipelineCents: number;
    overdueCount: number;
    totalClients: number;
    activeClients: number;
    leadClients: number;
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    leadProjects: number;
    totalOfficeDays: number;
    thisYearOfficeDays: number;
    totalMeetings: number;
  };
  revenueTrends: {
    month: string;
    amountCents: number;
    milestoneCount: number;
    paidCount: number;
  }[];
  clientActivity: {
    id: number;
    name: string;
    status: string;
    projectCount: number;
    activeProjects: number;
    totalValueCents: number;
    paidValueCents: number;
    officeDays: number;
  }[];
  recentActivity: {
    id: number;
    type: string;
    description: string;
    timestamp: string;
    entityType: string;
    entityId: number;
  }[];
};

type MaintenanceAnalytics = {
  totalMinutes: number;
  totalCostCents: number;
  devMinutes: number;
  devCostCents: number;
  hostingMinutes: number;
  hostingCostCents: number;
  byProject: Array<{
    projectId: number;
    projectName: string;
    logType: string;
    totalMinutes: number;
    totalCostCents: number;
  }>;
};

const COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--accent))"];

export default function AdminAnalytics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
  });

  const { data: maintenanceData } = useQuery<MaintenanceAnalytics>({
    queryKey: ["/api/admin/maintenance-analytics"],
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Analytics</h1>
            <p className="text-muted-foreground text-sm">Business insights and trends</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!analytics) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-muted-foreground">Failed to load analytics</p>
        </div>
      </AdminLayout>
    );
  }

  const { summary, revenueTrends, clientActivity, recentActivity } = analytics;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const revenueChartData = revenueTrends.map(item => {
    const [year, month] = item.month.split("-");
    const monthIdx = parseInt(month) - 1;
    return {
      month: `${monthNames[monthIdx]} '${year.slice(2)}`,
      revenue: item.amountCents / 100,
      milestones: item.milestoneCount,
    };
  });

  const projectStatusData = [
    { name: "Active", value: summary.activeProjects, color: "hsl(var(--primary))" },
    { name: "Completed", value: summary.completedProjects, color: "hsl(142 76% 36%)" },
    { name: "Leads", value: summary.leadProjects, color: "hsl(var(--muted-foreground))" },
  ].filter(d => d.value > 0);

  const clientStatusData = [
    { name: "Active", value: summary.activeClients, color: "hsl(var(--primary))" },
    { name: "Leads", value: summary.leadClients, color: "hsl(var(--muted-foreground))" },
  ].filter(d => d.value > 0);

  const utilizationRate = summary.thisYearOfficeDays > 0 
    ? Math.round((summary.thisYearOfficeDays / 250) * 100) 
    : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="analytics-title">Analytics</h1>
          <p className="text-muted-foreground text-sm">Business insights and trends</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="stat-total-revenue">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold font-mono">
                    {formatMoney(summary.totalRevenueCents)}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-pipeline">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Pipeline Value</p>
                  <p className="text-2xl font-bold font-mono">
                    {formatMoney(summary.totalPipelineCents)}
                  </p>
                  {summary.overdueCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-destructive mt-1">
                      <AlertCircle className="h-3 w-3" />
                      {summary.overdueCount} overdue
                    </div>
                  )}
                </div>
                <div className="h-10 w-10 rounded-md bg-accent/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-accent-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-clients">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Active Clients</p>
                  <p className="text-2xl font-bold">{summary.activeClients}</p>
                  <p className="text-xs text-muted-foreground">of {summary.totalClients} total</p>
                </div>
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-projects">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Active Projects</p>
                  <p className="text-2xl font-bold">{summary.activeProjects}</p>
                  <p className="text-xs text-muted-foreground">of {summary.totalProjects} total</p>
                </div>
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2" data-testid="revenue-chart">
            <CardHeader>
              <CardTitle className="text-lg">Revenue Trends</CardTitle>
              <CardDescription>Monthly paid revenue over the last 24 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="month" 
                      className="text-xs fill-muted-foreground"
                      interval={1}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis 
                      className="text-xs fill-muted-foreground"
                      tickFormatter={(value) => `$${value.toLocaleString()}`}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                      labelFormatter={(label) => {
                        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                        return months[parseInt(label) - 1] || label;
                      }}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.375rem",
                      }}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="utilization-card">
            <CardHeader>
              <CardTitle className="text-lg">Utilization</CardTitle>
              <CardDescription>Office days & meetings this year</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full border-4 border-primary">
                  <span className="text-2xl font-bold">{utilizationRate}%</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Estimated utilization rate
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Office Days (Year)</span>
                  </div>
                  <span className="font-medium">{summary.thisYearOfficeDays}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Total Meetings</span>
                  </div>
                  <span className="font-medium">{summary.totalMeetings}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="project-status-chart">
            <CardHeader>
              <CardTitle className="text-lg">Project Status</CardTitle>
              <CardDescription>Distribution by status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center">
                {projectStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={projectStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {projectStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.375rem",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-sm">No projects yet</p>
                )}
              </div>
              <div className="flex justify-center gap-4 mt-2">
                {projectStatusData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {item.name} ({item.value})
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="client-activity-card">
            <CardHeader>
              <CardTitle className="text-lg">Top Clients by Value</CardTitle>
              <CardDescription>Revenue contribution by client</CardDescription>
            </CardHeader>
            <CardContent>
              {clientActivity.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No client data</p>
              ) : (
                <div className="space-y-3">
                  {clientActivity.slice(0, 5).map((client) => (
                    <div 
                      key={client.id} 
                      className="flex items-center justify-between gap-4 p-2 rounded-md bg-muted/30"
                      data-testid={`client-row-${client.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {client.projectCount} project{client.projectCount !== 1 ? "s" : ""}
                          {client.officeDays > 0 && ` • ${client.officeDays} office days`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-medium">
                          {formatMoney(client.paidValueCents)}
                        </p>
                        {client.totalValueCents > client.paidValueCents && (
                          <p className="text-xs text-muted-foreground">
                            of {formatMoney(client.totalValueCents)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card data-testid="recent-activity-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((event) => (
                  <div 
                    key={event.id}
                    className="flex items-start gap-3 p-2 rounded-md hover-elevate"
                    data-testid={`activity-${event.id}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{event.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleDateString()} at {new Date(event.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <Badge appearance="stroke" className="text-xs flex-shrink-0">
                      {event.entityType}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {maintenanceData && (maintenanceData.totalMinutes > 0 || maintenanceData.totalCostCents > 0) && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="stat-maint-total-hours">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Hours (Month)</p>
                      <p className="text-2xl font-bold font-mono">
                        {(maintenanceData.totalMinutes / 60).toFixed(1)}h
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-maint-total-cost">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Cost (Month)</p>
                      <p className="text-2xl font-bold font-mono">
                        ${(maintenanceData.totalCostCents / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-md bg-accent/10 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-accent-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-dev-hours">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Dev Hours</p>
                      <p className="text-2xl font-bold font-mono">
                        {(maintenanceData.devMinutes / 60).toFixed(1)}h
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${(maintenanceData.devCostCents / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
                      <Code className="h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-hosting-hours">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Hosting Hours</p>
                      <p className="text-2xl font-bold font-mono">
                        {(maintenanceData.hostingMinutes / 60).toFixed(1)}h
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${(maintenanceData.hostingCostCents / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-md bg-teal-500/10 flex items-center justify-center">
                      <Wrench className="h-5 w-5 text-teal-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card data-testid="maint-by-project-chart">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Maintenance Cost by Project
                </CardTitle>
                <CardDescription>This month's maintenance spend per project</CardDescription>
              </CardHeader>
              <CardContent>
                {maintenanceData.byProject.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No maintenance data</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={maintenanceData.byProject.map(p => ({
                          name: p.projectName.length > 15 ? p.projectName.slice(0, 15) + "..." : p.projectName,
                          cost: p.totalCostCents / 100,
                          hours: parseFloat((p.totalMinutes / 60).toFixed(1)),
                          type: p.logType,
                        }))}
                        layout="vertical"
                        margin={{ left: 10, right: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          type="number"
                          className="text-xs fill-muted-foreground"
                          tickFormatter={(value) => `$${value}`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          className="text-xs fill-muted-foreground"
                          width={120}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            name === "cost" ? `$${value.toFixed(2)}` : `${value}h`,
                            name === "cost" ? "Cost" : "Hours",
                          ]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.375rem",
                          }}
                        />
                        <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
