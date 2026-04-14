import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = 
  | "lead" | "active" | "past" | "paused" | "completed" | "hosting"
  | "on_track" | "at_risk" | "blocked"
  | "requested" | "approved" | "rejected" | "cancelled"
  | "planned" | "invoiced" | "paid" | "overdue"
  | "onsite" | "remote" | "both";

const statusStyles: Record<StatusType, string> = {
  lead: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  past: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
  paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  hosting: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  on_track: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  at_risk: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  blocked: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  requested: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  cancelled: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
  planned: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  invoiced: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  onsite: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  remote: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  both: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
};

const statusLabels: Record<StatusType, string> = {
  lead: "Lead",
  active: "Active",
  past: "Past",
  paused: "Paused",
  completed: "Completed",
  hosting: "Hosting",
  on_track: "On Track",
  at_risk: "At Risk",
  blocked: "Blocked",
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  planned: "Planned",
  invoiced: "Invoiced",
  paid: "Paid",
  overdue: "Overdue",
  onsite: "On-site",
  remote: "Remote",
  both: "Flexible",
};

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      appearance="stroke"
      className={cn(
        "text-xs font-medium",
        statusStyles[status],
        className
      )}
      data-testid={`badge-status-${status}`}
    >
      {statusLabels[status]}
    </Badge>
  );
}
