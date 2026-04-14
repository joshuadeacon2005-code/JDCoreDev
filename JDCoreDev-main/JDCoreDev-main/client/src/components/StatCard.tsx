import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    label: string;
  };
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, trend, icon, className }: StatCardProps) {
  const TrendIcon = trend?.value && trend.value > 0 
    ? TrendingUp 
    : trend?.value && trend.value < 0 
    ? TrendingDown 
    : Minus;
  
  const trendColor = trend?.value && trend.value > 0 
    ? "text-emerald-600 dark:text-emerald-400" 
    : trend?.value && trend.value < 0 
    ? "text-red-600 dark:text-red-400" 
    : "text-muted-foreground";

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {icon && (
            <div className="text-muted-foreground">{icon}</div>
          )}
        </div>
        <div className="mt-2">
          <span className="text-3xl font-semibold" data-testid={`stat-value-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            {value}
          </span>
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 mt-2 text-xs", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            <span>{trend.value > 0 ? "+" : ""}{trend.value}%</span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
