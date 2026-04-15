import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Phone, Video, Calendar, Clock, Check, X, MessageSquare, Plus } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";

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

export default function AdminMeetingRequests() {
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
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Meeting Requests</h1>
            <p className="text-muted-foreground">Manage incoming meeting requests from clients</p>
          </div>
          <div className="flex items-center gap-2">
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
                      <Badge appearance="stroke" className="border-teal-500 text-teal-600 dark:text-teal-400">
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
      </div>

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
    </AdminLayout>
  );
}
