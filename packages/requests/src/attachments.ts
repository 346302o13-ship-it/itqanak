import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import {
  hasPermission,
  recordAuditEvent,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import {
  createRequestObjectKey,
  StorageValidationError,
  validateUpload,
  type ObjectStorage,
} from "@itqanak/storage";

import { RequestDomainError } from "./errors.js";
import { resolveNewAttachmentScanStatus } from "./attachment-scan-policy.js";
import type { RequestAttachmentSummary } from "./types.js";

interface OwnedRequestRow {
  readonly id: string;
  readonly status: string;
  readonly version: number | string;
  readonly service_id: string;
  readonly accepts_files: boolean;
  readonly service_max_files: number | string;
  readonly service_max_file_size_bytes: number | string;
}

interface AttachmentInternalRow {
  readonly id: string;
  readonly request_id: string;
  readonly original_filename: string;
  readonly detected_mime_type: string | null;
  readonly declared_mime_type: string;
  readonly size_bytes: number | string;
  readonly storage_status: string;
  readonly scan_status: string;
  readonly storage_key: string | null;
  readonly created_at: Date | string;
  readonly deleted_at: Date | string | null;
}

interface AttachmentAggregateRow {
  readonly file_count: number | string;
  readonly total_bytes: number | string;
}

export interface AddAttachmentInput {
  readonly expectedVersion: number;
  readonly filename: string;
  readonly declaredMimeType: string;
  readonly contentLength: number;
  readonly header: Uint8Array;
  readonly trailer?: Uint8Array;
  readonly body: Readable;
}

export interface AuthorizedAttachmentDownload {
  readonly body: Readable;
  readonly filename: string;
  readonly mimeType: string;
  readonly contentLength: number;
  readonly scanStatus: "CLEAN" | "SCAN_SKIPPED_DEVELOPMENT" | "SCAN_SKIPPED_BY_ADMIN";
}

export interface AttachmentAccessPolicy {
  /** Inline previews must require CLEAN. Explicit downloads may allow a recorded admin bypass. */
  readonly requireClean?: boolean;
  /** Narrow exception for authenticated playback of strictly validated voice-note formats. */
  readonly allowUnscannedAudioPreview?: boolean;
  /**
   * Inline preview of strictly validated chat media (image / audio / short
   * video) even when the file is `SCAN_SKIPPED_BY_ADMIN` — the administrator
   * has explicitly turned malware scanning off, so previews behave like a
   * normal messenger instead of failing to render.
   */
  readonly allowUnscannedInlineMedia?: boolean;
}

const inlineAudioMimeTypes = new Set(["audio/webm", "audio/ogg", "audio/mpeg", "audio/wav"]);

export interface RequestAttachmentServiceOptions {
  readonly database: DatabaseClient;
  readonly config: AppConfig;
  readonly storage: ObjectStorage;
  readonly logger?: Logger;
}

function integer(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Attachment row contains an invalid ${field}.`);
  }
  return parsed;
}

function date(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Attachment row contains an invalid timestamp.");
  }
  return parsed;
}

function summary(row: AttachmentInternalRow): RequestAttachmentSummary {
  const storageStatus = row.storage_status as RequestAttachmentSummary["storageStatus"];
  const scanStatus = row.scan_status as RequestAttachmentSummary["scanStatus"];
  return {
    id: row.id,
    originalFilename: row.original_filename,
    ...(row.detected_mime_type === null ? {} : { detectedMimeType: row.detected_mime_type }),
    declaredMimeType: row.declared_mime_type,
    sizeBytes: integer(row.size_bytes, "size_bytes"),
    storageStatus,
    scanStatus,
    createdAt: date(row.created_at),
    ...(row.deleted_at === null ? {} : { deletedAt: date(row.deleted_at) }),
  };
}

function eligibleAttachmentStatus(status: string): boolean {
  return status !== "COMPLETED" && status !== "CANCELLED" && status !== "REJECTED";
}

function expectedVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
}

export class RequestAttachmentService {
  private readonly database: DatabaseClient;
  private readonly config: AppConfig;
  private readonly storage: ObjectStorage;
  private readonly logger: Logger | undefined;

  public constructor(options: RequestAttachmentServiceOptions) {
    this.database = options.database;
    this.config = options.config;
    this.storage = options.storage;
    this.logger = options.logger;
  }

  /**
   * Rejects an upload before the HTTP body is consumed. This is an admission
   * check only: addAttachment repeats every check while holding the request
   * row lock immediately before reserving attachment state.
   */
  public async assertUploadAdmission(
    principal: AuthenticatedPrincipal,
    requestNumber: string,
    version: number,
    contentLength: number,
  ): Promise<void> {
    this.requireUploadPermission(principal);
    expectedVersion(version);
    if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
      throw new RequestDomainError("INVALID_REQUEST");
    }
    if (contentLength > this.config.storage.maxFileBytes) {
      throw new RequestDomainError("FILE_TOO_LARGE");
    }
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const request = await this.lockUploadRequest(tx, principal, requestNumber);
      await this.assertUploadCapacity(tx, request, version, contentLength);
    });
  }

  public async addAttachment(
    principal: AuthenticatedPrincipal,
    requestNumber: string,
    input: AddAttachmentInput,
    context: RequestAuditContext = {},
  ): Promise<RequestAttachmentSummary> {
    this.requireUploadPermission(principal);
    expectedVersion(input.expectedVersion);
    let validated;
    try {
      validated = validateUpload({
        filename: input.filename,
        declaredMimeType: input.declaredMimeType,
        size: input.contentLength,
        maxBytes: this.config.storage.maxFileBytes,
        header: input.header,
        ...(input.trailer === undefined ? {} : { trailer: input.trailer }),
      });
    } catch (error: unknown) {
      this.logger?.warn("attachment_upload_rejected", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      if (error instanceof StorageValidationError) {
        if (error.code === "FILE_TOO_LARGE" || error.code === "INVALID_LENGTH") {
          throw new RequestDomainError("FILE_TOO_LARGE");
        }
        if (error.code === "MIME_MISMATCH") {
          throw new RequestDomainError("FILE_MIME_MISMATCH");
        }
        throw new RequestDomainError("FILE_TYPE_NOT_ALLOWED");
      }
      throw error;
    }

    const attachmentId = randomUUID();
    let storageKey = "";
    let requestVersion = 0;
    const requestId = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const request = await this.lockUploadRequest(tx, principal, requestNumber);
      const currentVersion = await this.assertUploadCapacity(
        tx,
        request,
        input.expectedVersion,
        validated.size,
      );
      storageKey = createRequestObjectKey(request.id, attachmentId);
      await tx`
        INSERT INTO service_request_attachments (
          id, request_id, uploaded_by_user_id, storage_provider, storage_bucket,
          storage_key, original_filename, normalized_extension, declared_mime_type,
          size_bytes, storage_status, scan_status
        ) VALUES (
          ${attachmentId}, ${request.id}, ${principal.userId}, ${this.storage.provider},
          ${this.storage.bucket ?? null}, ${storageKey}, ${validated.originalFilename},
          ${validated.normalizedExtension}, ${validated.declaredMimeType}, ${validated.size},
          'PENDING_UPLOAD', 'NOT_REQUIRED'
        )
      `;
      requestVersion = currentVersion;
      return request.id;
    });

    this.logger?.info("attachment_upload_started", { requestId, attachmentId });
    let stored;
    try {
      stored = await this.storage.put(storageKey, input.body, {
        originalName: validated.originalFilename,
        declaredMimeType: validated.declaredMimeType,
        detectedMimeType: validated.detectedMimeType,
        contentLength: validated.size,
        uploadedAt: new Date(),
      });
    } catch (error: unknown) {
      await this.markUploadFailed(attachmentId);
      this.logger?.error("storage_put_failed", { requestId, attachmentId });
      if (error instanceof RequestDomainError) {
        throw error;
      }
      if (error instanceof StorageValidationError && error.code === "INVALID_LENGTH") {
        throw new RequestDomainError("INVALID_REQUEST");
      }
      throw new RequestDomainError("STORAGE_UNAVAILABLE");
    }

    try {
      return await this.database.begin(async (transaction) => {
        const tx = transaction as DatabaseClient;
        const requestRows = await tx<
          { readonly status: string; readonly version: number | string }[]
        >`
          SELECT status, version FROM service_requests WHERE id = ${requestId} FOR UPDATE
        `;
        const request = requestRows[0];
        if (request === undefined || !eligibleAttachmentStatus(request.status)) {
          throw new RequestDomainError("INVALID_TRANSITION");
        }
        const versions = await tx<{ readonly version: number | string }[]>`
          UPDATE service_requests SET version = version + 1, updated_at = now()
          WHERE id = ${requestId} AND version = ${integer(request.version, "version")}
          RETURNING version
        `;
        if (versions[0] === undefined) {
          throw new RequestDomainError("VERSION_CONFLICT");
        }
        requestVersion = integer(versions[0].version, "version");
        const scanStatus = await resolveNewAttachmentScanStatus(tx, this.config);
        const scanWasSkipped =
          scanStatus === "SCAN_SKIPPED_DEVELOPMENT" || scanStatus === "SCAN_SKIPPED_BY_ADMIN";
        const rows = await tx<AttachmentInternalRow[]>`
          UPDATE service_request_attachments
          SET detected_mime_type = ${validated.detectedMimeType}, sha256 = ${stored.checksumSha256},
              storage_status = 'STORED', scan_status = ${scanStatus},
              scan_completed_at = ${scanWasSkipped ? new Date() : null},
              scan_next_attempt_at = ${scanStatus === "PENDING_SCAN" ? new Date() : null},
              updated_at = now()
          WHERE id = ${attachmentId} AND request_id = ${requestId}
            AND storage_status = 'PENDING_UPLOAD'
          RETURNING id, request_id, original_filename, detected_mime_type, declared_mime_type,
                    size_bytes, storage_status, scan_status, storage_key, created_at, deleted_at
        `;
        const attachment = rows[0];
        if (attachment === undefined) {
          throw new RequestDomainError("ATTACHMENT_STATE_INVALID");
        }
        const eventRows = await tx<{ readonly id: number | string }[]>`
          INSERT INTO service_request_events (
            request_id, event_type, actor_type, actor_user_id, request_version, metadata
          ) VALUES (
            ${requestId}, 'ATTACHMENT_ADDED',
            ${hasPermission(principal, "admin.requests.attachments.create") ? "ADMIN" : "STUDENT"}, ${principal.userId},
            ${requestVersion}, ${tx.json({ attachmentId })}
          ) RETURNING id
        `;
        const eventId = String(eventRows[0]?.id ?? "");
        await tx`
          INSERT INTO outbox_events (
            event_type, aggregate_type, aggregate_id, idempotency_key, payload
          ) VALUES (
            'ATTACHMENT_UPLOADED', 'SERVICE_REQUEST', ${requestId},
            ${`attachment:${attachmentId}:uploaded`},
            ${tx.json({ schemaVersion: 1, requestId, attachmentId, eventId })}
          ) ON CONFLICT (idempotency_key) DO NOTHING
        `;
        if (scanStatus === "PENDING_SCAN") {
          await tx`
            INSERT INTO outbox_events (
              event_type, aggregate_type, aggregate_id, idempotency_key, payload
            ) VALUES (
              'ATTACHMENT_SCAN_REQUESTED', 'REQUEST_ATTACHMENT', ${attachmentId},
              ${`attachment:${attachmentId}:scan:1`},
              ${tx.json({ schemaVersion: 1, requestId, attachmentId })}
            ) ON CONFLICT (idempotency_key) DO NOTHING
          `;
        }
        await recordAuditEvent(tx, {
          ...context,
          eventType: "request.attachment_uploaded",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: principal.userId,
          sessionId: principal.sessionId,
          resourceType: "service_request",
          resourceId: requestId,
          metadata: { attachmentId },
        });
        this.logger?.info(
          scanStatus === "SCAN_SKIPPED_DEVELOPMENT"
            ? "attachment_scan_skipped_development"
            : scanStatus === "SCAN_SKIPPED_BY_ADMIN"
              ? "attachment_scan_skipped_by_admin"
              : "attachment_scan_queued",
          { requestId, attachmentId },
        );
        return summary(attachment);
      });
    } catch (error: unknown) {
      // The transaction may have committed even when PostgreSQL's response was
      // lost. Deleting here could therefore leave a STORED attachment pointing
      // at missing bytes. Mark only an authoritative PENDING_UPLOAD row failed;
      // the bounded reconciler later deletes its exact referenced key. A row
      // already committed as STORED remains intact and retryable/downloadable.
      await this.markUploadFailed(attachmentId);
      throw error;
    }
  }

  public async deleteAttachment(
    principal: AuthenticatedPrincipal,
    requestNumber: string,
    attachmentId: string,
    version: number,
    context: RequestAuditContext = {},
  ): Promise<void> {
    requirePermission(principal, "requests.attachments.delete.own");
    expectedVersion(version);
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const request = await this.lockOwnedRequest(tx, principal.userId, requestNumber);
      const currentVersion = integer(request.version, "version");
      if (currentVersion !== version) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      if (!eligibleAttachmentStatus(request.status)) {
        throw new RequestDomainError("INVALID_TRANSITION");
      }
      const rows = await tx<AttachmentInternalRow[]>`
        SELECT id, request_id, original_filename, detected_mime_type, declared_mime_type,
               size_bytes, storage_status, scan_status, storage_key, created_at, deleted_at
        FROM service_request_attachments
        WHERE id = ${attachmentId} AND request_id = ${request.id} AND deleted_at IS NULL
        FOR UPDATE
      `;
      const attachment = rows[0];
      if (attachment === undefined) {
        throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
      }
      // A foreground PUT runs outside the database transaction. Deleting its
      // row while that PUT is still in flight can let DELETE win first and the
      // later PUT recreate an object whose row is already DELETED. Keep the
      // reservation visible and require the client to retry after finalization.
      if (attachment.storage_status === "PENDING_UPLOAD") {
        throw new RequestDomainError("ATTACHMENT_NOT_READY");
      }
      const versions = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests SET version = version + 1, updated_at = now()
        WHERE id = ${request.id} AND version = ${currentVersion}
        RETURNING version
      `;
      if (versions[0] === undefined) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const nextVersion = integer(versions[0].version, "version");
      await tx`
        UPDATE service_request_attachments
        SET deleted_at = now(), storage_status = 'DELETE_PENDING', updated_at = now()
        WHERE id = ${attachment.id}
      `;
      await tx`
        INSERT INTO service_request_events (
          request_id, event_type, actor_type, actor_user_id, request_version, metadata
        ) VALUES (
          ${request.id}, 'ATTACHMENT_REMOVED', 'STUDENT', ${principal.userId}, ${nextVersion},
          ${tx.json({ attachmentId: attachment.id })}
        )
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "request.attachment_deleted",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: request.id,
        metadata: {
          attachmentId: attachment.id,
        },
      });
      return {
        storageKey: attachment.storage_key,
        attachmentId: attachment.id,
        // A failed PUT can still have an ambiguous, late outcome at the
        // provider. Keep DELETE_PENDING for the reconciler's age fence rather
        // than allowing an immediate DELETE to race a still-finishing PUT.
        deferStorageDelete: attachment.storage_status === "UPLOAD_FAILED",
      };
    });
    if (result.storageKey === null || result.deferStorageDelete) {
      return;
    }
    try {
      await this.storage.remove(result.storageKey);
      await this.database`
        UPDATE service_request_attachments SET storage_status = 'DELETED', updated_at = now()
        WHERE id = ${result.attachmentId} AND storage_status = 'DELETE_PENDING'
      `;
    } catch {
      this.logger?.warn("storage_delete_failed", { attachmentId: result.attachmentId });
    }
  }

  public async authorizeDownload(
    principal: AuthenticatedPrincipal,
    requestNumber: string,
    attachmentId: string,
    context: RequestAuditContext = {},
    policy: AttachmentAccessPolicy = {},
  ): Promise<AuthorizedAttachmentDownload> {
    const adminAccess = hasPermission(principal, "admin.requests.attachments.read");
    if (!adminAccess) {
      requirePermission(principal, "requests.attachments.read.own");
    }
    const rows = await this.database<AttachmentInternalRow[]>`
      SELECT attachments.id, attachments.request_id, attachments.original_filename,
             attachments.detected_mime_type, attachments.declared_mime_type,
             attachments.size_bytes, attachments.storage_status, attachments.scan_status,
             attachments.storage_key, attachments.created_at, attachments.deleted_at
      FROM service_request_attachments AS attachments
      INNER JOIN service_requests AS requests ON requests.id = attachments.request_id
      WHERE (${adminAccess} OR requests.student_user_id = ${principal.userId})
        AND requests.request_number = ${requestNumber}
        AND attachments.id = ${attachmentId}
        AND attachments.deleted_at IS NULL
      LIMIT 1
    `;
    const attachment = rows[0];
    if (attachment === undefined) {
      throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    }
    const downloadable =
      attachment.storage_status === "STORED" &&
      (attachment.scan_status === "CLEAN" ||
        ((policy.requireClean !== true ||
          (policy.allowUnscannedAudioPreview === true &&
            attachment.detected_mime_type !== null &&
            inlineAudioMimeTypes.has(attachment.detected_mime_type))) &&
          (attachment.scan_status === "SCAN_SKIPPED_BY_ADMIN" ||
            (this.config.nodeEnv !== "production" &&
              attachment.scan_status === "SCAN_SKIPPED_DEVELOPMENT"))));
    if (!downloadable || attachment.storage_key === null) {
      await recordAuditEvent(this.database, {
        ...context,
        eventType: "request.download_denied",
        outcome: "DENIED",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: attachment.request_id,
        metadata: {
          attachmentId: attachment.id,
        },
      });
      this.logger?.warn("attachment_download_denied", { attachmentId: attachment.id });
      throw new RequestDomainError("ATTACHMENT_NOT_READY");
    }
    let body: Readable;
    try {
      body = await this.storage.open(attachment.storage_key);
    } catch {
      this.logger?.error("storage_get_failed", { attachmentId: attachment.id });
      throw new RequestDomainError("STORAGE_UNAVAILABLE");
    }
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "request.download_requested",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      sessionId: principal.sessionId,
      resourceType: "service_request",
      resourceId: attachment.request_id,
      metadata: {
        attachmentId: attachment.id,
      },
    });
    return {
      body,
      filename: attachment.original_filename,
      mimeType: attachment.detected_mime_type ?? "application/octet-stream",
      contentLength: integer(attachment.size_bytes, "size_bytes"),
      scanStatus: attachment.scan_status as AuthorizedAttachmentDownload["scanStatus"],
    };
  }

  private async lockOwnedRequest(
    database: DatabaseClient,
    userId: string,
    requestNumber: string,
  ): Promise<OwnedRequestRow> {
    const rows = await database<OwnedRequestRow[]>`
      SELECT requests.id, requests.status, requests.version, requests.service_id,
             services.accepts_files, services.max_files AS service_max_files,
             services.max_file_size_bytes AS service_max_file_size_bytes
      FROM service_requests AS requests
      INNER JOIN services ON services.id = requests.service_id
      WHERE requests.student_user_id = ${userId} AND requests.request_number = ${requestNumber}
      FOR UPDATE OF requests
    `;
    const row = rows[0];
    if (row === undefined) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    return row;
  }

  private requireUploadPermission(principal: AuthenticatedPrincipal): void {
    if (!hasPermission(principal, "admin.requests.attachments.create")) {
      requirePermission(principal, "requests.attachments.create.own");
    }
  }

  private async lockUploadRequest(
    database: DatabaseClient,
    principal: AuthenticatedPrincipal,
    requestNumber: string,
  ): Promise<OwnedRequestRow> {
    if (!hasPermission(principal, "admin.requests.attachments.create")) {
      return this.lockOwnedRequest(database, principal.userId, requestNumber);
    }
    const rows = await database<OwnedRequestRow[]>`
      SELECT requests.id, requests.status, requests.version, requests.service_id,
             services.accepts_files, services.max_files AS service_max_files,
             services.max_file_size_bytes AS service_max_file_size_bytes
      FROM service_requests AS requests
      INNER JOIN services ON services.id = requests.service_id
      WHERE requests.request_number = ${requestNumber}
      FOR UPDATE OF requests
    `;
    const row = rows[0];
    if (row === undefined) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    return row;
  }

  private async assertUploadCapacity(
    database: DatabaseClient,
    request: OwnedRequestRow,
    version: number,
    contentLength: number,
  ): Promise<number> {
    const currentVersion = integer(request.version, "version");
    if (currentVersion !== version) {
      throw new RequestDomainError("VERSION_CONFLICT");
    }
    if (!eligibleAttachmentStatus(request.status)) {
      throw new RequestDomainError("INVALID_TRANSITION");
    }
    if (!request.accepts_files) {
      throw new RequestDomainError("FILE_TYPE_NOT_ALLOWED");
    }
    const maximumFileBytes = Math.min(
      integer(request.service_max_file_size_bytes, "max_file_size_bytes"),
      this.config.storage.maxFileBytes,
    );
    if (contentLength > maximumFileBytes) {
      throw new RequestDomainError("FILE_TOO_LARGE");
    }
    const aggregates = await database<AttachmentAggregateRow[]>`
      SELECT count(*)::text AS file_count, COALESCE(sum(size_bytes), 0)::text AS total_bytes
      FROM service_request_attachments
      WHERE request_id = ${request.id} AND deleted_at IS NULL
        AND storage_status <> 'UPLOAD_FAILED'
    `;
    const fileCount = integer(aggregates[0]?.file_count ?? "0", "file_count");
    const totalBytes = integer(aggregates[0]?.total_bytes ?? "0", "total_bytes");
    const maximumFiles = Math.min(
      integer(request.service_max_files, "max_files"),
      this.config.storage.maxFilesPerRequest,
    );
    if (fileCount >= maximumFiles) {
      throw new RequestDomainError("MAX_FILES_EXCEEDED");
    }
    if (totalBytes + contentLength > this.config.storage.maxTotalBytesPerRequest) {
      throw new RequestDomainError("TOTAL_FILE_SIZE_EXCEEDED");
    }
    return currentVersion;
  }

  private async markUploadFailed(attachmentId: string): Promise<void> {
    await this.database`
      UPDATE service_request_attachments
      SET storage_status = 'UPLOAD_FAILED', scan_status = 'NOT_REQUIRED', updated_at = now()
      WHERE id = ${attachmentId} AND storage_status = 'PENDING_UPLOAD'
    `.catch(() => undefined);
  }
}
