import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, Download, Upload, File, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";
import type { Document, Client, Project } from "@shared/schema";

type DocumentWithDetails = Document & {
  client?: Client;
  project?: Project | null;
};

const docTypeLabels: Record<string, string> = {
  contract: "Contract",
  sow: "SOW",
  invoice: "Invoice",
  other: "Other",
};

const mimeTypeIcons: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "image/png": File,
  "image/jpeg": File,
  default: File,
};

function canPreview(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

export default function AdminDocuments() {
  const { toast } = useToast();
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedDocType, setSelectedDocType] = useState<string>("other");
  const [previewDoc, setPreviewDoc] = useState<DocumentWithDetails | null>(null);
  const pendingUploadsRef = useRef<Map<string, { objectPath: string; filename: string; contentType: string }>>(new Map());

  const { data: documents, isLoading } = useQuery<DocumentWithDetails[]>({
    queryKey: ["/api/admin/documents"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/admin/clients"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: { filename: string; storagePath: string; mimeType: string; clientId: number; projectId?: number; docType: string }) => {
      return apiRequest("POST", "/api/admin/documents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      toast({ title: "Document deleted" });
    },
  });

  const handleUploadComplete = async (result: any) => {
    const clientId = selectedClient;
    const projectId = selectedProject;
    const docType = selectedDocType;
    
    try {
      for (const file of result.successful || []) {
        const pending = pendingUploadsRef.current.get(file.id);
        if (pending && clientId) {
          await createDocumentMutation.mutateAsync({
            filename: pending.filename,
            storagePath: pending.objectPath,
            mimeType: pending.contentType,
            clientId: parseInt(clientId),
            projectId: projectId ? parseInt(projectId) : undefined,
            docType: docType,
          });
          pendingUploadsRef.current.delete(file.id);
        }
      }
      toast({ title: "Document uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to save document", variant: "destructive" });
    } finally {
      setShowUploadDialog(false);
      setSelectedClient("");
      setSelectedProject("");
      setSelectedDocType("other");
    }
  };

  const handleGetUploadParameters = async (file: any) => {
    const res = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type,
      }),
    });
    const { uploadURL, objectPath } = await res.json();
    
    pendingUploadsRef.current.set(file.id, {
      objectPath,
      filename: file.name,
      contentType: file.type,
    });
    
    return {
      method: "PUT" as const,
      url: uploadURL,
      headers: { "Content-Type": file.type },
    };
  };

  const filteredProjects = projects?.filter(p => 
    !selectedClient || p.clientId === parseInt(selectedClient)
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Documents</h1>
            <p className="text-muted-foreground">Manage contracts, SOWs, invoices, and other documents</p>
          </div>
          <Button onClick={() => setShowUploadDialog(true)} data-testid="button-upload-document">
            <Upload className="h-4 w-4 mr-2" /> Upload Document
          </Button>
        </div>

        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger data-testid="select-client">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id.toString()}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project (optional)</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject} disabled={!selectedClient}>
                  <SelectTrigger data-testid="select-project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProjects?.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                  <SelectTrigger data-testid="select-doctype">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="sow">SOW</SelectItem>
                    <SelectItem value="prd">PRD</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="brief">Brief</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedClient && (
                <ObjectUploader
                  onGetUploadParameters={handleGetUploadParameters}
                  onComplete={handleUploadComplete}
                >
                  <Upload className="h-4 w-4 mr-2" /> Select File & Upload
                </ObjectUploader>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">{previewDoc?.filename}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-auto">
              {previewDoc?.mimeType?.startsWith("image/") ? (
                <img 
                  src={previewDoc.storagePath} 
                  alt={previewDoc.filename}
                  className="max-w-full h-auto mx-auto"
                />
              ) : previewDoc?.mimeType === "application/pdf" ? (
                <iframe
                  src={previewDoc.storagePath}
                  className="w-full h-[70vh]"
                  title={previewDoc.filename}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="h-16 w-16 mb-4 opacity-50" />
                  <p>Preview not available for this file type</p>
                  <Button 
                    className="mt-4" 
                    onClick={() => window.open(previewDoc?.storagePath, "_blank")}
                    data-testid="button-preview-fallback-download"
                  >
                    <Download className="h-4 w-4 mr-2" /> Download to view
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewDoc(null)} data-testid="button-preview-close">
                Close
              </Button>
              <Button onClick={() => window.open(previewDoc?.storagePath, "_blank")} data-testid="button-preview-download">
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>All Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : documents?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p>No documents yet</p>
                <p className="text-sm">Upload your first document to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents?.map((doc) => {
                  const Icon = mimeTypeIcons[doc.mimeType || ""] || mimeTypeIcons.default;
                  return (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between gap-4 p-4 rounded-lg bg-muted/50"
                      data-testid={`document-${doc.id}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium font-mono text-sm truncate">{doc.filename}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {docTypeLabels[doc.docType] || doc.docType}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              v{doc.version}
                            </span>
                            {doc.client && (
                              <span className="text-xs text-muted-foreground">
                                {doc.client.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right mr-2">
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                          </p>
                          {doc.signed && (
                            <Badge appearance="stroke" className="text-xs mt-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                              Signed
                            </Badge>
                          )}
                        </div>
                        {canPreview(doc.mimeType) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setPreviewDoc(doc)}
                            data-testid={`button-view-${doc.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => window.open(doc.storagePath, "_blank")}
                          data-testid={`button-download-${doc.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteDocumentMutation.mutate(doc.id)}
                          data-testid={`button-delete-${doc.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
