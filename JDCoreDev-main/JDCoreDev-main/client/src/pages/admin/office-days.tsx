import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, Check, X, Loader2, Plus, Mail, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { OfficeDayRequest, Client, Project } from "@shared/schema";

type OfficeDayWithDetails = OfficeDayRequest & {
  client?: Client;
  project?: Project;
};

type ProjectWithClient = Project & { client?: Client };

const scheduleFormSchema = z.object({
  clientId: z.number().min(1, "Client is required"),
  projectId: z.number().min(1, "Project is required"),
  date: z.string().min(1, "Date is required"),
  dayType: z.enum(["onsite", "remote", "both"]),
  notes: z.string().optional(),
});

type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

export default function AdminOfficeDays() {
  const { toast } = useToast();
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);

  const { data: officeDays, isLoading } = useQuery<OfficeDayWithDetails[]>({
    queryKey: ["/api/admin/office-days"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/admin/clients"],
  });

  const { data: projects } = useQuery<ProjectWithClient[]>({
    queryKey: ["/api/admin/projects"],
  });

  const scheduleForm = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      clientId: 0,
      projectId: 0,
      date: "",
      dayType: "onsite",
      notes: "",
    },
  });

  const selectedClientId = scheduleForm.watch("clientId");
  const clientProjects = projects?.filter(p => p.clientId === selectedClientId) || [];

  const scheduleMutation = useMutation({
    mutationFn: async (data: ScheduleFormData) => {
      const res = await apiRequest("POST", `/api/admin/office-days`, data);
      return res.json();
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/office-days"] });
      const emailsSent = response?.emailsSent || {};
      if (emailsSent.client || emailsSent.admin) {
        toast({ 
          title: "Office day scheduled", 
          description: `Email notifications sent${emailsSent.client ? " to client" : ""}${emailsSent.client && emailsSent.admin ? " and" : ""}${emailsSent.admin ? " to you" : ""}.` 
        });
      } else {
        toast({ title: "Office day scheduled", description: "No emails sent (check email configuration)." });
      }
      setIsScheduleDialogOpen(false);
      scheduleForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to schedule", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/admin/office-days/${id}`, { status });
      return res.json();
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/office-days"] });
      toast({ title: `Request ${status}` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update request", description: error.message, variant: "destructive" });
    },
  });

  const pendingRequests = officeDays?.filter(o => o.status === "requested") || [];
  const pastRequests = officeDays?.filter(o => o.status !== "requested") || [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Office Days</h1>
            <p className="text-muted-foreground">Manage office day requests and schedule your own</p>
          </div>
          <Button onClick={() => setIsScheduleDialogOpen(true)} data-testid="button-schedule-office-day">
            <Plus className="h-4 w-4 mr-2" />
            Schedule Office Day
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pending Requests
              {pendingRequests.length > 0 && (
                <span className="text-sm font-normal px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mb-4 opacity-50" />
                <p>No pending requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div 
                    key={request.id} 
                    className="flex items-center justify-between gap-4 p-4 rounded-lg bg-muted/50"
                    data-testid={`request-${request.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">
                          {format(new Date(request.date), "EEEE, MMMM d, yyyy")}
                        </p>
                        <StatusBadge status={request.dayType} />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {request.client?.name || "Unknown client"} - {request.project?.name || "Unknown project"}
                      </p>
                      {request.notes && (
                        <p className="text-sm text-muted-foreground mt-1 italic">{request.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateMutation.mutate({ id: request.id, status: "rejected" })}
                        disabled={updateMutation.isPending}
                        data-testid={`button-reject-${request.id}`}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: request.id, status: "approved" })}
                        disabled={updateMutation.isPending}
                        data-testid={`button-approve-${request.id}`}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Past Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : pastRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No past requests</p>
            ) : (
              <div className="space-y-2">
                {pastRequests.map((request) => (
                  <div 
                    key={request.id} 
                    className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          {format(new Date(request.date), "MMM d, yyyy")}
                        </p>
                        <StatusBadge status={request.dayType} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {request.client?.name || "Unknown"} - {request.project?.name || "Unknown"}
                      </p>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isScheduleDialogOpen} onOpenChange={(open) => {
          setIsScheduleDialogOpen(open);
          if (!open) {
            scheduleForm.reset();
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Schedule Office Day
              </DialogTitle>
              <DialogDescription>
                Schedule an office day with a client. Email notifications will be sent automatically.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={scheduleForm.handleSubmit((data) => scheduleMutation.mutate(data))} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-client">Client *</Label>
                <Select
                  value={selectedClientId > 0 ? selectedClientId.toString() : ""}
                  onValueChange={(v) => {
                    scheduleForm.setValue("clientId", parseInt(v), { shouldValidate: true });
                    scheduleForm.setValue("projectId", 0);
                  }}
                >
                  <SelectTrigger data-testid="select-schedule-client">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id.toString()}>
                        {client.companyName || client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {scheduleForm.formState.errors.clientId && (
                  <p className="text-sm text-destructive">{scheduleForm.formState.errors.clientId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-project">Project *</Label>
                <Select
                  value={scheduleForm.watch("projectId") > 0 ? scheduleForm.watch("projectId").toString() : ""}
                  onValueChange={(v) => scheduleForm.setValue("projectId", parseInt(v), { shouldValidate: true })}
                  disabled={clientProjects.length === 0}
                >
                  <SelectTrigger data-testid="select-schedule-project">
                    <SelectValue placeholder={clientProjects.length === 0 ? "Select a client first" : "Select a project"} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {scheduleForm.formState.errors.projectId && (
                  <p className="text-sm text-destructive">{scheduleForm.formState.errors.projectId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-date">Date *</Label>
                <Input
                  id="schedule-date"
                  type="date"
                  {...scheduleForm.register("date")}
                  data-testid="input-schedule-date"
                />
                {scheduleForm.formState.errors.date && (
                  <p className="text-sm text-destructive">{scheduleForm.formState.errors.date.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-type">Day Type</Label>
                <Select
                  value={scheduleForm.watch("dayType")}
                  onValueChange={(v) => scheduleForm.setValue("dayType", v as "onsite" | "remote" | "both")}
                >
                  <SelectTrigger data-testid="select-schedule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onsite">On-site</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="both">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-notes">Notes (optional)</Label>
                <Textarea
                  id="schedule-notes"
                  placeholder="Any additional details for the client..."
                  {...scheduleForm.register("notes")}
                  data-testid="input-schedule-notes"
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span>The client and you will receive email notifications when scheduled.</span>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setIsScheduleDialogOpen(false)} data-testid="button-cancel-schedule">
                  Cancel
                </Button>
                <Button type="submit" disabled={scheduleMutation.isPending} data-testid="button-confirm-schedule">
                  {scheduleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Schedule
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
