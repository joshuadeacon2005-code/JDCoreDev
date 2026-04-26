import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Handshake, Mail, Phone, Loader2 } from "lucide-react";
import type { ReferralPartner } from "@shared/schema";
import { SUPPORTED_INVOICE_CURRENCIES } from "@shared/currency";

const partnerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  tradingName: z.string().optional(),
  contactEmail: z.string().email("Valid email").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  defaultCommissionRatePct: z.coerce.number().min(0).max(100),
  defaultRecurringShareRatePct: z.union([z.coerce.number().min(0).max(100), z.literal("")]).optional(),
  status: z.enum(["active", "paused", "terminated"]),
  partnershipStartDate: z.string().optional(),
  defaultTailMonths: z.coerce.number().int().min(0).default(12),
  payoutCurrency: z.string().optional(),
  notes: z.string().optional(),
});
type PartnerFormData = z.infer<typeof partnerSchema>;

function statusColor(status: string) {
  switch (status) {
    case "active": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "paused": return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
    case "terminated": return "bg-destructive/15 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function AdminPartners() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const { data: partners, isLoading } = useQuery<ReferralPartner[]>({
    queryKey: ["/api/admin/partners"],
  });

  const form = useForm<PartnerFormData>({
    resolver: zodResolver(partnerSchema),
    defaultValues: {
      name: "", tradingName: "", contactEmail: "", contactPhone: "",
      defaultCommissionRatePct: 12.5, defaultRecurringShareRatePct: "",
      status: "active", partnershipStartDate: "", defaultTailMonths: 12, payoutCurrency: "", notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PartnerFormData) => {
      const payload = {
        name: data.name,
        tradingName: data.tradingName || undefined,
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone || undefined,
        defaultCommissionRate: (data.defaultCommissionRatePct / 100).toFixed(5),
        defaultRecurringShareRate:
          data.defaultRecurringShareRatePct === "" || data.defaultRecurringShareRatePct == null
            ? null
            : (Number(data.defaultRecurringShareRatePct) / 100).toFixed(5),
        status: data.status,
        partnershipStartDate: data.partnershipStartDate || undefined,
        defaultTailMonths: data.defaultTailMonths,
        payoutCurrency: data.payoutCurrency || undefined,
        notes: data.notes || undefined,
      };
      const res = await apiRequest("POST", "/api/admin/partners", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
      toast({ title: "Partner created" });
      setIsOpen(false);
      form.reset();
    },
    onError: (e: Error) => toast({ title: "Failed to create partner", description: e.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Handshake className="h-6 w-6" /> Referral Partners</h1>
          <p className="text-sm text-muted-foreground mt-1">External introducers — clients we pay, not who pay us.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-partner"><Plus className="h-4 w-4 mr-2" /> New Partner</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New Referral Partner</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
              </div>
              <div>
                <Label>Trading name</Label>
                <Input {...form.register("tradingName")} placeholder="e.g. Unsolved-Market" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Contact email</Label>
                  <Input type="email" {...form.register("contactEmail")} />
                </div>
                <div>
                  <Label>Contact phone</Label>
                  <Input {...form.register("contactPhone")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Commission % *</Label>
                  <Input type="number" step="0.01" {...form.register("defaultCommissionRatePct")} />
                </div>
                <div>
                  <Label>Recurring share %</Label>
                  <Input type="number" step="0.01" {...form.register("defaultRecurringShareRatePct")} placeholder="optional" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tail period (months)</Label>
                  <Input type="number" {...form.register("defaultTailMonths")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Partnership start date</Label>
                  <Input type="date" {...form.register("partnershipStartDate")} />
                </div>
                <div>
                  <Label>Payout currency</Label>
                  <Select
                    value={form.watch("payoutCurrency") ?? ""}
                    onValueChange={(v) => form.setValue("payoutCurrency", v === "__inherit__" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Inherit from invoice" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__inherit__">Inherit from invoice</SelectItem>
                      {SUPPORTED_INVOICE_CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={3} {...form.register("notes")} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : !partners?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No referral partners yet. Click <strong>New Partner</strong> to add one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((p) => (
            <Link key={p.id} href={`/admin/partners/${p.id}`}>
              <Card className="hover:border-teal-500/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      {p.tradingName && <p className="text-sm text-muted-foreground">{p.tradingName}</p>}
                    </div>
                    <Badge className={statusColor(p.status)}>{p.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-mono text-foreground">{(Number(p.defaultCommissionRate) * 100).toFixed(2)}%</span>
                    <span>commission</span>
                    <span>·</span>
                    <span>{p.defaultTailMonths}mo tail</span>
                    {p.payoutCurrency && <><span>·</span><span className="font-mono text-foreground">{p.payoutCurrency}</span></>}
                  </div>
                  {p.contactEmail && (
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3.5 w-3.5" />{p.contactEmail}</div>
                  )}
                  {p.contactPhone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{p.contactPhone}</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
