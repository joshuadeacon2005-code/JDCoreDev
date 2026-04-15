import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { ClientProfileDialog } from "@/components/ClientProfileDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Users, Briefcase, Calendar, DollarSign, 
  ArrowRight, MapPin, Monitor, ChevronLeft, ChevronRight,
  Clock, TrendingUp, AlertCircle, CheckCircle2, Phone, Video,
  Wrench, Code, Plus, Trash2, Receipt, Bot, TrendingDown, Activity
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, startOfYear, endOfYear, isWithinInterval, isBefore, startOfToday
} from "date-fns";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Client, Project, OfficeDayRequest, Milestone, ReplitCharge } from "@shared/schema";

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

type DevLogsSummary = {
  totalMinutes: number;
  totalCostCents: number;
  devCostCents: number;
  hostingCostCents: number;
  logs: Array<{
    id: number;
    projectId: number;
    projectName: string;
    description: string;
    logDate: string;
    minutesSpent: number;
    totalCostCents: number;
    logType: string;
  }>;
};

type OfficeDayWithClient = OfficeDayRequest & { client?: Client; project?: Project };

export default function AdminDashboard() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [revenueFilter, setRevenueFilter] = useState<string>("all");

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/admin/clients"],
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const { data: officeDays, isLoading: officeDaysLoading } = useQuery<OfficeDayWithClient[]>({
    queryKey: ["/api/admin/office-days"],
  });

  const { data: milestones, isLoading: milestonesLoading } = useQuery<Milestone[]>({
    queryKey: ["/api/admin/milestones"],
  });

  const { data: maintenanceData } = useQuery<MaintenanceAnalytics>({
    queryKey: ["/api/admin/maintenance-analytics"],
  });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;

  const { data: allReplitCharges } = useQuery<ReplitCharge[]>({
    queryKey: ["/api/admin/replit-charges/all"],
  });

  const { data: allDevLogs } = useQuery<DevLogsSummary>({
    queryKey: ["/api/admin/dev-logs-summary/all"],
  });

  const { data: agentActivity } = useQuery<{
    pipelines: any[];
    trades: any[];
    logs: any[];
  }>({
    queryKey: ["/api/trader/agent-activity"],
    queryFn: async () => {
      const r = await fetch("/api/trader/agent-activity");
      if (!r.ok) return { pipelines: [], trades: [], logs: [] };
      return r.json();
    },
    refetchInterval: 60000,
  });

  const [chargesModalOpen, setChargesModalOpen] = useState(false);
  const [devLogsModalOpen, setDevLogsModalOpen] = useState(false);
  const [newChargeAmount, setNewChargeAmount] = useState("");
  const [newChargeDesc, setNewChargeDesc] = useState("");
  const [newChargeDate, setNewChargeDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { toast } = useToast();

  const createChargeMutation = useMutation({
    mutationFn: async (data: { chargeDate: string; amountCents: number; description: string | null; billingMonth: number; billingYear: number }) => {
      const res = await apiRequest("POST", "/api/admin/replit-charges", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/replit-charges/all"] });
      setNewChargeAmount("");
      setNewChargeDesc("");
      setNewChargeDate(format(new Date(), "yyyy-MM-dd"));
      toast({ title: "Charge added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add charge", description: error.message, variant: "destructive" });
    },
  });

  const deleteChargeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/replit-charges/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/replit-charges/all"] });
      toast({ title: "Charge removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove charge", description: error.message, variant: "destructive" });
    },
  });

  const deleteDevLogMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/maintenance-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dev-logs-summary/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/maintenance-analytics"] });
      toast({ title: "Dev log removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove log", description: error.message, variant: "destructive" });
    },
  });

  const handleAddCharge = () => {
    const amountCents = Math.round(parseFloat(newChargeAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) return;
    createChargeMutation.mutate({
      chargeDate: newChargeDate,
      amountCents,
      description: newChargeDesc || null,
      billingMonth: currentMonthNum,
      billingYear: currentYear,
    });
  };

  const replitTotalCents = allReplitCharges?.reduce((sum, c) => sum + c.amountCents, 0) || 0;
  const devTotalCents = allDevLogs?.devCostCents || 0;
  const hostingTotalCents = allDevLogs?.hostingCostCents || 0;
  const allLoggedCents = allDevLogs?.totalCostCents || 0;
  const devTotalMinutes = allDevLogs?.totalMinutes || 0;

  const isLoading = clientsLoading || projectsLoading || officeDaysLoading || milestonesLoading;

  const activeClients = clients?.filter(c => c.status === "active").length || 0;
  const activeProjects = projects?.filter(p => p.status === "active").length || 0;
  const pendingRequests = officeDays?.filter(o => o.status === "requested") || [];
  
  /**
   * REVENUE DEFINITION: Revenue = SUM(milestones.amountCents) WHERE status === "paid"
   * All amounts in cents. Divide by 100 for display. Matches analytics/projects/client-detail.
   */
  const paidMilestones = milestones?.filter(m => m.status === "paid") || [];
  
  const getFilteredRevenue = () => {
    if (revenueFilter === "all") {
      return paidMilestones.reduce((sum, m) => sum + m.amountCents, 0);
    }
    
    const [year, month] = revenueFilter.split("-").map(Number);
    const filterStart = new Date(year, month - 1, 1);
    const filterEnd = endOfMonth(filterStart);
    
    return paidMilestones
      .filter(m => {
        // Use paidDate first, then dueDate, then createdAt as fallback
        const effectiveDate = m.paidDate 
          ? new Date(m.paidDate) 
          : m.dueDate 
            ? new Date(m.dueDate) 
            : new Date(m.createdAt);
        return isWithinInterval(effectiveDate, { start: filterStart, end: filterEnd });
      })
      .reduce((sum, m) => sum + m.amountCents, 0);
  };

  const filteredRevenue = getFilteredRevenue();
  const totalRevenue = paidMilestones.reduce((sum, m) => sum + m.amountCents, 0);

  const recentProjects = projects?.slice(0, 4) || [];
  const activeClientsList = clients?.filter(c => c.status === "active").slice(0, 4) || [];

  const approvedOfficeDays = officeDays?.filter(o => o.status === "approved" || o.status === "requested") || [];

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const firstDayOfWeek = monthStart.getDay();
  const paddingDays = Array(firstDayOfWeek).fill(null);

  const getOfficeDaysForDate = (date: Date) => {
    return approvedOfficeDays.filter(od => {
      const odDate = new Date(od.date);
      return isSameDay(odDate, date);
    });
  };

  const handleClientClick = (client: Client) => {
    setSelectedClient(client);
    setIsProfileOpen(true);
  };

  const getMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = subMonths(now, i);
      options.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy"),
      });
    }
    return options;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-muted-foreground text-sm">Overview of your business</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/admin/clients">
              <Button variant="outline" size="sm" data-testid="button-quick-clients">
                <Users className="h-4 w-4 mr-2" /> Clients
              </Button>
            </Link>
            <Link href="/admin/projects">
              <Button variant="outline" size="sm" data-testid="button-quick-projects">
                <Briefcase className="h-4 w-4 mr-2" /> Projects
              </Button>
            </Link>
            <Link href="/admin/office-days">
              <Button variant="outline" size="sm" data-testid="button-quick-office-days">
                <Calendar className="h-4 w-4 mr-2" /> Office Days
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 rounded-lg border bg-card">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))
          ) : (
            <>
              <div className="p-4 rounded-lg border bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200/50 dark:border-blue-800/30">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                  <Users className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Active Clients</span>
                </div>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300" data-testid="stat-active-clients">{activeClients}</p>
              </div>
              
              <div className="p-4 rounded-lg border bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-950/30 dark:to-teal-900/20 border-teal-200/50 dark:border-teal-800/30">
                <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 mb-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Active Projects</span>
                </div>
                <p className="text-2xl font-bold text-teal-700 dark:text-teal-300" data-testid="stat-active-projects">{activeProjects}</p>
              </div>
              
              <div className="p-4 rounded-lg border bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200/50 dark:border-amber-800/30">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Pending Requests</span>
                </div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300" data-testid="stat-pending-requests">{pendingRequests.length}</p>
              </div>
              
              <div className="p-4 rounded-lg border bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">This Month</span>
                </div>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300" data-testid="stat-month-bookings">
                  {approvedOfficeDays.filter(od => {
                    const odDate = new Date(od.date);
                    return isWithinInterval(odDate, { start: monthStart, end: monthEnd });
                  }).length} days
                </p>
              </div>
            </>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border-emerald-200/50 dark:border-emerald-800/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-lg text-emerald-900 dark:text-emerald-100">Revenue</CardTitle>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                    {revenueFilter === "all" ? "All time" : format(new Date(revenueFilter + "-01"), "MMMM yyyy")}
                  </p>
                </div>
              </div>
              <Select value={revenueFilter} onValueChange={setRevenueFilter}>
                <SelectTrigger className="w-[160px] bg-white/50 dark:bg-black/20" data-testid="select-revenue-filter">
                  <SelectValue placeholder="Filter by month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  {getMonthOptions().map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-16 w-48" />
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-4xl font-bold text-emerald-700 dark:text-emerald-300" data-testid="text-revenue-amount">
                      ${(filteredRevenue / 100).toLocaleString()}
                    </p>
                    {revenueFilter !== "all" && (
                      <p className="text-sm text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                        Total to date: ${(totalRevenue / 100).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-4 pt-2 border-t border-emerald-200/50 dark:border-emerald-700/30">
                    <div>
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Paid Invoices</p>
                      <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{paidMilestones.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Pending</p>
                      <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                        {milestones?.filter(m => m.status === "invoiced").length || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Overdue</p>
                      <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                        {milestones?.filter(m => m.status === "overdue").length || 0}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {pendingRequests.length > 0 ? (
            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-amber-200/50 dark:border-amber-800/30">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <CardTitle className="text-base text-amber-900 dark:text-amber-100">Pending Requests</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-amber-200/50 text-amber-700 dark:bg-amber-800/30 dark:text-amber-300">
                  {pendingRequests.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingRequests.slice(0, 4).map((request) => {
                  const client = clients?.find(c => c.id === request.clientId);
                  return (
                    <div 
                      key={request.id} 
                      className="flex items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-black/20"
                      data-testid={`pending-request-${request.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${
                          request.dayType === "onsite" 
                            ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                            : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                        }`}>
                          {request.dayType === "onsite" ? (
                            <MapPin className="h-3 w-3" />
                          ) : (
                            <Monitor className="h-3 w-3" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                            {format(new Date(request.date), "MMM d")}
                          </p>
                          <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70">
                            {client?.name?.split(' ')[0] || "Unknown"}
                          </p>
                        </div>
                      </div>
                      <Link href="/admin/office-days">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-700 dark:text-amber-300">
                          Review
                        </Button>
                      </Link>
                    </div>
                  );
                })}
                {pendingRequests.length > 4 && (
                  <Link href="/admin/office-days">
                    <Button variant="ghost" size="sm" className="w-full text-amber-700 dark:text-amber-300">
                      View all {pendingRequests.length} requests
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <CardTitle className="text-base">All Clear</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No pending requests to review.</p>
                <div className="mt-4 p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2">Quick Stats</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="font-medium">{approvedOfficeDays.filter(o => o.status === "approved").length}</p>
                      <p className="text-xs text-muted-foreground">Approved days</p>
                    </div>
                    <div>
                      <p className="font-medium">{projects?.filter(p => p.status === "active").length || 0}</p>
                      <p className="text-xs text-muted-foreground">Active projects</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Upcoming Payments</CardTitle>
            </div>
            <Link href="/admin/milestones">
              <Button variant="ghost" size="sm" className="text-xs">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (() => {
              const upcomingMilestones = milestones
                ?.filter(m => m.status === "planned" || m.status === "invoiced" || m.status === "overdue")
                .sort((a, b) => {
                  const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                  const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                  return dateA - dateB;
                })
                .slice(0, 5) || [];
              
              if (upcomingMilestones.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No upcoming payments scheduled.
                  </p>
                );
              }
              
              return (
                <div className="space-y-2">
                  {upcomingMilestones.map((milestone) => {
                    const project = projects?.find(p => p.id === milestone.projectId);
                    const isOverdue = milestone.status === "overdue" || 
                      (milestone.dueDate && isBefore(new Date(milestone.dueDate), startOfToday()) && milestone.status !== "paid");
                    
                    return (
                      <div 
                        key={milestone.id}
                        className={`flex items-center justify-between gap-4 p-3 rounded-lg ${
                          isOverdue 
                            ? "bg-red-50 dark:bg-red-950/30 border border-red-200/50 dark:border-red-800/30" 
                            : "bg-muted/50"
                        }`}
                        data-testid={`upcoming-payment-${milestone.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{milestone.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {project?.name || "Unknown project"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="font-mono font-medium text-sm">
                              ${(milestone.amountCents / 100).toLocaleString()}
                            </p>
                            <p className={`text-xs ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                              {milestone.dueDate 
                                ? format(new Date(milestone.dueDate), "MMM d, yyyy")
                                : "No due date"}
                            </p>
                          </div>
                          <StatusBadge status={milestone.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card data-testid="dev-spending-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Dev Spending (All Time)</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Dialog open={devLogsModalOpen} onOpenChange={setDevLogsModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-open-dev-logs">
                    <Code className="h-3 w-3 mr-1" />
                    Logged ({allDevLogs?.logs.length || 0})
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle>All Maintenance Logs</DialogTitle>
                  </DialogHeader>
                  <div className="flex gap-2 pb-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Code className="h-3 w-3 text-blue-500" /> Dev: <span className="font-mono text-foreground">${(devTotalCents / 100).toFixed(2)}</span></span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3 text-teal-500" /> Hosting: <span className="font-mono text-foreground">${(hostingTotalCents / 100).toFixed(2)}</span></span>
                  </div>
                  <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                    {allDevLogs?.logs && allDevLogs.logs.length > 0 ? (
                      <>
                        {allDevLogs.logs.map((log) => (
                          <div key={log.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50" data-testid={`dev-log-item-${log.id}`}>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {log.logType === "development"
                                  ? <Code className="h-3 w-3 text-blue-500 flex-shrink-0" />
                                  : <Wrench className="h-3 w-3 text-teal-500 flex-shrink-0" />}
                                <p className="text-sm truncate">{log.description}</p>
                              </div>
                              <p className="text-xs text-muted-foreground pl-4">
                                {log.projectName} · {format(new Date(log.logDate + "T00:00:00"), "MMM d, yyyy")}
                                {log.minutesSpent > 0 && ` · ${(log.minutesSpent / 60).toFixed(1)}h`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm font-mono">${(log.totalCostCents / 100).toFixed(2)}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteDevLogMutation.mutate(log.id)}
                                disabled={deleteDevLogMutation.isPending}
                                data-testid={`button-delete-dev-log-${log.id}`}
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="text-xs text-muted-foreground font-medium">Total All Logs</span>
                          <span className="text-sm font-mono font-bold">${(allLoggedCents / 100).toFixed(2)}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No logs found</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={chargesModalOpen} onOpenChange={setChargesModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-open-replit-charges">
                    <Plus className="h-3 w-3 mr-1" />
                    Add Charge
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle>Replit Charges (All Time)</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="charge-date">Date</Label>
                        <Input
                          id="charge-date"
                          type="date"
                          value={newChargeDate}
                          onChange={(e) => setNewChargeDate(e.target.value)}
                          data-testid="input-charge-date"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="charge-amount">Amount ($)</Label>
                        <Input
                          id="charge-amount"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={newChargeAmount}
                          onChange={(e) => setNewChargeAmount(e.target.value)}
                          data-testid="input-charge-amount"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="charge-desc">Description</Label>
                      <Input
                        id="charge-desc"
                        placeholder="e.g., Agent usage, deployment..."
                        value={newChargeDesc}
                        onChange={(e) => setNewChargeDesc(e.target.value)}
                        data-testid="input-charge-description"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddCharge}
                      disabled={!newChargeAmount || createChargeMutation.isPending}
                      className="w-full"
                      data-testid="button-add-charge"
                    >
                      {createChargeMutation.isPending ? "Adding..." : "Add Charge"}
                    </Button>

                    {allReplitCharges && allReplitCharges.length > 0 && (
                      <div className="border-t pt-3 space-y-2 max-h-[40vh] overflow-y-auto">
                        <p className="text-xs text-muted-foreground font-medium">All charges</p>
                        {allReplitCharges.map((charge) => (
                          <div key={charge.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50" data-testid={`charge-item-${charge.id}`}>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm truncate">{charge.description || "Replit charge"}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(charge.chargeDate + "T00:00:00"), "MMM d, yyyy")}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm font-mono">${(charge.amountCents / 100).toFixed(2)}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteChargeMutation.mutate(charge.id)}
                                disabled={deleteChargeMutation.isPending}
                                data-testid={`button-delete-charge-${charge.id}`}
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="text-xs text-muted-foreground font-medium">Total Replit Charges</span>
                          <span className="text-sm font-mono font-bold">${(replitTotalCents / 100).toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1 cursor-pointer" onClick={() => setDevLogsModalOpen(true)}>
                <p className="text-xs text-muted-foreground">Logged Costs</p>
                <p className="text-xl font-bold font-mono" data-testid="text-dev-logged-cost">
                  ${(allLoggedCents / 100).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5"><Code className="h-2.5 w-2.5" />${(devTotalCents / 100).toFixed(2)}</span>
                  {" · "}
                  <span className="inline-flex items-center gap-0.5"><Wrench className="h-2.5 w-2.5" />${(hostingTotalCents / 100).toFixed(2)}</span>
                </p>
              </div>
              <div className="space-y-1 cursor-pointer" onClick={() => setChargesModalOpen(true)}>
                <p className="text-xs text-muted-foreground">Replit Charges</p>
                <p className="text-xl font-bold font-mono" data-testid="text-replit-charges-total">
                  ${(replitTotalCents / 100).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {allReplitCharges?.length || 0} charge{(allReplitCharges?.length || 0) !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Difference</p>
                {(() => {
                  const diff = allLoggedCents - replitTotalCents;
                  const isMatch = Math.abs(diff) < 100;
                  return (
                    <>
                      <p className={`text-xl font-bold font-mono ${isMatch ? "text-emerald-600 dark:text-emerald-400" : diff > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-dev-difference">
                        {diff >= 0 ? "+" : "-"}${(Math.abs(diff) / 100).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isMatch ? "Matched" : diff > 0 ? "Over-logged" : "Under-logged"}
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
            {replitTotalCents > 0 && allLoggedCents > 0 && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs text-muted-foreground">Logging accuracy</span>
                  <span className="text-xs font-mono">
                    {Math.min(100, Math.round((allLoggedCents / replitTotalCents) * 100))}%
                  </span>
                </div>
                <Progress
                  value={Math.min(100, Math.round((allLoggedCents / replitTotalCents) * 100))}
                  className="h-2"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {maintenanceData && (maintenanceData.totalMinutes > 0 || maintenanceData.totalCostCents > 0) && (
          <Card data-testid="maintenance-overview-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Maintenance This Month</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Hours</p>
                  <p className="text-xl font-bold font-mono" data-testid="text-maint-total-hours">
                    {(maintenanceData.totalMinutes / 60).toFixed(1)}h
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="text-xl font-bold font-mono" data-testid="text-maint-total-cost">
                    ${(maintenanceData.totalCostCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Code className="h-3 w-3 text-blue-500" />
                    <p className="text-xs text-muted-foreground">Dev Work</p>
                  </div>
                  <p className="text-lg font-mono">
                    {(maintenanceData.devMinutes / 60).toFixed(1)}h
                    <span className="text-sm text-muted-foreground ml-1">(${(maintenanceData.devCostCents / 100).toFixed(2)})</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Wrench className="h-3 w-3 text-teal-500" />
                    <p className="text-xs text-muted-foreground">Hosting</p>
                  </div>
                  <p className="text-lg font-mono">
                    {(maintenanceData.hostingMinutes / 60).toFixed(1)}h
                    <span className="text-sm text-muted-foreground ml-1">(${(maintenanceData.hostingCostCents / 100).toFixed(2)})</span>
                  </p>
                </div>
              </div>
              {maintenanceData.byProject.length > 0 && (
                <div className="mt-4 pt-3 border-t space-y-2">
                  <p className="text-xs text-muted-foreground">Top Projects</p>
                  {maintenanceData.byProject.slice(0, 4).map((p) => (
                    <div key={`${p.projectId}-${p.logType}`} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {p.logType === "development" ? (
                          <Code className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        ) : (
                          <Wrench className="h-3 w-3 text-teal-500 flex-shrink-0" />
                        )}
                        <span className="text-sm truncate">{p.projectName}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{(p.totalMinutes / 60).toFixed(1)}h</span>
                        <span className="text-sm font-mono">${(p.totalCostCents / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">Unified Calendar</CardTitle>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  data-testid="button-prev-month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[100px] text-center">
                  {format(currentMonth, "MMM yyyy")}
                </span>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  data-testid="button-next-month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
                      <div key={i} className="py-1">{day}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {paddingDays.map((_, i) => (
                      <div key={`padding-${i}`} className="h-14 rounded-md" />
                    ))}
                    {calendarDays.map((day) => {
                      const dayOfficeDays = getOfficeDaysForDate(day);
                      const hasOfficeDays = dayOfficeDays.length > 0;
                      
                      return (
                        <div
                          key={day.toISOString()}
                          className={`h-14 rounded-md p-1 text-xs border ${
                            isToday(day) 
                              ? "border-primary bg-primary/5" 
                              : "border-transparent hover:bg-muted/50"
                          }`}
                        >
                          <div className={`text-[10px] font-medium ${isToday(day) ? "text-primary" : "text-muted-foreground"}`}>
                            {format(day, "d")}
                          </div>
                          {hasOfficeDays && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {dayOfficeDays.slice(0, 3).map((od) => (
                                <div
                                  key={od.id}
                                  className={`w-2 h-2 rounded-full ${
                                    od.dayType === "onsite" 
                                      ? "bg-gradient-to-br from-teal-400 to-teal-600"
                                      : "bg-gradient-to-br from-cyan-400 to-cyan-600"
                                  } ${od.status === "requested" ? "opacity-50 ring-1 ring-amber-400" : ""}`}
                                  title={`${clients?.find(c => c.id === od.clientId)?.name || "Unknown"} - ${od.dayType}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-3 text-[10px] border-t">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-teal-400 to-teal-600" />
                      <span className="text-muted-foreground font-medium">On-site</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600" />
                      <span className="text-muted-foreground font-medium">Remote</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600" />
                      <span className="text-muted-foreground font-medium">Call</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600" />
                      <span className="text-muted-foreground font-medium">Video</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">Active Clients</CardTitle>
              <Link href="/admin/clients">
                <Button variant="ghost" size="sm" data-testid="button-view-all-clients">
                  All <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : activeClientsList.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-muted-foreground mb-2">No active clients</p>
                  <Link href="/admin/clients">
                    <Button variant="outline" size="sm">Add Client</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {activeClientsList.map((client) => (
                    <div 
                      key={client.id} 
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                      onClick={() => handleClientClick(client)}
                      data-testid={`quick-client-${client.id}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{client.name}</p>
                        {client.companyName && (
                          <p className="text-[10px] text-muted-foreground truncate">{client.companyName}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">Recent Projects</CardTitle>
              <Link href="/admin/projects">
                <Button variant="ghost" size="sm" data-testid="button-view-all-projects">
                  All <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : recentProjects.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No projects yet</p>
              ) : (
                <div className="space-y-1.5">
                  {recentProjects.map((project) => {
                    const client = clients?.find(c => c.id === project.clientId);
                    return (
                      <Link key={project.id} href={`/admin/projects/${project.id}`}>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover-elevate cursor-pointer">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{project.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {client?.name || "Unknown client"}
                            </p>
                          </div>
                          <div className="flex gap-1.5 ml-2">
                            <StatusBadge status={project.status} />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">Upcoming Days</CardTitle>
              <Link href="/admin/office-days">
                <Button variant="ghost" size="sm" data-testid="button-view-all-office-days">
                  All <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : approvedOfficeDays.filter(o => o.status === "approved").length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No upcoming days</p>
              ) : (
                <div className="space-y-1.5">
                  {approvedOfficeDays.filter(o => o.status === "approved").slice(0, 4).map((request) => {
                    const client = clients?.find(c => c.id === request.clientId);
                    return (
                      <div key={request.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded ${
                            request.dayType === "onsite" 
                              ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                              : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                          }`}>
                            {request.dayType === "onsite" ? (
                              <MapPin className="h-3 w-3" />
                            ) : (
                              <Monitor className="h-3 w-3" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {format(new Date(request.date), "EEE, MMM d")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {client?.name || "Unknown"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

        {/* ── Agent Activity Widget ──────────────────────────────────────────── */}
        {(agentActivity?.pipelines?.length || 0) > 0 && (
          <div className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-teal-500" />
                  Recent Agent Activity
                </CardTitle>
                <Link href="/admin/trader/predictions">
                  <Button variant="ghost" size="sm" data-testid="button-view-agent-chat">
                    Predictions <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Pipeline runs */}
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Pipeline Runs
                    </p>
                    <div className="space-y-1.5">
                      {(agentActivity?.pipelines || []).slice(0, 6).map((p: any, i: number) => {
                        const modeColors: Record<string, string> = {
                          day: "text-teal-600 dark:text-teal-400",
                          swing: "text-purple-600 dark:text-purple-400",
                          portfolio: "text-green-600 dark:text-green-400",
                          crypto: "text-orange-600 dark:text-orange-400",
                        };
                        const modeColor = modeColors[p.mode] || "text-muted-foreground";
                        return (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                            <div className="flex-shrink-0 mt-0.5">
                              {p.pass
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                : <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`text-[10px] font-semibold uppercase ${modeColor}`}>{p.mode}</span>
                                <span className="text-[10px] text-muted-foreground">·</span>
                                <span className="text-[10px] text-muted-foreground">Score {p.score}</span>
                                {p.ter && p.ter !== "N/A" && (
                                  <>
                                    <span className="text-[10px] text-muted-foreground">·</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">{p.ter}</span>
                                  </>
                                )}
                              </div>
                              {p.thesis && (
                                <p className="text-[11px] text-foreground/80 truncate">{p.thesis}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {p.logged_at ? format(new Date(p.logged_at), "MMM d, HH:mm") : "—"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recent trades */}
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Recent Trades
                    </p>
                    {(agentActivity?.trades || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No trades yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(agentActivity?.trades || []).slice(0, 6).map((t: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                            <div className="flex-shrink-0 mt-0.5">
                              {t.side === "buy"
                                ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                                : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold font-mono">{t.symbol}</span>
                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${t.side === "buy" ? "text-emerald-600 border-emerald-500/30" : "text-red-500 border-red-500/30"}`}>
                                  {t.side?.toUpperCase()}
                                </Badge>
                                {t.notional && (
                                  <span className="text-[10px] text-muted-foreground">${parseFloat(t.notional).toFixed(0)}</span>
                                )}
                              </div>
                              {t.rationale && (
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.rationale}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground">
                                {t.logged_at ? format(new Date(t.logged_at), "MMM d, HH:mm") : "—"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      <ClientProfileDialog
        client={selectedClient}
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
      />
    </AdminLayout>
  );
}
