import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { basename, dirname, join, normalize, relative } from "node:path";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "text/plain",
]);

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".mp3",
  ".wav",
  ".txt",
]);

export type StorageObjectMetadata = Readonly<{
  originalName: string;
  declaredMimeType: string;
  contentLength: number;
  uploadedAt: Date;
}>;

export type StoredObject = Readonly<{
  key: string;
  checksumSha256: string;
  contentLength: number;
}>;

export type StoragePort = Readonly<{
  put(input: Readable | Uint8Array, metadata: StorageObjectMetadata): Promise<StoredObject>;
  open(key: string): Promise<Readable>;
  signDownload(key: string, expiresInSeconds: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}>;

export class StorageValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "StorageValidationError";
  }
}

export function assertAllowedUpload(
  filename: string,
  declaredMimeType: string,
  size: number,
  maxBytes: number,
): void {
  const extensionIndex = filename.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex).toLowerCase() : "";

  if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new StorageValidationError("The file extension is not allowed.");
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(declaredMimeType)) {
    throw new StorageValidationError("The declared MIME type is not allowed.");
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) {
    throw new StorageValidationError("The file size is outside the permitted range.");
  }
}

export function createOpaqueObjectKey(namespace = "uploads"): string {
  const safeNamespace =
    namespace.replace(/[^a-z0-9/_-]/gi, "").replace(/^\/+|\/+$/g, "") || "uploads";
  return `${safeNamespace}/${randomUUID().replaceAll("-", "")}`;
}

function assertSafeKey(key: string): void {
  const normalKey = normalize(key).replaceAll("\\", "/");
  if (
    key.length === 0 ||
    key.startsWith("/") ||
    normalKey === ".." ||
    normalKey.startsWith("../")
  ) {
    throw new StorageValidationError("Invalid private storage key.");
  }
}

async function readInput(input: Readable | Uint8Array): Promise<Buffer> {
  if (input instanceof Uint8Array) {
    return Buffer.from(input);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Development-only private filesystem implementation. The configured root must
 * stay outside an HTTP public directory and is never returned as a public URL.
 */
export class LocalPrivateStorage implements StoragePort {
  public constructor(private readonly rootDirectory: string) {}

  public async put(
    input: Readable | Uint8Array,
    metadata: StorageObjectMetadata,
  ): Promise<StoredObject> {
    const key = createOpaqueObjectKey();
    const content = await readInput(input);
    if (content.length !== metadata.contentLength) {
      throw new StorageValidationError(
        "Uploaded byte count does not match the declared content length.",
      );
    }

    const fullPath = this.resolve(key);
    await mkdir(dirname(fullPath), { recursive: true, mode: 0o700 });
    const file = await open(fullPath, "wx", 0o600);
    try {
      await file.writeFile(content);
    } finally {
      await file.close();
    }

    return {
      key,
      checksumSha256: createHash("sha256").update(content).digest("hex"),
      contentLength: content.length,
    };
  }

  public async open(key: string): Promise<Readable> {
    const fullPath = this.resolve(key);
    await stat(fullPath);
    return createReadStream(fullPath);
  }

  public async signDownload(): Promise<string> {
    throw new StorageValidationError(
      "Local storage does not issue public URLs. Authorize and stream downloads through the application.",
    );
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  public async remove(key: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    await unlink(this.resolve(key));
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const target = join(this.rootDirectory, key);
    const root = normalize(this.rootDirectory);
    if (relative(root, target).startsWith("..")) {
      throw new StorageValidationError("Invalid private storage key.");
    }
    return target;
  }
}

export type S3CompatibleStorageOptions = Readonly<{
  bucket: string;
  client: S3Client;
  signingExpiresInSeconds?: number;
}>;

/** S3-compatible implementation intended for production object storage. */
export class S3CompatibleStorage implements StoragePort {
  private readonly signingExpiresInSeconds: number;

  public constructor(private readonly options: S3CompatibleStorageOptions) {
    this.signingExpiresInSeconds = options.signingExpiresInSeconds ?? 300;
  }

  public async put(
    input: Readable | Uint8Array,
    metadata: StorageObjectMetadata,
  ): Promise<StoredObject> {
    const key = createOpaqueObjectKey();
    const content = await readInput(input);
    const checksumSha256 = createHash("sha256").update(content).digest("hex");
    await this.options.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: content,
        ContentLength: content.length,
        ContentType: "application/octet-stream",
        Metadata: {
          originalName: basename(metadata.originalName),
          declaredMimeType: metadata.declaredMimeType,
          checksumSha256,
        },
      }),
    );
    return { key, checksumSha256, contentLength: content.length };
  }

  public async open(key: string): Promise<Readable> {
    assertSafeKey(key);
    const response = await this.options.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (response.Body === undefined) {
      throw new StorageValidationError("Private object does not have a readable body.");
    }
    return response.Body as Readable;
  }

  public async signDownload(
    key: string,
    expiresInSeconds = this.signingExpiresInSeconds,
  ): Promise<string> {
    assertSafeKey(key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
      throw new StorageValidationError("Signed download expiry must be between 1 and 900 seconds.");
    }
    return getSignedUrl(
      this.options.client,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ResponseContentDisposition: "attachment",
        ResponseContentType: "application/octet-stream",
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  public async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.options.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  public async remove(key: string): Promise<void> {
    assertSafeKey(key);
    await this.options.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
  }
}

export function createS3Client(config: S3ClientConfig): S3Client {
  return new S3Client(config);
}
