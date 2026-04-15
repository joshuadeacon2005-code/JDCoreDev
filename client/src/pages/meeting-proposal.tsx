import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Clock, Video, Phone, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Proposal {
  id: number;
  proposedDate: string;
  proposedTime: string;
  duration: number;
  accepted: boolean;
}

interface MeetingRequestData {
  id: number;
  name: string;
  email: string;
  meetingType: "call" | "video";
  requestedDate: string;
  requestedTime: string;
  duration: number;
  status: "requested" | "proposed" | "confirmed" | "denied" | "cancelled";
  adminNotes: string | null;
  proposals: Proposal[];
}

export default function MeetingProposalPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  const { data: meeting, isLoading, refetch } = useQuery<MeetingRequestData>({
    queryKey: ["/api/meeting-request", token],
    queryFn: async () => {
      const res = await fetch(`/api/meeting-request/${token}`);
      if (!res.ok) throw new Error("Meeting not found");
      return res.json();
    },
    enabled: !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: async (proposalId: number) => {
      const res = await apiRequest("POST", `/api/meeting-request/${token}/accept/${proposalId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Meeting confirmed",
        description: "Your meeting has been scheduled. You will receive a confirmation email.",
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to accept proposal",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setAcceptingId(null);
    },
  });

  const handleAccept = (proposalId: number) => {
    setAcceptingId(proposalId);
    acceptMutation.mutate(proposalId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 dark:from-teal-950 dark:via-background dark:to-cyan-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 dark:from-teal-950 dark:via-background dark:to-cyan-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle>Meeting Not Found</CardTitle>
            <CardDescription>
              This meeting request link is invalid or has expired.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const statusConfig: Record<string, { icon: any; color: string; message: string }> = {
    requested: {
      icon: Clock,
      color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      message: "Your meeting request is pending review. We will get back to you soon.",
    },
    proposed: {
      icon: AlertCircle,
      color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
      message: "We have proposed some alternate times. Please select one that works for you.",
    },
    confirmed: {
      icon: CheckCircle,
      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      message: "Your meeting is confirmed. You will receive a reminder before the meeting.",
    },
    denied: {
      icon: XCircle,
      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      message: "Unfortunately, we were unable to accommodate this meeting request.",
    },
    cancelled: {
      icon: XCircle,
      color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
      message: "This meeting has been cancelled.",
    },
  };

  const status = statusConfig[meeting.status] || statusConfig.requested;
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 dark:from-teal-950 dark:via-background dark:to-cyan-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className={`w-12 h-12 rounded-full ${status.color} flex items-center justify-center`}>
              <StatusIcon className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-xl">Meeting Request</CardTitle>
          <CardDescription>{status.message}</CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-teal-100 dark:bg-teal-900/30">
                {meeting.meetingType === "video" ? (
                  <Video className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                ) : (
                  <Phone className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium capitalize">{meeting.meetingType} Meeting</p>
                <p className="text-xs text-muted-foreground">{meeting.duration} minutes</p>
              </div>
            </div>
            
            {meeting.status === "confirmed" && (
              <div className="flex items-center gap-3 pt-2 border-t">
                <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {format(parseISO(meeting.requestedDate), "EEEE, MMMM d, yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {meeting.requestedTime}
                  </p>
                </div>
              </div>
            )}
          </div>

          {meeting.status === "proposed" && meeting.proposals.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Available Times</h3>
              {meeting.proposals.filter(p => !p.accepted).map((proposal) => (
                <div
                  key={proposal.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  data-testid={`proposal-${proposal.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-cyan-100 dark:bg-cyan-900/30">
                      <Calendar className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {format(parseISO(proposal.proposedDate), "EEE, MMM d")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {proposal.proposedTime} ({proposal.duration} min)
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAccept(proposal.id)}
                    disabled={acceptMutation.isPending}
                    data-testid={`accept-proposal-${proposal.id}`}
                  >
                    {acceptingId === proposal.id ? "Accepting..." : "Accept"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {meeting.adminNotes && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <span className="font-medium">Note from JD CoreDev: </span>
                {meeting.adminNotes}
              </p>
            </div>
          )}

          <div className="text-center pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Have questions? Contact us at{" "}
              <a href="mailto:hello@jdcoredev.com" className="text-teal-600 dark:text-teal-400 hover:underline">
                hello@jdcoredev.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
