import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminLayout } from "@/components/AdminLayout";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Loader2, X, Calendar, Check, Mail, Phone, Video, Clock, MessageSquare } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import type { AvailabilityRules, AvailabilityBlock, OfficeDayRequest, Client, Project } from "@shared/schema";

const rulesSchema = z.object({
  monday: z.boolean(),
  tuesday: z.boolean(),
  wednesday: z.boolean(),
  thursday: z.boolean(),
  friday: z.boolean(),
  saturday: z.boolean(),
  sunday: z.boolean(),
  defaultType: z.enum(["onsite", "remote", "both"]),
  maxDaysPerWeek: z.number().min(1).max(7),
  maxDaysPerMonth: z.number().min(1).max(31),
});

const blockSchema = z.object({
  date: z.string().min(1, "Date is required"),
  reason: z.string().optional(),
});

const scheduleFormSchema = z.object({
  clientId: z.number().min(1, "Client is required"),
  projectId: z.number().min(1, "Project is required"),
  date: z.string().min(1, "Date is required"),
  dayType: z.enum(["onsite", "remote", "both"]),
  notes: z.string().optional(),
});

type RulesFormData = z.infer<typeof rulesSchema>;
type BlockFormData = z.infer<typeof blockSchema>;
type ScheduleFormData = z.infer<typeof scheduleFormSchema>;
type OfficeDayWithDetails = OfficeDayRequest & { client?: Client; project?: Project };
type ProjectWithClient = Project & { client?: Client };

interface MeetingRequest {
  id: number;
  name: string;
  email: string;
  company: string | null;
  meetingType: "call" | "video";
  requestedDate: string;
  requestedTime: string;
  duration: number;
  status: "requested" | "proposed" | "confirmed" | "denied" | "cancelled";
  adminNotes: string | null;
  secureToken: string;
  createdAt: string;
}

interface Proposal {
  proposedDate: string;
  proposedTime: string;
  duration: number;
}

function AvailabilityTab() {
  const { toast } = useToast();
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);

  const { data: rules, isLoading: rulesLoading } = useQuery<AvailabilityRules>({
    queryKey: ["/api/admin/availability/rules"],
  });

  const { data: blocks, isLoading: blocksLoading } = useQuery<AvailabilityBlock[]>({
    queryKey: ["/api/admin/availability/blocks"],
  });

  const rulesForm = useForm<RulesFormData>({
    resolver: zodResolver(rulesSchema),
    values: rules ? {
      monday: rules.monday,
      tuesday: rules.tuesday,
      wednesday: rules.wednesday,
      thursday: rules.thursday,
      friday: rules.friday,
      saturday: rules.saturday,
      sunday: rules.sunday,
      defaultType: rules.defaultType as "onsite" | "remote" | "both",
      maxDaysPerWeek: rules.maxDaysPerWeek,
      maxDaysPerMonth: rules.maxDaysPerMonth,
    } : undefined,
  });

  const blockForm = useForm<BlockFormData>({
    resolver: zodResolver(blockSchema),
    defaultValues: { date: "", reason: "" },
  });

  const updateRulesMutation = useMutation({
    mutationFn: async (data: RulesFormData) => {
      const res = await apiRequest("PUT", "/api/admin/availability/rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/availability/rules"] });
      toast({ title: "Availability rules updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update rules", description: error.message, variant: "destructive" });
    },
  });

  const createBlockMutation = useMutation({
    mutationFn: async (data: BlockFormData) => {
      const res = await apiRequest("POST", "/api/admin/availability/blocks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/availability/blocks"] });
      toast({ title: "Date blocked successfully" });
      setIsBlockDialogOpen(false);
      blockForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to block date", description: error.message, variant: "destructive" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/availability/blocks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/availability/blocks"] });
      toast({ title: "Block removed" });
    },
  });

  const availableDates: string[] = [];
  const blockedDates = blocks?.map(b => b.date) || [];

  if (rules) {
    const weekdays = [rules.sunday, rules.monday, rules.tuesday, rules.wednesday, rules.thursday, rules.friday, rules.saturday];
    for (let i = 0; i < 60; i++) {
      const date = addDays(new Date(), i);
      const dayOfWeek = date.getDay();
      if (weekdays[dayOfWeek]) {
        const dateStr = format(date, "yyyy-MM-dd");
        if (!blockedDates.includes(dateStr)) {
          availableDates.push(dateStr);
        }
      }
    }
  }

  const isLoading = rulesLoading || blocksLoading;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Schedule</CardTitle>
            <CardDescription>Set which days of the week you're available</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <form onSubmit={rulesForm.handleSubmit((data) => updateRulesMutation.mutate(data))} className="space-y-4">
                <div className="space-y-3">
                  {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day) => (
                    <div key={day} className="flex items-center justify-between">
                      <Label htmlFor={day} className="capitalize">{day}</Label>
                      <Switch
                        id={day}
                        checked={rulesForm.watch(day)}
                        onCheckedChange={(v) => rulesForm.setValue(day, v)}
                      />
                    </div>
                  ))}
                </div>
                <div className="pt-4 space-y-4 border-t">
                  <div className="space-y-2">
                    <Label>Default Day Type</Label>
                    <Select
                      value={rulesForm.watch("defaultType")}
                      onValueChange={(v) => rulesForm.setValue("defaultType", v as any)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onsite">On-site</SelectItem>
                        <SelectItem value="remote">Remote</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="maxWeek">Max Days/Week</Label>
                      <Input
                        id="maxWeek"
                        type="number"
                        min={1}
                        max={7}
                        {...rulesForm.register("maxDaysPerWeek", { valueAsNumber: true })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxMonth">Max Days/Month</Label>
                      <Input
                        id="maxMonth"
                        type="number"
                        min={1}
                        max={31}
                        {...rulesForm.register("maxDaysPerMonth", { valueAsNumber: true })}
                      />
                    </div>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={updateRulesMutation.isPending}>
                  {updateRulesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Rules
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Blocked Dates</CardTitle>
              <CardDescription>Block specific dates</CardDescription>
            </div>
            <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-block">
                  <Plus className="h-4 w-4 mr-1" /> Block Date
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Block a Date</DialogTitle>
                </DialogHeader>
                <form onSubmit={blockForm.handleSubmit((data) => createBlockMutation.mutate(data))} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="block-date">Date</Label>
                    <Input
                      id="block-date"
                      type="date"
                      {...blockForm.register("date")}
                      data-testid="input-block-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="block-reason">Reason (optional)</Label>
                    <Input
                      id="block-reason"
                      placeholder="e.g., Holiday"
                      {...blockForm.register("reason")}
                      data-testid="input-block-reason"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createBlockMutation.isPending}>
                    {createBlockMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Block Date
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : blocks?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No blocked dates</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {blocks?.map((block) => (
                  <Badge key={block.id} variant="secondary" className="gap-1.5 py-1 px-2">
                    {format(new Date(block.date), "MMM d, yyyy")}
                    {block.reason && <span className="text-muted-foreground">({block.reason})</span>}
                    <button
                      onClick={() => deleteBlockMutation.mutate(block.id)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-remove-block-${block.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>60-Day Calendar Preview</CardTitle>
          <CardDescription>Shows your availability for the next 60 days</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <AvailabilityCalendar
              availableDates={availableDates}
              blockedDates={blockedDates}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OfficeDaysTab() {
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
    <div className="space-y-6">
      <div className="flex justify-end">
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
        if (!open) scheduleForm.reset();
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-date">Date *</Label>
              <Input
                id="schedule-date"
                type="date"
                {...scheduleForm.register("date")}
                data-testid="input-schedule-date"
              />
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
              <Button type="button" variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>
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
  );
}

function MeetingsTab() {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<MeetingRequest | null>(null);
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([
    { proposedDate: "", proposedTime: "", duration: 30 },
  ]);
  const [adminNotes, setAdminNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: requests, isLoading } = useQuery<MeetingRequest[]>({
    queryKey: ["/api/admin/meeting-requests"],
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/meeting-requests/${id}/confirm`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Meeting confirmed", description: "The meeting has been confirmed and reminders scheduled." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/meeting-requests"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const denyMutation = useMutation({
    mutationFn: async ({ id, adminNotes }: { id: number; adminNotes: string }) => {
      const res = await apiRequest("POST", `/api/admin/meeting-requests/${id}/deny`, { adminNotes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Meeting denied", description: "The request has been denied." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/meeting-requests"] });
      setDenyDialogOpen(false);
      setAdminNotes("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const proposeMutation = useMutation({
    mutationFn: async ({ id, proposals, adminNotes }: { id: number; proposals: Proposal[]; adminNotes: string }) => {
      const res = await apiRequest("POST", `/api/admin/meeting-requests/${id}/propose`, { proposals, adminNotes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Proposals sent", description: "The client will receive options to choose from." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/meeting-requests"] });
      setProposalDialogOpen(false);
      setProposals([{ proposedDate: "", proposedTime: "", duration: 30 }]);
      setAdminNotes("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addProposal = () => {
    if (proposals.length < 3) {
      setProposals([...proposals, { proposedDate: "", proposedTime: "", duration: 30 }]);
    }
  };

  const updateProposal = (index: number, field: keyof Proposal, value: string | number) => {
    const updated = [...proposals];
    updated[index] = { ...updated[index], [field]: value };
    setProposals(updated);
  };

  const removeProposal = (index: number) => {
    if (proposals.length > 1) {
      setProposals(proposals.filter((_, i) => i !== index));
    }
  };

  const openProposalDialog = (request: MeetingRequest) => {
    setSelectedRequest(request);
    const tomorrow = format(addDays(parseISO(request.requestedDate), 1), "yyyy-MM-dd");
    setProposals([
      { proposedDate: request.requestedDate, proposedTime: "10:00", duration: request.duration },
      { proposedDate: tomorrow, proposedTime: "10:00", duration: request.duration },
    ]);
    setProposalDialogOpen(true);
  };

  const openDenyDialog = (request: MeetingRequest) => {
    setSelectedRequest(request);
    setDenyDialogOpen(true);
  };

  const handleSubmitProposals = () => {
    if (!selectedRequest) return;
    const validProposals = proposals.filter(p => p.proposedDate && p.proposedTime);
    if (validProposals.length === 0) {
      toast({ title: "Error", description: "At least one proposal is required", variant: "destructive" });
      return;
    }
    proposeMutation.mutate({ id: selectedRequest.id, proposals: validProposals, adminNotes });
  };

  const handleDeny = () => {
    if (!selectedRequest) return;
    denyMutation.mutate({ id: selectedRequest.id, adminNotes });
  };

  const filteredRequests = requests?.filter(r => statusFilter === "all" || r.status === statusFilter) || [];

  const statusBadge = (status: string) => {
    const configs: Record<string, { variant: "primary" | "secondary" | "destructive" | "info"; label: string }> = {
      requested: { variant: "secondary", label: "Pending" },
      proposed: { variant: "info", label: "Proposed" },
      confirmed: { variant: "primary", label: "Confirmed" },
      denied: { variant: "destructive", label: "Denied" },
      cancelled: { variant: "secondary", label: "Cancelled" },
    };
    const config = configs[status] || configs.requested;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
          data-testid="filter-all"
        >
          All
        </Button>
        <Button
          variant={statusFilter === "requested" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("requested")}
          data-testid="filter-pending"
        >
          Pending
        </Button>
        <Button
          variant={statusFilter === "confirmed" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("confirmed")}
          data-testid="filter-confirmed"
        >
          Confirmed
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No meeting requests</h3>
            <p className="text-muted-foreground">
              {statusFilter === "all" ? "No meeting requests yet." : `No ${statusFilter} requests.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <Card key={request.id} data-testid={`meeting-request-${request.id}`}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-full ${
                      request.meetingType === "video" 
                        ? "bg-blue-100 dark:bg-blue-900/30" 
                        : "bg-emerald-100 dark:bg-emerald-900/30"
                    }`}>
                      {request.meetingType === "video" ? (
                        <Video className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Phone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{request.name}</h3>
                        {statusBadge(request.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{request.email}</p>
                      {request.company && (
                        <p className="text-sm text-muted-foreground">{request.company}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(parseISO(request.requestedDate), "MMM d, yyyy")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {request.requestedTime} ({request.duration}min)
                        </span>
                      </div>
                    </div>
                  </div>

                  {request.status === "requested" && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => confirmMutation.mutate(request.id)}
                        disabled={confirmMutation.isPending}
                        data-testid={`confirm-${request.id}`}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openProposalDialog(request)}
                        data-testid={`propose-${request.id}`}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Propose
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => openDenyDialog(request)}
                        data-testid={`deny-${request.id}`}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Deny
                      </Button>
                    </div>
                  )}

                  {request.status === "proposed" && (
                    <Badge className="border-teal-500 text-teal-600 dark:text-teal-400">
                      Awaiting client response
                    </Badge>
                  )}

                  {request.status === "confirmed" && (
                    <div className="text-sm text-muted-foreground">
                      Confirmed for {format(parseISO(request.requestedDate), "MMM d")} at {request.requestedTime}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={proposalDialogOpen} onOpenChange={setProposalDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Propose Alternate Times</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Propose up to 3 alternate times for {selectedRequest?.name}. They can accept one.
            </p>
            {proposals.map((proposal, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={proposal.proposedDate}
                    onChange={(e) => updateProposal(index, "proposedDate", e.target.value)}
                    data-testid={`proposal-date-${index}`}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Time</Label>
                  <Input
                    type="time"
                    value={proposal.proposedTime}
                    onChange={(e) => updateProposal(index, "proposedTime", e.target.value)}
                    data-testid={`proposal-time-${index}`}
                  />
                </div>
                {proposals.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeProposal(index)}
                    data-testid={`remove-proposal-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {proposals.length < 3 && (
              <Button variant="outline" size="sm" onClick={addProposal} data-testid="add-proposal">
                <Plus className="h-4 w-4 mr-1" />
                Add another option
              </Button>
            )}
            <div>
              <Label>Note to client (optional)</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Let them know why you're proposing different times..."
                data-testid="admin-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposalDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitProposals} disabled={proposeMutation.isPending}>
              {proposeMutation.isPending ? "Sending..." : "Send Proposals"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Meeting Request</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to deny this meeting request from {selectedRequest?.name}?
            </p>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Let them know why..."
                data-testid="deny-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeny} disabled={denyMutation.isPending}>
              {denyMutation.isPending ? "Denying..." : "Deny Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminScheduling() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Scheduling</h1>
          <p className="text-muted-foreground">Manage your availability, office days, and meeting requests</p>
        </div>

        <Tabs defaultValue="availability" className="space-y-6">
          <TabsList>
            <TabsTrigger value="availability" data-testid="tab-availability">Availability</TabsTrigger>
            <TabsTrigger value="office-days" data-testid="tab-office-days">Office Days</TabsTrigger>
            <TabsTrigger value="meetings" data-testid="tab-meetings">Meetings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="availability">
            <AvailabilityTab />
          </TabsContent>
          
          <TabsContent value="office-days">
            <OfficeDaysTab />
          </TabsContent>
          
          <TabsContent value="meetings">
            <MeetingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
