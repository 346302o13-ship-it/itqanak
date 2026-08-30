import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import {
  hasPermission,
  recordAuditEvent,
  requirePermission,
  requireRole,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import {
  createConversationObjectKey,
  StorageValidationError,
  validateUpload,
  type ObjectStorage,
} from "@itqanak/storage";

import { resolveNewAttachmentScanStatus } from "./attachment-scan-policy.js";
import { isUuid } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import type { AttachmentAccessPolicy, AuthorizedAttachmentDownload } from "./attachments.js";
import type { UnifiedConversationAttachment } from "./types.js";

interface ConversationAccessRow {
  readonly id: string;
  readonly student_user_id: string;
}

interface AttachmentRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly request_id: string | null;
  readonly uploaded_by_user_id: string;
  readonly original_filename: string;
  readonly detected_mime_type: string | null;
  readonly declared_mime_type: string;
  readonly size_bytes: number | string;
  readonly storage_status: string;
  readonly scan_status: string;
  readonly storage_key: string | null;
  readonly created_at: Date | string;
}

interface AggregateRow {
  readonly file_count: number | string;
  readonly total_bytes: number | string;
}

export interface AddUnifiedConversationAttachmentInput {
  readonly filename: string;
  readonly declaredMimeType: string;
  readonly contentLength: number;
  readonly header: Uint8Array;
  readonly trailer?: Uint8Array;
  readonly body: Readable;
  readonly requestId?: string | null;
}

export interface UnifiedConversationAttachmentServiceOptions {
  readonly database: DatabaseClient;
  readonly config: AppConfig;
  readonly storage: ObjectStorage;
  readonly logger?: Logger;
}

const allowedInlineAudio = new Set(["audio/webm", "audio/ogg", "audio/mpeg", "audio/wav"]);
const allowedInlineMedia = new Set([...allowedInlineAudio, "image/png", "image/jpeg", "video/mp4"]);

function integer(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Unified attachment contains an invalid ${field}.`);
  }
  return parsed;
}

function date(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Unified attachment has an invalid date.");
  return parsed;
}

function summary(row: AttachmentRow): UnifiedConversationAttachment {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    ...(row.request_id === null ? {} : { requestId: row.request_id }),
    originalFilename: row.original_filename,
    declaredMimeType: row.declared_mime_type,
    ...(row.detected_mime_type === null ? {} : { detectedMimeType: row.detected_mime_type }),
    sizeBytes: integer(row.size_bytes, "size"),
    storageStatus: row.storage_status as UnifiedConversationAttachment["storageStatus"],
    scanStatus: row.scan_status as UnifiedConversationAttachment["scanStatus"],
    createdAt: date(row.created_at),
  };
}

export class UnifiedConversationAttachmentService {
  private readonly database: DatabaseClient;
  private readonly config: AppConfig;
  private readonly storage: ObjectStorage;
  private readonly logger: Logger | undefined;

  public constructor(options: UnifiedConversationAttachmentServiceOptions) {
    this.database = options.database;
    this.config = options.config;
    this.storage = options.storage;
    this.logger = options.logger;
  }

  public async assertUploadAdmission(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    contentLength: number,
    requestId?: string,
  ): Promise<void> {
    this.requireSendPermission(principal);
    if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
      throw new RequestDomainError("INVALID_REQUEST");
    }
    if (contentLength > this.config.storage.maxFileBytes) {
      throw new RequestDomainError("FILE_TOO_LARGE");
    }
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const conversation = await this.lockConversation(tx, principal, conversationId);
      if (requestId !== undefined) {
        if (!isUuid(requestId)) throw new RequestDomainError("REQUEST_NOT_FOUND");
        const requests = await tx<{ readonly id: string }[]>`
          SELECT id FROM service_requests
          WHERE id = ${requestId} AND student_user_id = ${conversation.student_user_id}
          LIMIT 1
        `;
        if (requests[0] === undefined) throw new RequestDomainError("REQUEST_NOT_FOUND");
      }
      await this.assertCapacity(tx, conversation.id, contentLength, requestId);
    });
  }

  public async addAttachment(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    input: AddUnifiedConversationAttachmentInput,
    context: RequestAuditContext = {},
  ): Promise<UnifiedConversationAttachment> {
    this.requireSendPermission(principal);
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
      if (error instanceof StorageValidationError) {
        if (error.code === "FILE_TOO_LARGE" || error.code === "INVALID_LENGTH") {
          throw new RequestDomainError("FILE_TOO_LARGE");
        }
        if (error.code === "MIME_MISMATCH") throw new RequestDomainError("FILE_MIME_MISMATCH");
        throw new RequestDomainError("FILE_TYPE_NOT_ALLOWED");
      }
      throw error;
    }
    const requestedRequestId = input.requestId?.trim() || undefined;
    if (requestedRequestId !== undefined && !isUuid(requestedRequestId)) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    const attachmentId = randomUUID();
    let storageKey = "";
    const reservation = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const conversation = await this.lockConversation(tx, principal, conversationId);
      await this.assertCapacity(tx, conversation.id, validated.size, requestedRequestId);
      if (requestedRequestId !== undefined) {
        const requests = await tx<{ readonly id: string }[]>`
          SELECT id FROM service_requests
          WHERE id = ${requestedRequestId} AND student_user_id = ${conversation.student_user_id}
          LIMIT 1
        `;
        if (requests[0] === undefined) throw new RequestDomainError("REQUEST_NOT_FOUND");
      }
      storageKey = createConversationObjectKey(conversation.id, attachmentId);
      await tx`
        INSERT INTO unified_conversation_attachments (
          id, conversation_id, request_id, uploaded_by_user_id, storage_provider,
          storage_bucket, storage_key, original_filename, normalized_extension,
          declared_mime_type, size_bytes, storage_status, scan_status
        ) VALUES (
          ${attachmentId}, ${conversation.id}, ${requestedRequestId ?? null}, ${principal.userId},
          ${this.storage.provider}, ${this.storage.bucket ?? null}, ${storageKey},
          ${validated.originalFilename}, ${validated.normalizedExtension},
          ${validated.declaredMimeType}, ${validated.size}, 'PENDING_UPLOAD', 'NOT_REQUIRED'
        )
      `;
      return conversation;
    });
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
      this.logger?.error("unified_attachment_storage_put_failed", { attachmentId });
      if (error instanceof StorageValidationError && error.code === "INVALID_LENGTH") {
        throw new RequestDomainError("INVALID_REQUEST");
      }
      throw new RequestDomainError("STORAGE_UNAVAILABLE");
    }

    try {
      return await this.database.begin(async (transaction) => {
        const tx = transaction as DatabaseClient;
        const scanStatus = await resolveNewAttachmentScanStatus(tx, this.config);
        const skipped =
          scanStatus === "SCAN_SKIPPED_DEVELOPMENT" || scanStatus === "SCAN_SKIPPED_BY_ADMIN";
        const rows = await tx<AttachmentRow[]>`
          UPDATE unified_conversation_attachments
          SET detected_mime_type = ${validated.detectedMimeType},
              sha256 = ${stored.checksumSha256}, storage_status = 'STORED',
              scan_status = ${scanStatus}, scan_completed_at = ${skipped ? new Date() : null},
              scan_next_attempt_at = ${scanStatus === "PENDING_SCAN" ? new Date() : null},
              updated_at = now()
          WHERE id = ${attachmentId} AND conversation_id = ${reservation.id}
            AND storage_status = 'PENDING_UPLOAD'
          RETURNING id, conversation_id, request_id, uploaded_by_user_id, original_filename,
                    detected_mime_type, declared_mime_type, size_bytes, storage_status,
                    scan_status, storage_key, created_at
        `;
        const attachment = rows[0];
        if (attachment === undefined) throw new RequestDomainError("ATTACHMENT_STATE_INVALID");
        await tx`
          INSERT INTO outbox_events (
            event_type, aggregate_type, aggregate_id, idempotency_key, payload
          ) VALUES (
            'UNIFIED_ATTACHMENT_UPLOADED', 'UNIFIED_CONVERSATION_ATTACHMENT', ${attachmentId},
            ${`unified-attachment:${attachmentId}:uploaded`},
            ${tx.json({
              schemaVersion: 1,
              attachmentId,
              conversationId: reservation.id,
              studentUserId: reservation.student_user_id,
            })}
          ) ON CONFLICT (idempotency_key) DO NOTHING
        `;
        if (scanStatus === "PENDING_SCAN") {
          await tx`
            INSERT INTO outbox_events (
              event_type, aggregate_type, aggregate_id, idempotency_key, payload
            ) VALUES (
              'UNIFIED_ATTACHMENT_SCAN_REQUESTED', 'UNIFIED_CONVERSATION_ATTACHMENT',
              ${attachmentId}, ${`unified-attachment:${attachmentId}:scan:1`},
              ${tx.json({ schemaVersion: 1, attachmentId, conversationId: reservation.id })}
            ) ON CONFLICT (idempotency_key) DO NOTHING
          `;
        }
        await recordAuditEvent(tx, {
          ...context,
          eventType: "unified_conversation.attachment_uploaded",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: reservation.student_user_id,
          sessionId: principal.sessionId,
          resourceType: "support_conversation",
          resourceId: reservation.id,
          metadata: { attachmentId, requestLinked: requestedRequestId !== undefined, scanStatus },
        });
        return summary(attachment);
      });
    } catch (error: unknown) {
      await this.markUploadFailed(attachmentId);
      throw error;
    }
  }

  public async authorizeDownload(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    attachmentId: string,
    context: RequestAuditContext = {},
    policy: AttachmentAccessPolicy = {},
  ): Promise<AuthorizedAttachmentDownload> {
    this.requireReadPermission(principal);
    if (!isUuid(attachmentId)) throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    const adminAccess = hasPermission(principal, "admin.conversations.read");
    const rows = await this.database<AttachmentRow[]>`
      SELECT attachments.id, attachments.conversation_id, attachments.request_id,
             attachments.uploaded_by_user_id, attachments.original_filename,
             attachments.detected_mime_type, attachments.declared_mime_type,
             attachments.size_bytes, attachments.storage_status, attachments.scan_status,
             attachments.storage_key, attachments.created_at
      FROM unified_conversation_attachments AS attachments
      INNER JOIN support_conversations AS conversations
        ON conversations.id = attachments.conversation_id
      WHERE attachments.id = ${attachmentId}
        AND attachments.conversation_id = ${conversationId}
        AND (${adminAccess} OR conversations.student_user_id = ${principal.userId})
        AND attachments.deleted_at IS NULL
      LIMIT 1
    `;
    const attachment = rows[0];
    if (attachment === undefined) throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    return this.openAuthorizedAttachment(principal, attachment, context, policy);
  }

  public async getAttachment(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    attachmentId: string,
  ): Promise<UnifiedConversationAttachment> {
    this.requireReadPermission(principal);
    if (!isUuid(conversationId) || !isUuid(attachmentId)) {
      throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    }
    const adminAccess = hasPermission(principal, "admin.conversations.read");
    const rows = await this.database<AttachmentRow[]>`
      SELECT attachments.id, attachments.conversation_id, attachments.request_id,
             attachments.uploaded_by_user_id, attachments.original_filename,
             attachments.detected_mime_type, attachments.declared_mime_type,
             attachments.size_bytes, attachments.storage_status, attachments.scan_status,
             attachments.storage_key, attachments.created_at
      FROM unified_conversation_attachments AS attachments
      INNER JOIN support_conversations AS conversations
        ON conversations.id = attachments.conversation_id
      WHERE attachments.id = ${attachmentId}
        AND attachments.conversation_id = ${conversationId}
        AND (${adminAccess} OR conversations.student_user_id = ${principal.userId})
        AND attachments.deleted_at IS NULL
      LIMIT 1
    `;
    if (rows[0] === undefined) throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    return summary(rows[0]);
  }

  /** Canonical download path for both new conversation files and migrated request-chat files. */
  public async authorizeMessageAttachment(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    messageId: string,
    context: RequestAuditContext = {},
    policy: AttachmentAccessPolicy = {},
  ): Promise<AuthorizedAttachmentDownload> {
    this.requireReadPermission(principal);
    if (!isUuid(conversationId) || !isUuid(messageId)) {
      throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    }
    const adminAccess = hasPermission(principal, "admin.conversations.read");
    const rows = await this.database.unsafe<AttachmentRow[]>(
      `SELECT
         COALESCE(conversation_attachments.id, legacy_attachments.id) AS id,
         messages.conversation_id,
         messages.request_id,
         COALESCE(
           conversation_attachments.uploaded_by_user_id,
           legacy_attachments.uploaded_by_user_id
         ) AS uploaded_by_user_id,
         COALESCE(
           conversation_attachments.original_filename,
           legacy_attachments.original_filename
         ) AS original_filename,
         COALESCE(
           conversation_attachments.detected_mime_type,
           legacy_attachments.detected_mime_type
         ) AS detected_mime_type,
         COALESCE(
           conversation_attachments.declared_mime_type,
           legacy_attachments.declared_mime_type
         ) AS declared_mime_type,
         COALESCE(conversation_attachments.size_bytes, legacy_attachments.size_bytes)
           AS size_bytes,
         COALESCE(conversation_attachments.storage_status, legacy_attachments.storage_status)
           AS storage_status,
         COALESCE(conversation_attachments.scan_status, legacy_attachments.scan_status)
           AS scan_status,
         COALESCE(conversation_attachments.storage_key, legacy_attachments.storage_key)
           AS storage_key,
         COALESCE(conversation_attachments.created_at, legacy_attachments.created_at)
           AS created_at
       FROM support_messages AS messages
       INNER JOIN support_conversations AS conversations
         ON conversations.id = messages.conversation_id
       LEFT JOIN unified_conversation_attachments AS conversation_attachments
         ON conversation_attachments.id = messages.attachment_id
           AND conversation_attachments.deleted_at IS NULL
       LEFT JOIN service_request_attachments AS legacy_attachments
         ON legacy_attachments.id = messages.legacy_request_attachment_id
           AND legacy_attachments.deleted_at IS NULL
       WHERE messages.id = $1 AND messages.conversation_id = $2
         AND ($3::boolean OR conversations.student_user_id = $4)
         AND (conversation_attachments.id IS NOT NULL OR legacy_attachments.id IS NOT NULL)
       LIMIT 1`,
      [messageId, conversationId, adminAccess, principal.userId],
    );
    const attachment = rows[0];
    if (attachment === undefined) throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    return this.openAuthorizedAttachment(principal, attachment, context, policy);
  }

  private async openAuthorizedAttachment(
    principal: AuthenticatedPrincipal,
    attachment: AttachmentRow,
    context: RequestAuditContext,
    policy: AttachmentAccessPolicy,
  ): Promise<AuthorizedAttachmentDownload> {
    if (attachment.storage_status === "EXPIRED") {
      throw new RequestDomainError("ATTACHMENT_EXPIRED");
    }
    const mimeType = attachment.detected_mime_type ?? attachment.declared_mime_type;
    const skippedAllowed =
      policy.requireClean !== true ||
      (policy.allowUnscannedAudioPreview === true && allowedInlineAudio.has(mimeType)) ||
      (policy.allowUnscannedInlineMedia === true && allowedInlineMedia.has(mimeType));
    const downloadable =
      attachment.storage_status === "STORED" &&
      (attachment.scan_status === "CLEAN" ||
        (skippedAllowed &&
          (attachment.scan_status === "SCAN_SKIPPED_BY_ADMIN" ||
            (this.config.nodeEnv !== "production" &&
              attachment.scan_status === "SCAN_SKIPPED_DEVELOPMENT"))));
    if (!downloadable || attachment.storage_key === null) {
      await recordAuditEvent(this.database, {
        ...context,
        eventType: "unified_conversation.download_denied",
        outcome: "DENIED",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "support_conversation",
        resourceId: attachment.conversation_id,
        metadata: { attachmentId: attachment.id },
      });
      throw new RequestDomainError("ATTACHMENT_NOT_READY");
    }
    let body: Readable;
    try {
      body = await this.storage.open(attachment.storage_key);
    } catch {
      throw new RequestDomainError("STORAGE_UNAVAILABLE");
    }
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "unified_conversation.download_requested",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      sessionId: principal.sessionId,
      resourceType: "support_conversation",
      resourceId: attachment.conversation_id,
      metadata: { attachmentId: attachment.id, scanStatus: attachment.scan_status },
    });
    return {
      body,
      filename: attachment.original_filename,
      mimeType,
      contentLength: integer(attachment.size_bytes, "size"),
      scanStatus: attachment.scan_status as AuthorizedAttachmentDownload["scanStatus"],
    };
  }

  private requireSendPermission(principal: AuthenticatedPrincipal): void {
    if (hasPermission(principal, "admin.conversations.send")) {
      requireRole(principal, "ADMIN");
      return;
    }
    requirePermission(requireRole(principal, "STUDENT"), "conversations.send.own");
  }

  private requireReadPermission(principal: AuthenticatedPrincipal): void {
    if (hasPermission(principal, "admin.conversations.read")) {
      requireRole(principal, "ADMIN");
      return;
    }
    requirePermission(requireRole(principal, "STUDENT"), "conversations.read.own");
  }

  private async lockConversation(
    database: DatabaseClient,
    principal: AuthenticatedPrincipal,
    conversationId: string,
  ): Promise<ConversationAccessRow> {
    if (!isUuid(conversationId)) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    const adminAccess = hasPermission(principal, "admin.conversations.send");
    const rows = await database<ConversationAccessRow[]>`
      SELECT id, student_user_id FROM support_conversations
      WHERE id = ${conversationId} AND (${adminAccess} OR student_user_id = ${principal.userId})
      FOR UPDATE
    `;
    if (rows[0] === undefined) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    return rows[0];
  }

  private async assertCapacity(
    database: DatabaseClient,
    conversationId: string,
    contentLength: number,
    requestId?: string,
  ): Promise<void> {
    if (contentLength > this.config.storage.maxFileBytes) {
      throw new RequestDomainError("FILE_TOO_LARGE");
    }
    const rows =
      requestId === undefined
        ? await database<AggregateRow[]>`
            SELECT count(*)::text AS file_count,
                   COALESCE(sum(size_bytes), 0)::text AS total_bytes
            FROM unified_conversation_attachments
            WHERE conversation_id = ${conversationId}
              AND request_id IS NULL
              AND created_at >= now() - interval '24 hours'
              AND deleted_at IS NULL
              AND storage_status <> 'UPLOAD_FAILED'
          `
        : await database<AggregateRow[]>`
            SELECT count(*)::text AS file_count,
                   COALESCE(sum(size_bytes), 0)::text AS total_bytes
            FROM unified_conversation_attachments
            WHERE conversation_id = ${conversationId}
              AND request_id = ${requestId}
              AND deleted_at IS NULL
              AND storage_status <> 'UPLOAD_FAILED'
          `;
    const fileCount = integer(rows[0]?.file_count ?? "0", "file count");
    const totalBytes = integer(rows[0]?.total_bytes ?? "0", "total bytes");
    if (fileCount >= this.config.storage.maxFilesPerRequest) {
      throw new RequestDomainError("MAX_FILES_EXCEEDED");
    }
    if (totalBytes + contentLength > this.config.storage.maxTotalBytesPerRequest) {
      throw new RequestDomainError("TOTAL_FILE_SIZE_EXCEEDED");
    }
  }

  private async markUploadFailed(attachmentId: string): Promise<void> {
    await this.database`
      UPDATE unified_conversation_attachments
      SET storage_status = 'UPLOAD_FAILED', scan_status = 'NOT_REQUIRED', updated_at = now()
      WHERE id = ${attachmentId} AND storage_status = 'PENDING_UPLOAD'
    `.catch(() => undefined);
  }
}
