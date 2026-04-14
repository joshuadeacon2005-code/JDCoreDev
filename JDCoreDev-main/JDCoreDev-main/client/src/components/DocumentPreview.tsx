import { useState, useEffect, useRef } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentPreviewProps {
  storagePath: string;
  filename: string;
  mimeType: string | null;
  onDownload?: () => void;
}

export function DocumentPreview({ storagePath, filename, mimeType, onDownload }: DocumentPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let currentBlobUrl: string | null = null;
    let isCancelled = false;

    async function fetchDocument() {
      setLoading(true);
      setError(null);

      // Revoke previous blob URL before creating a new one
      if (previousBlobUrlRef.current) {
        URL.revokeObjectURL(previousBlobUrlRef.current);
        previousBlobUrlRef.current = null;
      }

      try {
        const response = await fetch(storagePath, {
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error("You don't have permission to view this document");
          }
          throw new Error("Failed to load document");
        }

        const blob = await response.blob();
        
        if (isCancelled) return;
        
        currentBlobUrl = URL.createObjectURL(blob);
        previousBlobUrlRef.current = currentBlobUrl;
        setBlobUrl(currentBlobUrl);
      } catch (err) {
        if (isCancelled) return;
        console.error("Error loading document preview:", err);
        setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchDocument();

    return () => {
      isCancelled = true;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [storagePath]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previousBlobUrlRef.current) {
        URL.revokeObjectURL(previousBlobUrlRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-12 w-12 animate-spin mb-4" />
        <p>Loading preview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-16 w-16 mb-4 opacity-50" />
        <p>Failed to load preview</p>
        <p className="text-sm mt-1">{error}</p>
        {onDownload && (
          <Button className="mt-4" onClick={onDownload} data-testid="button-preview-error-download">
            <Download className="h-4 w-4 mr-2" /> Download to view
          </Button>
        )}
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-16 w-16 mb-4 opacity-50" />
        <p>Preview not available</p>
      </div>
    );
  }

  if (mimeType?.startsWith("image/")) {
    return (
      <img
        src={blobUrl}
        alt={filename}
        className="max-w-full h-auto mx-auto"
        data-testid="preview-image"
      />
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <iframe
        src={blobUrl}
        className="w-full h-[70vh]"
        title={filename}
        data-testid="preview-pdf"
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <FileText className="h-16 w-16 mb-4 opacity-50" />
      <p>Preview not available for this file type</p>
      {onDownload && (
        <Button className="mt-4" onClick={onDownload} data-testid="button-preview-fallback-download">
          <Download className="h-4 w-4 mr-2" /> Download to view
        </Button>
      )}
    </div>
  );
}
