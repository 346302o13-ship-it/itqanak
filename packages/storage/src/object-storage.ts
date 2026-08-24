import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { StorageValidationError } from "./upload-validation.js";

export type StorageObjectMetadata = Readonly<{
  originalName: string;
  declaredMimeType: string;
  detectedMimeType: string;
  contentLength: number;
  uploadedAt: Date;
}>;

export type StoredObject = Readonly<{
  key: string;
  checksumSha256: string;
  contentLength: number;
}>;

export type StorageOpenOptions = Readonly<{
  purpose?: "download" | "background-scan";
}>;

export interface ObjectStorage {
  readonly provider: "local" | "s3";
  readonly bucket?: string;
  checkReadiness?(): Promise<void>;
  put(
    key: string,
    input: Readable | Uint8Array,
    metadata: StorageObjectMetadata,
  ): Promise<StoredObject>;
  open(key: string, options?: StorageOpenOptions): Promise<Readable>;
  signDownload(key: string, expiresInSeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

export type StoragePort = ObjectStorage;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRequestObjectKey(requestId: string, attachmentId: string): string {
  if (!UUID_PATTERN.test(requestId) || !UUID_PATTERN.test(attachmentId)) {
    throw new StorageValidationError(
      "INVALID_KEY",
      "Request object keys require valid identifiers.",
    );
  }
  return `requests/${requestId}/${attachmentId}/${randomBytes(16).toString("hex")}`;
}

export function createConversationObjectKey(conversationId: string, attachmentId: string): string {
  if (!UUID_PATTERN.test(conversationId) || !UUID_PATTERN.test(attachmentId)) {
    throw new StorageValidationError(
      "INVALID_KEY",
      "Conversation object keys require valid identifiers.",
    );
  }
  return `conversations/${conversationId}/${attachmentId}/${randomBytes(16).toString("hex")}`;
}

function assertSafeKey(key: string): void {
  const normalized = normalize(key).replaceAll("\\", "/");
  if (
    key.length < 1 ||
    key.length > 1_024 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0") ||
    key.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    normalized !== key
  ) {
    throw new StorageValidationError("INVALID_KEY", "Invalid private storage key.");
  }
}

function createHashingStream(expectedLength: number): {
  stream: Transform;
  result(): { checksumSha256: string; contentLength: number };
} {
  if (!Number.isSafeInteger(expectedLength) || expectedLength < 1) {
    throw new StorageValidationError("INVALID_LENGTH", "Invalid expected object length.");
  }
  const hash = createHash("sha256");
  let contentLength = 0;
  let finished = false;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      contentLength += chunk.length;
      if (contentLength > expectedLength) {
        callback(
          new StorageValidationError(
            "INVALID_LENGTH",
            "Object byte count exceeds the declared length.",
          ),
        );
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
    final(callback) {
      if (contentLength !== expectedLength) {
        callback(
          new StorageValidationError(
            "INVALID_LENGTH",
            "Object byte count does not match the declared length.",
          ),
        );
        return;
      }
      finished = true;
      callback();
    },
  });
  return {
    stream,
    result: () => {
      if (!finished) {
        throw new StorageValidationError("INVALID_LENGTH", "Object streaming did not finish.");
      }
      return { checksumSha256: hash.digest("hex"), contentLength };
    },
  };
}

function asReadable(input: Readable | Uint8Array): Readable {
  return input instanceof Readable ? input : Readable.from([input]);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function isS3NotFound(error: unknown): boolean {
  if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
    return true;
  }
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return false;
  }
  const metadata = error.$metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "httpStatusCode" in metadata &&
    metadata.httpStatusCode === 404
  );
}

/** Development-only storage rooted outside any HTTP public directory. */
export class LocalPrivateStorage implements ObjectStorage {
  public readonly provider = "local" as const;
  private readonly rootDirectory: string;

  public constructor(rootDirectory: string) {
    const root = resolve(rootDirectory);
    if (!isAbsolute(rootDirectory) || root === "/") {
      throw new StorageValidationError(
        "STORAGE_CONFIGURATION_INVALID",
        "Local private storage requires a safe absolute root.",
      );
    }
    this.rootDirectory = root;
  }

  public async checkReadiness(): Promise<void> {
    const root = await stat(this.rootDirectory);
    if (!root.isDirectory()) {
      throw new StorageValidationError(
        "STORAGE_CONFIGURATION_INVALID",
        "Local private storage root is not a directory.",
      );
    }
  }

  public async put(
    key: string,
    input: Readable | Uint8Array,
    metadata: StorageObjectMetadata,
  ): Promise<StoredObject> {
    const fullPath = this.resolveKey(key);
    await mkdir(dirname(fullPath), { recursive: true, mode: 0o700 });
    const hashing = createHashingStream(metadata.contentLength);
    try {
      await pipeline(
        asReadable(input),
        hashing.stream,
        createWriteStream(fullPath, { flags: "wx", mode: 0o600 }),
      );
    } catch (error: unknown) {
      await unlink(fullPath).catch(() => undefined);
      throw error;
    }
    return { key, ...hashing.result() };
  }

  public async open(key: string): Promise<Readable> {
    const fullPath = this.resolveKey(key);
    await stat(fullPath);
    return createReadStream(fullPath);
  }

  public async signDownload(): Promise<string> {
    throw new StorageValidationError(
      "SIGNING_UNAVAILABLE",
      "Local storage streams authorized downloads and never issues a public URL.",
    );
  }

  public async exists(key: string): Promise<boolean> {
    const fullPath = this.resolveKey(key);
    try {
      await stat(fullPath);
      return true;
    } catch (error: unknown) {
      if (errorCode(error) === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  public async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error: unknown) {
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }
    }
  }

  private resolveKey(key: string): string {
    assertSafeKey(key);
    const target = join(this.rootDirectory, key);
    const relativeTarget = relative(this.rootDirectory, target);
    if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
      throw new StorageValidationError("INVALID_KEY", "Invalid private storage key.");
    }
    return target;
  }
}

export type S3CompatibleStorageOptions = Readonly<{
  bucket: string;
  client: S3Client;
  signingExpiresInSeconds?: number;
  /** Absolute timeout for each network operation; must stay below the one-hour upload lease. */
  operationTimeoutMs?: number;
  /** Short bound for read/head/delete operations used by background workers. */
  readOperationTimeoutMs?: number;
}>;

export const maximumS3ReadOperationTimeoutMs = 2 * 60_000;

/** Private S3-compatible adapter. It never sets a public ACL or returns an object key to clients. */
export class S3CompatibleStorage implements ObjectStorage {
  public readonly provider = "s3" as const;
  public readonly bucket: string;
  private readonly signingExpiresInSeconds: number;
  private readonly operationTimeoutMs: number;
  private readonly readOperationTimeoutMs: number;

  public constructor(private readonly options: S3CompatibleStorageOptions) {
    if (options.bucket.trim().length === 0) {
      throw new StorageValidationError(
        "STORAGE_CONFIGURATION_INVALID",
        "S3 storage requires a bucket.",
      );
    }
    this.bucket = options.bucket;
    this.signingExpiresInSeconds = options.signingExpiresInSeconds ?? 300;
    this.operationTimeoutMs = options.operationTimeoutMs ?? 5 * 60_000;
    this.readOperationTimeoutMs = options.readOperationTimeoutMs ?? 30_000;
    if (
      !Number.isSafeInteger(this.operationTimeoutMs) ||
      this.operationTimeoutMs < 1_000 ||
      this.operationTimeoutMs > 30 * 60_000
    ) {
      throw new StorageValidationError(
        "STORAGE_CONFIGURATION_INVALID",
        "S3 operation timeout must be between one second and thirty minutes.",
      );
    }
    if (
      !Number.isSafeInteger(this.readOperationTimeoutMs) ||
      this.readOperationTimeoutMs < 1_000 ||
      this.readOperationTimeoutMs > maximumS3ReadOperationTimeoutMs
    ) {
      throw new StorageValidationError(
        "STORAGE_CONFIGURATION_INVALID",
        "S3 read-operation timeout must be between one second and two minutes.",
      );
    }
  }

  public async checkReadiness(): Promise<void> {
    await this.options.client.send(
      new HeadBucketCommand({ Bucket: this.options.bucket }),
      this.requestOptions(this.readOperationTimeoutMs),
    );
  }

  public async put(
    key: string,
    input: Readable | Uint8Array,
    metadata: StorageObjectMetadata,
  ): Promise<StoredObject> {
    assertSafeKey(key);
    const hashing = createHashingStream(metadata.contentLength);
    const source = asReadable(input);
    const body = source.pipe(hashing.stream);
    try {
      await Promise.all([
        this.options.client.send(
          new PutObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
            Body: body,
            ContentLength: metadata.contentLength,
            ContentType: "application/octet-stream",
            Metadata: {
              declaredmime: metadata.declaredMimeType,
              detectedmime: metadata.detectedMimeType,
            },
          }),
          this.requestOptions(),
        ),
        finished(body),
      ]);
    } catch (error: unknown) {
      source.destroy();
      body.destroy();
      throw error;
    }
    return { key, ...hashing.result() };
  }

  public async open(key: string, options: StorageOpenOptions = {}): Promise<Readable> {
    assertSafeKey(key);
    const timeoutMs =
      options.purpose === "background-scan" ? this.readOperationTimeoutMs : this.operationTimeoutMs;
    const response = await this.options.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      this.requestOptions(timeoutMs),
    );
    if (!(response.Body instanceof Readable)) {
      throw new StorageValidationError(
        "OBJECT_NOT_READABLE",
        "Private object does not have a readable body.",
      );
    }
    return response.Body;
  }

  public async signDownload(
    key: string,
    expiresInSeconds = this.signingExpiresInSeconds,
  ): Promise<string> {
    assertSafeKey(key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
      throw new StorageValidationError(
        "DOWNLOAD_POLICY_INVALID",
        "Signed download expiry must be between 1 and 900 seconds.",
      );
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
        this.requestOptions(this.readOperationTimeoutMs),
      );
      return true;
    } catch (error: unknown) {
      if (isS3NotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  public async remove(key: string): Promise<void> {
    assertSafeKey(key);
    await this.options.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
      this.requestOptions(this.readOperationTimeoutMs),
    );
  }

  private requestOptions(timeoutMs = this.operationTimeoutMs): {
    readonly abortSignal: AbortSignal;
  } {
    return { abortSignal: AbortSignal.timeout(timeoutMs) };
  }
}

export type ObjectStorageConfig = Readonly<{
  driver: "local" | "s3";
  localPath: string;
  s3?: {
    endpoint?: string;
    region: string;
    bucket: string;
    forcePathStyle: boolean;
    accessKeyId: string;
    secretAccessKey: string;
  };
}>;

export function createObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  if (config.driver === "local") {
    return new LocalPrivateStorage(config.localPath);
  }
  if (config.s3 === undefined) {
    throw new StorageValidationError(
      "STORAGE_CONFIGURATION_INVALID",
      "S3 storage configuration is incomplete.",
    );
  }
  return new S3CompatibleStorage({
    bucket: config.s3.bucket,
    client: createS3Client({
      ...(config.s3.endpoint === undefined ? {} : { endpoint: config.s3.endpoint }),
      region: config.s3.region,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    }),
  });
}

export function createS3Client(config: S3ClientConfig): S3Client {
  return new S3Client(config);
}
