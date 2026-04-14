import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, ChevronRight, Mail, Phone, Building2, MapPin,
  Briefcase, DollarSign, Calendar, Plus, MoreVertical, Pencil, Trash2, Loader2, UserPlus
} from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, Project, Contact, Milestone } from "@shared/schema";

type ProjectWithMilestones = Project & { milestones: Milestone[] };

type ClientDetailData = Client & {
  projects: ProjectWithMilestones[];
  contacts: Contact[];
  projectCount: number;
};

const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

const clientFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  companyName: z.string().optional().or(z.literal("")),
  industry: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  zipCode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  status: z.enum(["lead", "active", "past"]),
});

type ClientFormData = z.infer<typeof clientFormSchema>;

export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>();
  const clientId = parseInt(id || "0");
  const { toast } = useToast();

  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isEditClientDialogOpen, setIsEditClientDialogOpen] = useState(false);

  const { data: client, isLoading } = useQuery<ClientDetailData>({
    queryKey: ["/api/admin/clients", clientId],
  });

  const contactForm = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      title: "",
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const res = await apiRequest("POST", `/api/admin/clients/${clientId}/contacts`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients", clientId] });
      toast({ title: "Contact added" });
      setIsContactDialogOpen(false);
      contactForm.reset();
    },
    onError: () => {
      toast({ title: "Failed to add contact", variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ContactFormData }) => {
      const res = await apiRequest("PATCH", `/api/admin/contacts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients", clientId] });
      toast({ title: "Contact updated" });
      setIsContactDialogOpen(false);
      setEditingContact(null);
      contactForm.reset();
    },
    onError: () => {
      toast({ title: "Failed to update contact", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/contacts/${contactId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients", clientId] });
      toast({ title: "Contact deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    },
  });

  const clientForm = useForm<ClientFormData>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      companyName: "",
      industry: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      notes: "",
      status: "lead",
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const res = await apiRequest("PATCH", `/api/admin/clients/${clientId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      toast({ title: "Client updated successfully" });
      setIsEditClientDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update client", variant: "destructive" });
    },
  });

  const openEditClient = () => {
    if (client) {
      clientForm.reset({
        name: client.name,
        email: client.email || "",
        phone: client.phone || "",
        companyName: client.companyName || "",
        industry: client.industry || "",
        address: client.address || "",
        city: client.city || "",
        state: client.state || "",
        zipCode: client.zipCode || "",
        country: client.country || "",
        notes: client.notes || "",
        status: client.status,
      });
      setIsEditClientDialogOpen(true);
    }
  };

  const onClientSubmit = (data: ClientFormData) => {
    updateClientMutation.mutate(data);
  };

  const openAddContact = () => {
    setEditingContact(null);
    contactForm.reset({ name: "", email: "", phone: "", title: "" });
    setIsContactDialogOpen(true);
  };

  const openEditContact = (contact: Contact) => {
    setEditingContact(contact);
    contactForm.reset({
      name: contact.name,
      email: contact.email || "",
      phone: contact.phone || "",
      title: contact.title || "",
    });
    setIsContactDialogOpen(true);
  };

  const onContactSubmit = (data: ContactFormData) => {
    if (editingContact) {
      updateContactMutation.mutate({ id: editingContact.id, data });
    } else {
      createContactMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!client) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-muted-foreground">Client not found</p>
          <Button asChild variant="outline">
            <Link href="/admin/clients">Back to Clients</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const totalValue = client.projects.reduce((sum, p) => {
    return sum + p.milestones.reduce((mSum, m) => mSum + m.amountCents, 0);
  }, 0);

  const paidValue = client.projects.reduce((sum, p) => {
    return sum + p.milestones.filter(m => m.status === "paid").reduce((mSum, m) => mSum + m.amountCents, 0);
  }, 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/clients" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Clients
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span>{client.companyName || client.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {client.companyName || client.name}
              <StatusBadge status={client.status} />
              <Button
                variant="ghost"
                size="icon"
                onClick={openEditClient}
                data-testid="button-edit-client"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </h1>
            {client.companyName && (
              <p className="text-muted-foreground flex items-center gap-1">
                {client.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-semibold font-mono">
                ${(paidValue / 100).toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">
                of ${(totalValue / 100).toLocaleString()} total
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-client-overview">Overview</TabsTrigger>
            <TabsTrigger value="projects" data-testid="tab-client-projects">
              Projects ({client.projects.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-client-contacts">
              Contacts ({client.contacts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Client Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {client.email && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground">Email</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a href={`mailto:${client.email}`} className="hover:underline">
                            {client.email}
                          </a>
                        </div>
                      </div>
                    )}
                    {client.phone && (
                      <div>
                        <Label className="text-muted-foreground">Phone</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{client.phone}</span>
                        </div>
                      </div>
                    )}
                    {client.industry && (
                      <div>
                        <Label className="text-muted-foreground">Industry</Label>
                        <p className="mt-1">{client.industry}</p>
                      </div>
                    )}
                    {(client.address || client.city || client.state) && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground">Address</Label>
                        <div className="flex items-start gap-2 mt-1">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            {client.address && <p>{client.address}</p>}
                            {(client.city || client.state || client.zipCode) && (
                              <p>{[client.city, client.state, client.zipCode].filter(Boolean).join(", ")}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Client Since</Label>
                      <p className="mt-1">{format(new Date(client.createdAt), "MMM d, yyyy")}</p>
                    </div>
                  </div>
                  {client.notes && (
                    <div>
                      <Label className="text-muted-foreground">Notes</Label>
                      <p className="mt-1 text-sm">{client.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <span>Projects</span>
                    </div>
                    <Badge variant="secondary">{client.projects.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>Total Value</span>
                    </div>
                    <span className="font-mono font-medium">${(totalValue / 100).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <span>Paid</span>
                    </div>
                    <span className="font-mono font-medium text-green-600 dark:text-green-400">
                      ${(paidValue / 100).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <div className="flex justify-end">
              <Button asChild data-testid="button-add-project">
                <Link href={`/admin/projects/new?clientId=${client.id}`}>
                  Add Project
                </Link>
              </Button>
            </div>
            {client.projects.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No projects yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {client.projects.map((project) => {
                  const projectTotal = project.milestones.reduce((s, m) => s + m.amountCents, 0);
                  const projectPaid = project.milestones.filter(m => m.status === "paid").reduce((s, m) => s + m.amountCents, 0);
                  return (
                    <Link key={project.id} href={`/admin/projects/${project.id}`}>
                      <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-project-${project.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-lg">{project.name}</CardTitle>
                            <div className="flex gap-1 flex-wrap justify-end">
                              <StatusBadge status={project.status} />
                              <StatusBadge status={project.riskState} />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {project.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
                          )}
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <DollarSign className="h-3 w-3" />
                              <span className="font-mono">
                                ${(projectPaid / 100).toLocaleString()} / ${(projectTotal / 100).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>{format(new Date(project.createdAt), "MMM yyyy")}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openAddContact} data-testid="button-add-contact">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </div>
            {client.contacts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <UserPlus className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No contacts yet</p>
                  <p className="text-sm text-muted-foreground">Add contacts to receive notifications about office days</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {client.contacts.map((contact) => (
                  <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{contact.name}</p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`menu-contact-${contact.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditContact(contact)} data-testid={`menu-edit-contact-${contact.id}`}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteContactMutation.mutate(contact.id)}
                              data-testid={`menu-delete-contact-${contact.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {contact.title && <p className="text-sm text-muted-foreground">{contact.title}</p>}
                      {contact.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <a href={`mailto:${contact.email}`} className="hover:underline text-muted-foreground">
                            {contact.email}
                          </a>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{contact.phone}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={isEditClientDialogOpen} onOpenChange={setIsEditClientDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Edit Client
              </DialogTitle>
              <DialogDescription>
                Update client details and information.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={clientForm.handleSubmit(onClientSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client-name">Name *</Label>
                  <Input
                    id="client-name"
                    placeholder="Contact name"
                    {...clientForm.register("name")}
                    data-testid="input-client-name"
                  />
                  {clientForm.formState.errors.name && (
                    <p className="text-sm text-destructive">{clientForm.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-company">Company</Label>
                  <Input
                    id="client-company"
                    placeholder="Company name"
                    {...clientForm.register("companyName")}
                    data-testid="input-client-company"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-email">Email</Label>
                  <Input
                    id="client-email"
                    type="email"
                    placeholder="email@example.com"
                    {...clientForm.register("email")}
                    data-testid="input-client-email"
                  />
                  {clientForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{clientForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-phone">Phone</Label>
                  <Input
                    id="client-phone"
                    placeholder="+1 234 567 8900"
                    {...clientForm.register("phone")}
                    data-testid="input-client-phone"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-industry">Industry</Label>
                  <Input
                    id="client-industry"
                    placeholder="Technology"
                    {...clientForm.register("industry")}
                    data-testid="input-client-industry"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-status">Status</Label>
                  <Select
                    value={clientForm.watch("status")}
                    onValueChange={(value: "lead" | "active" | "past") => clientForm.setValue("status", value)}
                  >
                    <SelectTrigger id="client-status" data-testid="select-client-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="past">Past</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-address">Address</Label>
                <Input
                  id="client-address"
                  placeholder="123 Main St"
                  {...clientForm.register("address")}
                  data-testid="input-client-address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client-city">City</Label>
                  <Input
                    id="client-city"
                    placeholder="City"
                    {...clientForm.register("city")}
                    data-testid="input-client-city"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-state">State / Province</Label>
                  <Input
                    id="client-state"
                    placeholder="State"
                    {...clientForm.register("state")}
                    data-testid="input-client-state"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-zip">Zip / Postal Code</Label>
                  <Input
                    id="client-zip"
                    placeholder="12345"
                    {...clientForm.register("zipCode")}
                    data-testid="input-client-zip"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-country">Country</Label>
                  <Input
                    id="client-country"
                    placeholder="Country"
                    {...clientForm.register("country")}
                    data-testid="input-client-country"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-notes">Notes</Label>
                <Textarea
                  id="client-notes"
                  placeholder="Additional notes about this client..."
                  rows={3}
                  {...clientForm.register("notes")}
                  data-testid="input-client-notes"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditClientDialogOpen(false)} data-testid="button-cancel-edit-client">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateClientMutation.isPending}
                  data-testid="button-save-client"
                >
                  {updateClientMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isContactDialogOpen} onOpenChange={(open) => {
          setIsContactDialogOpen(open);
          if (!open) {
            setEditingContact(null);
            contactForm.reset();
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                {editingContact ? "Edit Contact" : "Add Contact"}
              </DialogTitle>
              <DialogDescription>
                {editingContact ? "Update contact details." : "Add a new contact for this client."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={contactForm.handleSubmit(onContactSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name">Name *</Label>
                <Input
                  id="contact-name"
                  placeholder="John Doe"
                  {...contactForm.register("name")}
                  data-testid="input-contact-name"
                />
                {contactForm.formState.errors.name && (
                  <p className="text-sm text-destructive">{contactForm.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-title">Title / Role</Label>
                <Input
                  id="contact-title"
                  placeholder="Project Manager"
                  {...contactForm.register("title")}
                  data-testid="input-contact-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="john@example.com"
                  {...contactForm.register("email")}
                  data-testid="input-contact-email"
                />
                {contactForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{contactForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  placeholder="+1 234 567 8900"
                  {...contactForm.register("phone")}
                  data-testid="input-contact-phone"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setIsContactDialogOpen(false)} data-testid="button-cancel-contact">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createContactMutation.isPending || updateContactMutation.isPending}
                  data-testid="button-save-contact"
                >
                  {(createContactMutation.isPending || updateContactMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  {editingContact ? "Save Changes" : "Add Contact"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
