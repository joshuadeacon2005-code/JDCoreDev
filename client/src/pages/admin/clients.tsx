import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Users, Loader2, Mail, Phone, Building2, Handshake } from "lucide-react";
import { format } from "date-fns";
import type { Client, ReferralPartner } from "@shared/schema";

const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  industry: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["lead", "active", "past"]),
  referredByPartnerId: z.string().optional(), // "" or partner id; converted to null/number on submit
});

type ClientFormData = z.infer<typeof clientSchema>;

export default function AdminClients() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/admin/clients"],
  });

  const { data: partners } = useQuery<ReferralPartner[]>({
    queryKey: ["/api/admin/partners"],
  });
  const partnerById = (id: number | null | undefined) =>
    id == null ? undefined : partners?.find((p) => p.id === id);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: { 
      name: "", 
      email: "", 
      phone: "", 
      companyName: "", 
      address: "", 
      city: "", 
      state: "", 
      zipCode: "", 
      industry: "",
      notes: "",
      status: "lead",
      referredByPartnerId: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const payload: any = { ...data };
      payload.referredByPartnerId =
        data.referredByPartnerId && data.referredByPartnerId !== ""
          ? Number(data.referredByPartnerId)
          : null;
      const res = await apiRequest("POST", "/api/admin/clients", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      toast({ title: "Client created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create client", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: ClientFormData) => {
    createMutation.mutate(data);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Clients</h1>
            <p className="text-muted-foreground">Manage your client relationships</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-client">
                <Plus className="h-4 w-4 mr-2" /> Add Client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Client</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Contact Name *</Label>
                    <Input
                      id="name"
                      placeholder="Full name"
                      {...form.register("name")}
                      data-testid="input-client-name"
                    />
                    {form.formState.errors.name && (
                      <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="Company or business name"
                      {...form.register("companyName")}
                      data-testid="input-client-company"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      {...form.register("email")}
                      data-testid="input-client-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      placeholder="+1 (555) 000-0000"
                      {...form.register("phone")}
                      data-testid="input-client-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      placeholder="Technology, Healthcare, etc."
                      {...form.register("industry")}
                      data-testid="input-client-industry"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={form.watch("status")}
                      onValueChange={(v) => form.setValue("status", v as "lead" | "active" | "past")}
                    >
                      <SelectTrigger data-testid="select-client-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="past">Past</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      placeholder="Street address"
                      {...form.register("address")}
                      data-testid="input-client-address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="City"
                      {...form.register("city")}
                      data-testid="input-client-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="State/Province"
                      {...form.register("state")}
                      data-testid="input-client-state"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="referredByPartnerId">Referred by partner (optional)</Label>
                    <Select
                      value={form.watch("referredByPartnerId") ?? ""}
                      onValueChange={(v) => form.setValue("referredByPartnerId", v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger data-testid="select-client-partner"><SelectValue placeholder="Direct client (no partner)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Direct client (no partner)</SelectItem>
                        {partners?.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}{p.tradingName ? ` — ${p.tradingName}` : ""} ({(Number(p.defaultCommissionRate) * 100).toFixed(2)}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Additional notes about this client..."
                      {...form.register("notes")}
                      data-testid="input-client-notes"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-create-client">
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Client
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : clients?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No clients yet</p>
              <p className="text-sm text-muted-foreground">Add your first client to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients?.map((client) => (
              <Link key={client.id} href={`/admin/clients/${client.id}`}>
                <Card 
                  className="hover-elevate cursor-pointer h-full" 
                  data-testid={`card-client-${client.id}`}
                >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{client.companyName || client.name}</CardTitle>
                      {client.companyName && (
                        <p className="text-sm text-muted-foreground">{client.name}</p>
                      )}
                    </div>
                    <StatusBadge status={client.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {client.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {client.industry && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      <span>{client.industry}</span>
                    </div>
                  )}
                  {client.referredByPartnerId && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400">
                        <Handshake className="h-3 w-3" />
                        {partnerById(client.referredByPartnerId)?.name ?? "Partner"}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground pt-1">
                    Added {format(new Date(client.createdAt), "MMM d, yyyy")}
                  </p>
                </CardContent>
              </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
