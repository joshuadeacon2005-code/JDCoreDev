import { format } from "date-fns";
import { ActivityEventWithUser } from "@shared/schema";
import { 
  UserPlus, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  FileText, 
  Briefcase,
  Clock,
  DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityTimelineProps {
  events: ActivityEventWithUser[];
  className?: string;
}

const eventTypeIcons: Record<string, typeof UserPlus> = {
  client_created: UserPlus,
  project_created: Briefcase,
  project_status_changed: Briefcase,
  office_day_requested: Calendar,
  office_day_approved: CheckCircle,
  office_day_rejected: XCircle,
  office_day_cancelled: XCircle,
  milestone_created: DollarSign,
  milestone_status_changed: DollarSign,
  document_uploaded: FileText,
  default: Clock,
};

const eventTypeColors: Record<string, string> = {
  client_created: "bg-blue-500",
  project_created: "bg-teal-500",
  project_status_changed: "bg-teal-500",
  office_day_requested: "bg-amber-500",
  office_day_approved: "bg-emerald-500",
  office_day_rejected: "bg-red-500",
  office_day_cancelled: "bg-gray-500",
  milestone_created: "bg-cyan-500",
  milestone_status_changed: "bg-cyan-500",
  document_uploaded: "bg-indigo-500",
  default: "bg-gray-500",
};

export function ActivityTimeline({ events, className }: ActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-muted-foreground", className)}>
        <Clock className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No activity yet</p>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-6">
        {events.map((event) => {
          const Icon = eventTypeIcons[event.eventType] || eventTypeIcons.default;
          const color = eventTypeColors[event.eventType] || eventTypeColors.default;

          return (
            <div key={event.id} className="relative pl-8" data-testid={`activity-event-${event.id}`}>
              <div className={cn(
                "absolute left-1.5 w-4 h-4 rounded-full flex items-center justify-center",
                color
              )}>
                <Icon className="h-2.5 w-2.5 text-white" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(event.createdAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
                <p className="text-sm" data-testid={`activity-message-${event.id}`}>
                  {event.message}
                </p>
                {event.createdBy && (
                  <span className="text-xs text-muted-foreground">
                    by {event.createdBy.email}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
