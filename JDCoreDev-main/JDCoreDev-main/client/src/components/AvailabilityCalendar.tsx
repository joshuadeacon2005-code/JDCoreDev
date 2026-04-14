import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isBefore, startOfToday, addMonths, getDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AvailabilityCalendarProps {
  availableDates: string[];
  blockedDates: string[];
  selectedDates?: string[];
  onDateSelect?: (date: string) => void;
  onDateDeselect?: (date: string) => void;
  selectable?: boolean;
  className?: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AvailabilityCalendar({
  availableDates,
  blockedDates,
  selectedDates = [],
  onDateSelect,
  onDateDeselect,
  selectable = false,
  className,
}: AvailabilityCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const today = startOfToday();

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);
  const blockedSet = useMemo(() => new Set(blockedDates), [blockedDates]);
  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  const firstDayOfMonth = getDay(startOfMonth(currentMonth));

  const handleDateClick = (dateStr: string) => {
    if (!selectable) return;
    if (selectedSet.has(dateStr)) {
      onDateDeselect?.(dateStr);
    } else {
      onDateSelect?.(dateStr);
    }
  };

  const previousMonth = () => setCurrentMonth(addMonths(currentMonth, -1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={previousMonth}
          data-testid="button-prev-month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold" data-testid="text-current-month">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={nextMonth}
          data-testid="button-next-month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center py-2"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isPast = isBefore(day, today);
          const isAvailable = availableSet.has(dateStr) && !isPast;
          const isBlocked = blockedSet.has(dateStr);
          const isSelected = selectedSet.has(dateStr);
          const canSelect = selectable && isAvailable && !isBlocked && !isPast;

          return (
            <button
              key={dateStr}
              onClick={() => canSelect && handleDateClick(dateStr)}
              disabled={!canSelect}
              className={cn(
                "aspect-square rounded-md border text-sm font-medium transition-colors flex items-center justify-center",
                !isSameMonth(day, currentMonth) && "opacity-30",
                isPast && "opacity-40 cursor-not-allowed bg-muted/30",
                isToday(day) && "ring-2 ring-primary ring-offset-1",
                isBlocked && "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 cursor-not-allowed",
                isAvailable && !isBlocked && !isPast && "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer",
                !isAvailable && !isBlocked && !isPast && "border-border bg-muted/20",
                isSelected && "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
                canSelect && "hover-elevate"
              )}
              data-testid={`calendar-date-${dateStr}`}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/30" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500/10 border border-red-500/30" />
          <span>Blocked</span>
        </div>
        {selectable && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary border border-primary" />
            <span>Selected</span>
          </div>
        )}
      </div>
    </div>
  );
}
