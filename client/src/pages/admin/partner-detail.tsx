import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Loader2, CheckCircle2, Clock, Briefcase, Users } from "lucide-react";
import { format } from "date-fns";
import type { ReferralPartnerSummary, CommissionEntry, Client } from "@shared/schema";

import { convertUSDCents, currencySymbol, DEFAULT_USD_FX_RATES } from "@shared/currency";

// All commission amounts are stored in USD on disk. The partner's
// payoutCurrency is a display preference: when set, totals and ledger
// rows render in that currency with USD shown alongside as a reference.
function fmtMoney(usdCents: number, payoutCurrency?: string | null): string {
  const target = (payoutCurrency || "USD").toUpperCase();
  if (target === "USD") {
    return `USD $${(usdCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const conv = convertUSDCents(usdCents, target);
  return `${conv.code} ${conv.symbol}${conv.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Keep the legacy name to avoid touching every call site.
const fmtUSD = fmtMoney;

export default function AdminPartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const partnerId = parseInt(id || "0");
  const { toast } = useToast();
  const [paying, setPaying] = useState<CommissionEntry | null>(null);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentNotes, setPaymentNotes] = useState("");

  const { data: summary, isLoading } = useQuery<ReferralPartnerSummary>({
    queryKey: [`/api/admin/partners/${partnerId}`],
    enabled: !!partnerId,
  });

  const { data: commissions } = useQuery<CommissionEntry[]>({
    queryKey: [`/api/admin/partners/${partnerId}/commissions`],
    enabled: !!partnerId,
  });

  const { data: partnerClients } = useQuery<Client[]>({
    queryKey: [`/api/admin/partners/${partnerId}/clients`],
    enabled: !!partnerId,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (entry: CommissionEntry) => {
      const res = await apiRequest("PATCH", `/api/admin/commissions/${entry.id}`, {
        status: "paid",
        paymentDate,
        notes: paymentNotes || entry.notes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/partners/${partnerId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/partners/${partnerId}/commissions`] });
      toast({ title: "Marked as paid" });
      setPaying(null);
      setPaymentNotes("");
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !summary) {
    return <AdminLayout><Skeleton className="h-64" /></AdminLayout>;
  }

  const due = commissions?.filter((c) => c.status === "due") ?? [];
  const paid = commissions?.filter((c) => c.status === "paid") ?? [];
  const other = commissions?.filter((c) => !["due", "paid"].includes(c.status)) ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Link href="/admin/partners">
          <Button variant="ghost" size="sm" className="mb-2"><ArrowLeft className="h-4 w-4 mr-1" /> All partners</Button>
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{summary.name}</h1>
            {summary.tradingName && <p className="text-muted-foreground">{summary.tradingName}</p>}
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Badge>{summary.status}</Badge>
              <span className="font-mono text-foreground">{(Number(summary.defaultCommissionRate) * 100).toFixed(2)}%</span>
              <span>· {summary.defaultTailMonths}-month tail</span>
              {summary.payoutCurrency && <span>· paid in <strong className="text-foreground">{summary.payoutCurrency}</strong></span>}
              {summary.contactEmail && <span>· {summary.contactEmail}</span>}
            </div>
          </div>
        </div>

        {/* Aggregates */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Accrued</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{fmtUSD(summary.totalAccruedCents, summary.payoutCurrency)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Paid</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-emerald-500">{fmtUSD(summary.totalPaidCents, summary.payoutCurrency)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Due</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-yellow-500">{fmtUSD(summary.totalDueCents, summary.payoutCurrency)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Active clients</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-muted-foreground" />{summary.activeClientCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Active projects</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Briefcase className="h-5 w-5 text-muted-foreground" />{summary.activeProjectCount}</div></CardContent>
          </Card>
        </div>

        <Tabs defaultValue="due">
          <TabsList>
            <TabsTrigger value="due">Due ({due.length})</TabsTrigger>
            <TabsTrigger value="paid">Paid ({paid.length})</TabsTrigger>
            <TabsTrigger value="other">Other ({other.length})</TabsTrigger>
            <TabsTrigger value="clients">Clients ({partnerClients?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="due">
            <CommissionList entries={due} payoutCurrency={summary.payoutCurrency} onMarkPaid={(e) => { setPaying(e); setPaymentNotes(""); }} />
          </TabsContent>
          <TabsContent value="paid">
            <CommissionList entries={paid} payoutCurrency={summary.payoutCurrency} />
          </TabsContent>
          <TabsContent value="other">
            <CommissionList entries={other} payoutCurrency={summary.payoutCurrency} />
          </TabsContent>
          <TabsContent value="clients">
            <Card>
              <CardContent className="p-0">
                {partnerClients?.length ? (
                  <ul className="divide-y divide-border">
                    {partnerClients.map((c) => (
                      <li key={c.id}>
                        <Link href={`/admin/clients/${c.id}`}>
                          <div className="px-4 py-3 hover:bg-muted/50 cursor-pointer flex items-center justify-between">
                            <div>
                              <div className="font-medium">{c.name}</div>
                              {c.companyName && <div className="text-sm text-muted-foreground">{c.companyName}</div>}
                            </div>
                            <Badge variant="outline">{c.status}</Badge>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">No clients attributed to this partner yet.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record commission payment</DialogTitle></DialogHeader>
          {paying && (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="text-muted-foreground">Amount</div>
                <div className="text-2xl font-bold">{fmtUSD(paying.commissionCents, summary.payoutCurrency)}</div>
                <div className="text-xs text-muted-foreground mt-1">Stored as USD ${(paying.commissionCents / 100).toFixed(2)} on the ledger.</div>
              </div>
              <div>
                <Label>Payment date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea rows={3} value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="e.g. paid via Wise on 2026-04-26" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button onClick={() => paying && markPaidMutation.mutate(paying)} disabled={markPaidMutation.isPending}>
              {markPaidMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function CommissionList({ entries, onMarkPaid, payoutCurrency }: { entries: CommissionEntry[]; onMarkPaid?: (e: CommissionEntry) => void; payoutCurrency?: string | null }) {
  if (!entries.length) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground">Nothing here.</CardContent></Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Created</th>
              <th className="text-left px-4 py-2 font-medium">Source</th>
              <th className="text-right px-4 py-2 font-medium">Gross</th>
              <th className="text-right px-4 py-2 font-medium">Costs</th>
              <th className="text-right px-4 py-2 font-medium">Net</th>
              <th className="text-right px-4 py-2 font-medium">Rate</th>
              <th className="text-right px-4 py-2 font-medium">Commission</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-muted/20">
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{format(new Date(e.createdAt), "yyyy-MM-dd")}</td>
                <td className="px-4 py-2 whitespace-nowrap">{e.sourceType}{e.projectId ? ` (#${e.projectId})` : ""}</td>
                <td className="px-4 py-2 text-right font-mono">{fmtUSD(e.grossCents, payoutCurrency)}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">−{fmtUSD(e.costsCents, payoutCurrency)}</td>
                <td className="px-4 py-2 text-right font-mono">{fmtUSD(e.netCents, payoutCurrency)}</td>
                <td className="px-4 py-2 text-right font-mono">{(Number(e.rateApplied) * 100).toFixed(2)}%</td>
                <td className="px-4 py-2 text-right font-mono font-bold">{fmtUSD(e.commissionCents, payoutCurrency)}</td>
                <td className="px-4 py-2">
                  {e.status === "due" && <Badge className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 gap-1"><Clock className="h-3 w-3" />due</Badge>}
                  {e.status === "paid" && <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 gap-1"><CheckCircle2 className="h-3 w-3" />paid {e.paymentDate && `· ${e.paymentDate}`}</Badge>}
                  {e.status === "waived" && <Badge variant="outline">waived</Badge>}
                  {e.status === "cancelled" && <Badge variant="outline" className="text-muted-foreground">cancelled</Badge>}
                </td>
                <td className="px-4 py-2 text-right">
                  {onMarkPaid && e.status === "due" && (
                    <Button size="sm" onClick={() => onMarkPaid(e)} data-testid={`button-mark-paid-${e.id}`}>Mark paid</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
