import { Response } from "express";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const SIGNED_URL_TTL_SEC = 900;

function getSigningKey(): string {
  const key = process.env.UPLOAD_SIGNING_KEY || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("UPLOAD_SIGNING_KEY (or SESSION_SECRET) must be set");
  }
  return key;
}

function signUploadToken(objectId: string, expiresAt: number): string {
  const payload = `${objectId}.${expiresAt}`;
  const sig = createHmac("sha256", getSigningKey()).update(payload).digest("hex");
  return `${objectId}.${expiresAt}.${sig}`;
}

export function verifyUploadToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [objectId, expStr, sig] = parts;
  if (!/^[a-f0-9-]{36}$/.test(objectId)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = createHmac("sha256", getSigningKey())
    .update(`${objectId}.${expStr}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return objectId;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class LocalFile {
  constructor(public readonly absolutePath: string) {}
  get name(): string {
    return path.basename(this.absolutePath);
  }
  async exists(): Promise<[boolean]> {
    try {
      await fsp.access(this.absolutePath);
      return [true];
    } catch {
      return [false];
    }
  }
  createReadStream(): NodeJS.ReadableStream {
    return fs.createReadStream(this.absolutePath);
  }
  async getMetadata(): Promise<[{ contentType?: string; size?: number }]> {
    const stat = await fsp.stat(this.absolutePath);
    let contentType: string | undefined;
    try {
      const m = JSON.parse(await fsp.readFile(this.absolutePath + ".meta.json", "utf8"));
      contentType = m.contentType;
    } catch {}
    return [{ contentType, size: stat.size }];
  }
  async setContentType(ct: string | undefined): Promise<void> {
    if (!ct) return;
    await fsp.writeFile(this.absolutePath + ".meta.json", JSON.stringify({ contentType: ct }));
  }
  async delete(): Promise<void> {
    for (const p of [this.absolutePath, this.absolutePath + ".meta.json", this.absolutePath + ".acl.json"]) {
      try { await fsp.unlink(p); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
    }
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(pathsStr.split(",").map((p) => p.trim()).filter(Boolean)),
    );
    if (paths.length === 0) {
      throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set");
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR not set");
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<LocalFile | null> {
    const safe = path.posix.normalize(filePath).replace(/^\/+/, "");
    if (safe.startsWith("..")) return null;
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const root = path.resolve(searchPath);
      const full = path.resolve(root, safe);
      if (!full.startsWith(root + path.sep) && full !== root) continue;
      try {
        await fsp.access(full);
        return new LocalFile(full);
      } catch {}
    }
    return null;
  }

  async downloadObject(file: LocalFile, res: Response, cacheTtlSec: number = 3600): Promise<void> {
    try {
      const [meta] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      res.set({
        "Content-Type": meta.contentType || "application/octet-stream",
        "Content-Length": meta.size != null ? String(meta.size) : "",
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SEC;
    const token = signUploadToken(objectId, exp);
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    return `${base}/api/uploads/put/${token}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }
    const entityId = parts.slice(1).join("/");
    if (entityId.includes("..") || entityId.includes("\0")) {
      throw new ObjectNotFoundError();
    }
    const root = path.resolve(this.getPrivateObjectDir());
    const full = path.resolve(root, entityId);
    if (!full.startsWith(root + path.sep) && full !== root) {
      throw new ObjectNotFoundError();
    }
    const f = new LocalFile(full);
    const [exists] = await f.exists();
    if (!exists) throw new ObjectNotFoundError();
    return f;
  }

  // Convert any of the upload-URL forms we've ever issued, plus already-normalized
  // /objects/... paths, into the canonical /objects/<id> form stored in the DB.
  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;

    let parsed: URL | null = null;
    try {
      parsed = new URL(rawPath, "http://_/");
    } catch {
      return rawPath;
    }

    // New-style HMAC-signed PUT URL: /api/uploads/put/<id>.<exp>.<sig>
    const m = parsed.pathname.match(/^\/api\/uploads\/put\/([^/.]+)\.[0-9]+\.[a-f0-9]+$/);
    if (m) {
      return `/objects/uploads/${m[1]}`;
    }

    // Legacy GCS form
    if (rawPath.startsWith("https://storage.googleapis.com/")) {
      let dir = this.getPrivateObjectDir();
      if (!dir.endsWith("/")) dir += "/";
      const raw = parsed.pathname;
      if (!raw.startsWith(dir)) return raw;
      return `/objects/${raw.slice(dir.length)}`;
    }

    return rawPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;
    const file = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(file, aclPolicy);
    return normalizedPath;
  }

  async deleteObjectEntity(objectPath: string): Promise<void> {
    try {
      const f = await this.getObjectEntityFile(objectPath);
      await f.delete();
    } catch (e) {
      if (e instanceof ObjectNotFoundError) return;
      throw e;
    }
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: LocalFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  // Persist an uploaded object stream to disk under PRIVATE_OBJECT_DIR/uploads/<objectId>.
  // Used by the PUT /api/uploads/put/<token> route handler.
  async writeUploadedObject(
    objectId: string,
    stream: NodeJS.ReadableStream,
    contentType: string | undefined,
    maxBytes = 100 * 1024 * 1024,
  ): Promise<{ objectPath: string; bytes: number }> {
    if (!/^[a-f0-9-]{36}$/.test(objectId)) {
      throw new Error("Invalid objectId");
    }
    const root = path.resolve(this.getPrivateObjectDir());
    const dir = path.join(root, "uploads");
    await ensureDir(dir);
    const full = path.join(dir, objectId);

    let bytes = 0;
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(full);
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          stream.removeAllListeners("data");
          out.destroy();
          fs.promises.unlink(full).catch(() => {});
          reject(new Error(`Upload exceeded ${maxBytes} bytes`));
        }
      });
      stream.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => resolve());
      stream.pipe(out);
    });

    const file = new LocalFile(full);
    await file.setContentType(contentType);
    return { objectPath: `/objects/uploads/${objectId}`, bytes };
  }
}
