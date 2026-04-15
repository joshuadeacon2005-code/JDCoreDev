import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Download, Eye } from "lucide-react";
import { format } from "date-fns";
import { DocumentPreview } from "@/components/DocumentPreview";
import type { Document, Project } from "@shared/schema";

type DocumentWithProject = Document & {
  project?: Project | null;
};

const docTypeLabels: Record<string, string> = {
  contract: "Contract",
  sow: "SOW",
  invoice: "Invoice",
  other: "Other",
};

function canPreview(_mimeType: string | null): boolean {
  // Always allow preview - unsupported types show a fallback message with download option
  return true;
}

export default function PortalDocuments() {
  const [previewDoc, setPreviewDoc] = useState<DocumentWithProject | null>(null);
  
  const { data: documents, isLoading } = useQuery<DocumentWithProject[]>({
    queryKey: ["/api/portal/documents"],
  });

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-muted-foreground">Access your contracts, SOWs, and invoices</p>
        </div>

        <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">{previewDoc?.filename}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-auto">
              {previewDoc && (
                <DocumentPreview
                  storagePath={previewDoc.storagePath}
                  filename={previewDoc.filename}
                  mimeType={previewDoc.mimeType}
                  onDownload={() => window.open(previewDoc.storagePath, "_blank")}
                />
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
            <CardTitle>Your Documents</CardTitle>
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
                <p>No documents available</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents?.map((doc) => (
                  <div 
                    key={doc.id} 
                    className="flex items-center justify-between gap-4 p-4 rounded-lg bg-muted/50"
                    data-testid={`document-${doc.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
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
                          {doc.project && (
                            <span className="text-xs text-muted-foreground">
                              {doc.project.name}
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
