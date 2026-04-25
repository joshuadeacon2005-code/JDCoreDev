import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError, verifyUploadToken } from "./objectStorage";

// Default upload routes for the local-volume backed ObjectStorageService.
// `server/routes.ts` registers richer auth-protected versions; this exists for
// projects that want a drop-in registration helper.
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.put("/api/uploads/put/:token", async (req, res) => {
    try {
      const objectId = verifyUploadToken(req.params.token);
      if (!objectId) {
        return res.status(403).json({ error: "Invalid or expired upload token" });
      }
      const contentType =
        (req.headers["content-type"] || "").toString().split(";")[0].trim() || undefined;
      const result = await objectStorageService.writeUploadedObject(objectId, req, contentType);
      res.json(result);
    } catch (error) {
      console.error("Error receiving upload:", error);
      res.status(500).json({ error: "Failed to receive upload" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
