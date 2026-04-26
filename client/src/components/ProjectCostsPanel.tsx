import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Trash2, Loader2, Receipt, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import type { ProjectCost, Project, Client, ReferralPartner, CommissionEntry } from "@shared/schema";

const COST_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "third_party_software", label: "Third-party software" },
  { value: "contractor", label: "Contractor / freelancer" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "stock_assets", label: "Stock assets" },
  { value: "vat_passthrough", label: "VAT passthrough" },
  { value: "other", label: "Other" },
];

function fmtUSD(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  projectId: number;
  project: Project;
  client: Client;
  paidCents: number;
}

export function ProjectCostsPanel({ projectId, project, client, paidCents }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("third_party_software");
  const [incurredDate, setIncurredDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const { data: costs } = useQuery<ProjectCost[]>({
    queryKey: [`/api/admin/projects/${projectId}/costs`],
  });

  const { data: partner } = useQuery<ReferralPartner>({
    queryKey: [`/api/admin/partners/${client.referredByPartnerId}`],
    enabled: !!client.referredByPartnerId,
  });

  const { data: commissionEntries } = useQuery<CommissionEntry[]>({
    queryKey: [`/api/admin/commissions`, { projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/commissions?projectId=${projectId}`, { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return Array.isArray(all) ? all.filter((e: CommissionEntry) => e.projectId === projectId) : [];
    },
    enabled: !!client.referredByPartnerId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        description, amountCents: Math.round(Number(amount) * 100),
        currency: "USD", incurredDate, category, notes: notes || undefined,
      };
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/costs`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/costs`] });
      toast({ title: "Cost added" });
      setOpen(false); setDescription(""); setAmount(""); setNotes("");
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/project-costs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/projects/${projectId}/costs`] });
      toast({ title: "Cost removed" });
    },
  });

  const recalcMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/projects/${projectId}/recalc-commission`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/commissions`] });
      toast({ title: "Commission recalculated" });
    },
    onError: (e: Error) => toast({ title: "Recalc failed", description: e.message, variant: "destructive" }),
  });

  const totalCostsCents = costs?.reduce((s, c) => s + c.amountCents, 0) ?? 0;
  const netCents = Math.max(0, paidCents - totalCostsCents);
  const effectiveRate =
    project.commissionRateOverride != null
      ? Number(project.commissionRateOverride)
      : partner ? Number(partner.defaultCommissionRate) : 0;
  const previewCommissionCents = client.referredByPartnerId && !project.commissionWaived
    ? Math.round(netCents * effectiveRate)
    : 0;
  const existingCommission = commissionEntries?.find((e) => e.sourceType === "project_completion");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Dev costs &amp; commission</CardTitle>
            <CardDescription>
              External / contractor / passthrough costs subtracted from gross before commission.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-add-cost"><Plus className="h-4 w-4 mr-1" /> Add cost</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add project cost</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Description *</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Cloudinary annual licence" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount (USD) *</Label>
                    <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={incurredDate} onChange={(e) => setIncurredDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COST_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={!description || !amount || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!costs?.length ? (
          <div className="text-sm text-muted-foreground py-4">No costs logged yet.</div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {costs.map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.category && <span className="capitalize">{c.category.replace(/_/g, " ")}</span>}
                    {c.category && c.incurredDate && <span> · </span>}
                    {c.incurredDate && <span>{c.incurredDate}</span>}
                  </div>
                </div>
                <div className="font-mono shrink-0">{fmtUSD(c.amountCents)}</div>
                <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(c.id)} data-testid={`button-delete-cost-${c.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Gross paid (milestones marked paid)</span>
            <span className="font-mono">{fmtUSD(paidCents)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total dev costs</span>
            <span className="font-mono text-muted-foreground">−{fmtUSD(totalCostsCents)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-1.5">
            <span className="font-medium">Net commissionable</span>
            <span className="font-mono font-bold">{fmtUSD(netCents)}</span>
          </div>
          {client.referredByPartnerId ? (
            <>
              <div className="flex items-center justify-between text-muted-foreground pt-1">
                <span>Rate ({partner ? partner.name : "partner"}{project.commissionRateOverride != null ? ", overridden" : ""})</span>
                <span className="font-mono">{(effectiveRate * 100).toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1.5">
                <span className="font-medium">{project.commissionWaived ? "Commission (waived)" : project.status === "completed" ? "Commission (final)" : "Commission (preview)"}</span>
                <span className="font-mono font-bold">{project.commissionWaived ? fmtUSD(0) : fmtUSD(existingCommission?.commissionCents ?? previewCommissionCents)}</span>
              </div>
              {existingCommission ? (
                <div className="text-xs text-muted-foreground pt-1">
                  Status: <span className="capitalize">{existingCommission.status}</span>
                  {existingCommission.paymentDate && <> · paid {existingCommission.paymentDate}</>}
                </div>
              ) : project.status === "completed" ? (
                <div className="text-xs text-muted-foreground pt-1">Will generate on next save.</div>
              ) : (
                <div className="text-xs text-muted-foreground pt-1">Will be created when this project is marked Completed.</div>
              )}
              {project.status === "completed" && existingCommission && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending}>
                  {recalcMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Recalculate (after editing costs)
                </Button>
              )}
            </>
          ) : (
            <div className="text-xs text-muted-foreground pt-1">Direct client — no commission applies.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
