import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminLayout } from "@/components/AdminLayout";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Loader2, X } from "lucide-react";
import { format, addDays } from "date-fns";
import type { AvailabilityRules, AvailabilityBlock } from "@shared/schema";

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

type RulesFormData = z.infer<typeof rulesSchema>;
type BlockFormData = z.infer<typeof blockSchema>;

export default function AdminAvailability() {
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

  const onRulesSubmit = (data: RulesFormData) => {
    updateRulesMutation.mutate(data);
  };

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
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Availability</h1>
          <p className="text-muted-foreground">Manage your availability settings</p>
        </div>

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
                <form onSubmit={rulesForm.handleSubmit(onRulesSubmit)} className="space-y-4">
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
    </AdminLayout>
  );
}
