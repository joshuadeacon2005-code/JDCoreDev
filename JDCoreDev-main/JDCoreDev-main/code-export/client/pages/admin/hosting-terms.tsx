import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, AlertTriangle, Server, Lock } from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import type { HostingTerms } from "@shared/schema";

export default function AdminHostingTerms() {
  const { toast } = useToast();
  const [editingTerm, setEditingTerm] = useState<HostingTerms | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");

  const { data: terms, isLoading } = useQuery<HostingTerms[]>({
    queryKey: ["/api/admin/hosting-terms"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; contentMarkdown: string }) => {
      const res = await apiRequest("POST", "/api/admin/hosting-terms", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-terms"] });
      toast({ title: "Created", description: "Hosting reference entry created" });
      setIsCreateOpen(false);
      setFormTitle("");
      setFormContent("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; title: string; contentMarkdown: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/hosting-terms/${data.id}`, {
        title: data.title,
        contentMarkdown: data.contentMarkdown,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hosting-terms"] });
      toast({ title: "Updated", description: "Hosting reference entry updated" });
      setEditingTerm(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    createMutation.mutate({ title: formTitle, contentMarkdown: formContent });
  };

  const handleUpdate = () => {
    if (!editingTerm || !formTitle.trim() || !formContent.trim()) return;
    updateMutation.mutate({ id: editingTerm.id, title: formTitle, contentMarkdown: formContent });
  };

  const openEditDialog = (term: HostingTerms) => {
    setEditingTerm(term);
    setFormTitle(term.title);
    setFormContent(term.contentMarkdown);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">Hosting Reference</h1>
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Internal Only
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Internal reference for hosting terms, pricing, and platform information
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-hosting-term">
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Hosting Reference Entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g., Pricing Overview"
                    data-testid="input-hosting-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Content (Markdown)</Label>
                  <Textarea
                    id="content"
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="Enter content in Markdown format..."
                    className="min-h-[300px] font-mono text-sm"
                    data-testid="input-hosting-content"
                  />
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !formTitle.trim() || !formContent.trim()}
                  data-testid="button-save-hosting-term"
                >
                  {createMutation.isPending ? "Creating..." : "Create Entry"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-600 dark:text-amber-400">For Internal Reference Only</p>
                <p className="text-muted-foreground">
                  This information is for your administrative reference. It is not displayed to clients or in the public website.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : terms && terms.length > 0 ? (
          <div className="space-y-4">
            {terms.map((term) => (
              <Card key={term.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        <Server className="h-4 w-4" />
                        {term.title}
                      </CardTitle>
                      <CardDescription>
                        Last updated: {format(new Date(term.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                      </CardDescription>
                    </div>
                    <Dialog open={editingTerm?.id === term.id} onOpenChange={(open) => !open && setEditingTerm(null)}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(term)}
                          data-testid={`button-edit-hosting-term-${term.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Hosting Reference Entry</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="edit-title">Title</Label>
                            <Input
                              id="edit-title"
                              value={formTitle}
                              onChange={(e) => setFormTitle(e.target.value)}
                              data-testid="input-edit-hosting-title"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-content">Content (Markdown)</Label>
                            <Textarea
                              id="edit-content"
                              value={formContent}
                              onChange={(e) => setFormContent(e.target.value)}
                              className="min-h-[300px] font-mono text-sm"
                              data-testid="input-edit-hosting-content"
                            />
                          </div>
                          <Button
                            onClick={handleUpdate}
                            disabled={updateMutation.isPending || !formTitle.trim() || !formContent.trim()}
                            data-testid="button-update-hosting-term"
                          >
                            {updateMutation.isPending ? "Updating..." : "Update Entry"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{term.contentMarkdown}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No hosting reference entries yet</h3>
              <p className="text-muted-foreground mb-4">
                Add entries to keep track of hosting terms, pricing, and platform information for your reference.
              </p>
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-first-hosting-term">
                <Plus className="h-4 w-4 mr-2" />
                Add First Entry
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
