import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClientLayout } from "@/components/ClientLayout";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, Loader2, X } from "lucide-react";
import { format, addDays } from "date-fns";
import type { AvailabilityRules, AvailabilityBlock, Project, OfficeDayRequest } from "@shared/schema";

const requestSchema = z.object({
  projectId: z.number({ required_error: "Project is required" }),
  dayType: z.enum(["onsite", "remote"]),
  notes: z.string().optional(),
});

type RequestFormData = z.infer<typeof requestSchema>;

export default function PortalAvailability() {
  const { toast } = useToast();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: rules, isLoading: rulesLoading } = useQuery<AvailabilityRules>({
    queryKey: ["/api/portal/availability/rules"],
  });

  const { data: blocks, isLoading: blocksLoading } = useQuery<AvailabilityBlock[]>({
    queryKey: ["/api/portal/availability/blocks"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/portal/projects"],
  });

  const { data: existingRequests } = useQuery<OfficeDayRequest[]>({
    queryKey: ["/api/portal/office-days"],
  });

  const form = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: { dayType: "onsite", notes: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: RequestFormData & { dates: string[] }) => {
      const res = await apiRequest("POST", "/api/portal/office-days", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/office-days"] });
      toast({ title: "Office day request submitted" });
      setIsDialogOpen(false);
      setSelectedDates([]);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to submit request", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: RequestFormData) => {
    if (selectedDates.length === 0) {
      toast({ title: "Please select at least one date", variant: "destructive" });
      return;
    }
    createMutation.mutate({ ...data, dates: selectedDates });
  };

  const handleDateSelect = (date: string) => {
    setSelectedDates(prev => [...prev, date]);
  };

  const handleDateDeselect = (date: string) => {
    setSelectedDates(prev => prev.filter(d => d !== date));
  };

  const blockedDates = blocks?.map(b => b.date) || [];
  const requestedDates = existingRequests?.map(r => r.date) || [];
  const allBlockedDates = [...blockedDates, ...requestedDates];

  const availableDates: string[] = [];
  if (rules) {
    const weekdays = [rules.sunday, rules.monday, rules.tuesday, rules.wednesday, rules.thursday, rules.friday, rules.saturday];
    for (let i = 0; i < 60; i++) {
      const date = addDays(new Date(), i);
      const dayOfWeek = date.getDay();
      if (weekdays[dayOfWeek]) {
        const dateStr = format(date, "yyyy-MM-dd");
        if (!allBlockedDates.includes(dateStr)) {
          availableDates.push(dateStr);
        }
      }
    }
  }

  const isLoading = rulesLoading || blocksLoading;

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Request Office Days</h1>
          <p className="text-muted-foreground">Select available dates to request</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Available Dates</CardTitle>
                <CardDescription>Click on available dates to select them for your request</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <AvailabilityCalendar
                    availableDates={availableDates}
                    blockedDates={allBlockedDates}
                    selectedDates={selectedDates}
                    onDateSelect={handleDateSelect}
                    onDateDeselect={handleDateDeselect}
                    selectable
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Selected Dates</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No dates selected. Click on green dates in the calendar to select them.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDates.sort().map((date) => (
                      <div 
                        key={date} 
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <span className="text-sm font-medium">
                          {format(new Date(date), "EEEE, MMM d")}
                        </span>
                        <button
                          onClick={() => handleDateDeselect(date)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedDates.length > 0 && (
                  <Button 
                    className="w-full mt-4" 
                    onClick={() => setIsDialogOpen(true)}
                    data-testid="button-request-days"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Request {selectedDates.length} Day{selectedDates.length > 1 ? "s" : ""}
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Availability Rules</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : rules ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max days/week</span>
                      <span className="font-medium">{rules.maxDaysPerWeek}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max days/month</span>
                      <span className="font-medium">{rules.maxDaysPerMonth}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Default type</span>
                      <Badge variant="secondary" className="capitalize">{rules.defaultType}</Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No availability rules configured</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Office Day Request</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Requesting {selectedDates.length} day(s):</p>
              <div className="flex flex-wrap gap-1">
                {selectedDates.sort().map((date) => (
                  <Badge key={date} variant="secondary">
                    {format(new Date(date), "MMM d")}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={form.watch("projectId")?.toString()}
                onValueChange={(v) => form.setValue("projectId", parseInt(v))}
              >
                <SelectTrigger data-testid="select-request-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Day Type</Label>
              <Select
                value={form.watch("dayType")}
                onValueChange={(v) => form.setValue("dayType", v as "onsite" | "remote")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onsite">On-site</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any additional notes..."
                {...form.register("notes")}
                data-testid="input-request-notes"
              />
            </div>

            <Button type="submit" className="w-full" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Request
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
}
