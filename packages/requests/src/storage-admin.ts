import {
  hasPermission,
  recordAuditEvent,
  requireAdmin,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import type { ObjectStorage } from "@itqanak/storage";

import { isUuid, normalizeBoundedPage } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import { recordOutboxLifecycleEvent } from "./outbox-record.js";
import type {
  RetentionSweepPreview,
  StorageAdminAttachment,
  StorageAdminFilter,
  StorageAdminReport,
} from "./types.js";

export interface StorageAdminServiceOptions {
  readonly database: DatabaseClient;
  readonly storage: ObjectStorage;
  readonly logger?: Logger;
}

interface StatsRow {
  readonly total_files: string;
  readonly total_bytes: string;
  readonly stored_files: string;
  readonly stored_bytes: string;
  readonly expired_files: string;
  readonly pending_deletion_files: string;
  readonly receipt_files: string;
  readonly filtered_total: string;
}

interface ListRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly student_user_id: string;
  readonly student_display_name: string;
  readonly uploader_display_name: string | null;
  readonly original_filename: string;
  readonly size_bytes: number | string;
  readonly detected_mime_type: string | null;
  readonly declared_mime_type: string;
  readonly storage_status: string;
  readonly created_at: Date | string;
  readonly last_downloaded_at: Date | string | null;
  readonly download_count: number | string;
  readonly delete_after: Date | string | null;
  readonly request_number: string | null;
  readonly is_receipt: boolean;
}

function toInt(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Storage admin row has an invalid ${field}.`);
  }
  return Math.trunc(parsed);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toItem(row: ListRow): StorageAdminAttachment {
  const lastDownloadedAt =
    row.last_downloaded_at === null ? undefined : toDate(row.last_downloaded_at);
  const deleteAfter = row.delete_after === null ? undefined : toDate(row.delete_after);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    studentUserId: row.student_user_id,
    studentDisplayName: row.student_display_name,
    uploaderDisplayName: row.uploader_display_name ?? row.student_display_name,
    originalFilename: row.original_filename,
    sizeBytes: toInt(row.size_bytes, "size"),
    mimeType: row.detected_mime_type ?? row.declared_mime_type,
    storageStatus: row.storage_status,
    createdAt: toDate(row.created_at),
    downloadCount: toInt(row.download_count, "download count"),
    isReceipt: row.is_receipt === true,
    ...(lastDownloadedAt === undefined ? {} : { lastDownloadedAt }),
    ...(deleteAfter === undefined ? {} : { deleteAfter }),
    ...(row.request_number === null ? {} : { requestNumber: row.request_number }),
  };
}

const EXTEND_MIN_DAYS = 1;
const EXTEND_MAX_DAYS = 3650;

export class StorageAdminService {
  private readonly database: DatabaseClient;
  private readonly storage: ObjectStorage;
  private readonly logger: Logger | undefined;

  public constructor(options: StorageAdminServiceOptions) {
    this.database = options.database;
    this.storage = options.storage;
    this.logger = options.logger;
  }

  public async listAttachments(
    principal: AuthenticatedPrincipal,
    filter: StorageAdminFilter = {},
  ): Promise<StorageAdminReport> {
    requirePermission(requireAdmin(principal), "admin.operations.read");
    const { page, pageSize, offset } = normalizeBoundedPage(filter.page, filter.pageSize, 100);
    const status =
      filter.status !== undefined &&
      ["STORED", "EXPIRED", "PENDING_DELETION"].includes(filter.status)
        ? filter.status
        : null;
    const studentUserId =
      filter.studentUserId !== undefined && isUuid(filter.studentUserId)
        ? filter.studentUserId
        : null;
    const search = filter.search?.trim().slice(0, 100);
    const pattern = search === undefined || search.length === 0 ? null : `%${search}%`;

    // status: PENDING_DELETION is a derived view over STORED rows with a set,
    // still-future delete_after; every other value maps straight to storage_status.
    const predicate = `
      attachments.storage_status <> 'PENDING_UPLOAD'
      AND attachments.storage_status <> 'UPLOAD_FAILED'
      AND ($1::uuid IS NULL OR conversations.student_user_id = $1::uuid)
      AND (
        $2::text IS NULL
        OR ($2 = 'PENDING_DELETION'
            AND attachments.storage_status = 'STORED'
            AND attachments.delete_after IS NOT NULL
            AND attachments.delete_after > now())
        OR ($2 <> 'PENDING_DELETION' AND attachments.storage_status = $2)
      )
      AND (
        $3::text IS NULL
        OR attachments.original_filename ILIKE $3
        OR students.display_name ILIKE $3
        OR requests.request_number ILIKE $3
      )
    `;
    const params = [studentUserId, status, pattern];

    const baseFrom = `
      FROM unified_conversation_attachments AS attachments
      INNER JOIN support_conversations AS conversations
        ON conversations.id = attachments.conversation_id
      INNER JOIN users AS students ON students.id = conversations.student_user_id
      LEFT JOIN users AS uploaders ON uploaders.id = attachments.uploaded_by_user_id
      LEFT JOIN service_requests AS requests ON requests.id = attachments.request_id
    `;

    const [statRows, listRows] = await Promise.all([
      this.database.unsafe<StatsRow[]>(
        `SELECT
           count(*)::text AS total_files,
           COALESCE(sum(attachments.size_bytes), 0)::text AS total_bytes,
           count(*) FILTER (WHERE attachments.storage_status = 'STORED')::text AS stored_files,
           COALESCE(sum(attachments.size_bytes)
             FILTER (WHERE attachments.storage_status = 'STORED'), 0)::text AS stored_bytes,
           count(*) FILTER (WHERE attachments.storage_status = 'EXPIRED')::text AS expired_files,
           count(*) FILTER (
             WHERE attachments.storage_status = 'STORED'
               AND attachments.delete_after IS NOT NULL
               AND attachments.delete_after > now()
           )::text AS pending_deletion_files,
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM finance_payment_submissions AS r WHERE r.attachment_id = attachments.id
             )
           )::text AS receipt_files,
           count(*) FILTER (WHERE ${predicate})::text AS filtered_total
         ${baseFrom}
         WHERE attachments.storage_status <> 'PENDING_UPLOAD'
           AND attachments.storage_status <> 'UPLOAD_FAILED'`,
        params,
      ),
      this.database.unsafe<ListRow[]>(
        `SELECT
           attachments.id, attachments.conversation_id,
           conversations.student_user_id, students.display_name AS student_display_name,
           uploaders.display_name AS uploader_display_name,
           attachments.original_filename, attachments.size_bytes,
           attachments.detected_mime_type, attachments.declared_mime_type,
           attachments.storage_status, attachments.created_at,
           attachments.last_downloaded_at, attachments.download_count, attachments.delete_after,
           requests.request_number,
           EXISTS (
             SELECT 1 FROM finance_payment_submissions AS r WHERE r.attachment_id = attachments.id
           ) AS is_receipt
         ${baseFrom}
         WHERE ${predicate}
         ORDER BY attachments.created_at DESC, attachments.id DESC
         LIMIT $4 OFFSET $5`,
        [...params, pageSize, offset],
      ),
    ]);

    const stat = statRows[0];
    const filteredTotal = toInt(stat?.filtered_total ?? "0", "filtered total");
    return {
      items: listRows.map(toItem),
      page,
      pageSize,
      total: filteredTotal,
      pageCount: Math.max(1, Math.ceil(filteredTotal / pageSize)),
      stats: {
        totalFiles: toInt(stat?.total_files ?? "0", "total files"),
        totalBytes: toInt(stat?.total_bytes ?? "0", "total bytes"),
        storedFiles: toInt(stat?.stored_files ?? "0", "stored files"),
        storedBytes: toInt(stat?.stored_bytes ?? "0", "stored bytes"),
        expiredFiles: toInt(stat?.expired_files ?? "0", "expired files"),
        pendingDeletionFiles: toInt(stat?.pending_deletion_files ?? "0", "pending deletion"),
        receiptFiles: toInt(stat?.receipt_files ?? "0", "receipt files"),
      },
    };
  }

  public async extendRetention(
    principal: AuthenticatedPrincipal,
    attachmentId: string,
    days: number,
    context: RequestAuditContext = {},
  ): Promise<void> {
    requirePermission(requireAdmin(principal), "admin.operations.manage");
    if (!isUuid(attachmentId)) throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    const boundedDays =
      Number.isSafeInteger(days) && days >= EXTEND_MIN_DAYS ? Math.min(days, EXTEND_MAX_DAYS) : 30;
    const rows = await this.database<{ readonly id: string }[]>`
      UPDATE unified_conversation_attachments
      SET delete_after = now() + (${boundedDays} * interval '1 day'), updated_at = now()
      WHERE id = ${attachmentId} AND storage_status = 'STORED'
      RETURNING id
    `;
    if (rows[0] === undefined) throw new RequestDomainError("ATTACHMENT_NOT_READY");
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "unified_conversation.attachment_retention_extended",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      sessionId: principal.sessionId,
      resourceType: "support_conversation_attachment",
      resourceId: attachmentId,
      metadata: { days: boundedDays },
    });
    await recordOutboxLifecycleEvent(this.database, {
      eventType: "FILE_RETENTION_EXTENDED",
      aggregateType: "SUPPORT_CONVERSATION_ATTACHMENT",
      aggregateId: attachmentId,
      idempotencyKey: `file-retention-extended:${attachmentId}:${Date.now()}`,
      payload: { attachmentId, days: boundedDays, actorUserId: principal.userId },
    });
  }

  public async purgeNow(
    principal: AuthenticatedPrincipal,
    attachmentId: string,
    context: RequestAuditContext = {},
  ): Promise<void> {
    requirePermission(requireAdmin(principal), "admin.operations.manage");
    if (!isUuid(attachmentId)) throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    const rows = await this.database<
      { readonly id: string; readonly storage_key: string | null }[]
    >`
      SELECT id, storage_key FROM unified_conversation_attachments
      WHERE id = ${attachmentId} AND storage_status = 'STORED'
      LIMIT 1
    `;
    const target = rows[0];
    if (target === undefined) throw new RequestDomainError("ATTACHMENT_NOT_READY");
    if (target.storage_key !== null) {
      try {
        await this.storage.remove(target.storage_key);
      } catch {
        // Object already gone / storage briefly unavailable: still flip the row.
      }
    }
    const updated = await this.database<{ readonly id: string }[]>`
      UPDATE unified_conversation_attachments
      SET storage_status = 'EXPIRED', updated_at = now()
      WHERE id = ${attachmentId} AND storage_status = 'STORED'
      RETURNING id
    `;
    if (updated[0] === undefined) throw new RequestDomainError("ATTACHMENT_STATE_INVALID");
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "unified_conversation.attachment_purged",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      sessionId: principal.sessionId,
      resourceType: "support_conversation_attachment",
      resourceId: attachmentId,
      metadata: {},
    });
    await recordOutboxLifecycleEvent(this.database, {
      eventType: "FILE_PURGED",
      aggregateType: "SUPPORT_CONVERSATION_ATTACHMENT",
      aggregateId: attachmentId,
      idempotencyKey: `file-purged:${attachmentId}`,
      payload: { attachmentId, reason: "admin_purge", actorUserId: principal.userId },
    });
    this.logger?.info("unified_attachment_admin_purged", { attachmentId });
  }

  public async previewSweep(principal: AuthenticatedPrincipal): Promise<RetentionSweepPreview> {
    requirePermission(requireAdmin(principal), "admin.operations.read");
    const settings = await this.database<
      {
        readonly message_archival_enabled: boolean;
        readonly message_retention_days: number | string;
        readonly attachment_undownloaded_retention_days: number | string;
      }[]
    >`
      SELECT message_archival_enabled, message_retention_days,
             attachment_undownloaded_retention_days
      FROM platform_retention_settings WHERE singleton_key = 'platform' LIMIT 1
    `;
    const row = settings[0];
    const messageDays = toInt(row?.message_retention_days ?? 30, "message retention days");
    const undownloadedDays = toInt(
      row?.attachment_undownloaded_retention_days ?? 30,
      "attachment retention days",
    );

    const [msgCount, attCount, sample] = await Promise.all([
      this.database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count FROM support_messages
        WHERE archived_at IS NULL AND sent_at < now() - (${messageDays} * interval '1 day')
      `,
      this.database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count
        FROM unified_conversation_attachments AS a
        WHERE a.storage_status = 'STORED' AND a.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM finance_payment_submissions AS r WHERE r.attachment_id = a.id
          )
          AND (
            (a.download_count = 0 AND a.delete_after IS NULL
              AND a.created_at < now() - (${undownloadedDays} * interval '1 day'))
            OR (a.delete_after IS NOT NULL AND a.delete_after < now())
          )
      `,
      this.database<{ readonly original_filename: string }[]>`
        SELECT a.original_filename
        FROM unified_conversation_attachments AS a
        WHERE a.storage_status = 'STORED' AND a.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM finance_payment_submissions AS r WHERE r.attachment_id = a.id
          )
          AND (
            (a.download_count = 0 AND a.delete_after IS NULL
              AND a.created_at < now() - (${undownloadedDays} * interval '1 day'))
            OR (a.delete_after IS NOT NULL AND a.delete_after < now())
          )
        ORDER BY a.created_at ASC
        LIMIT 8
      `,
    ]);

    return {
      messageArchivalEnabled: row?.message_archival_enabled === true,
      messageRetentionDays: messageDays,
      attachmentUndownloadedRetentionDays: undownloadedDays,
      messagesEligible: toInt(msgCount[0]?.count ?? "0", "eligible messages"),
      attachmentsEligible: toInt(attCount[0]?.count ?? "0", "eligible attachments"),
      attachmentSampleFilenames: sample.map((entry) => entry.original_filename),
    };
  }

  /** Read-only helper for the backup-download route: the conversation the file belongs to. */
  public async resolveConversationId(
    principal: AuthenticatedPrincipal,
    attachmentId: string,
  ): Promise<string> {
    requirePermission(requireAdmin(principal), "admin.operations.read");
    if (!hasPermission(principal, "admin.conversations.read")) {
      throw new RequestDomainError("REQUEST_FORBIDDEN");
    }
    if (!isUuid(attachmentId)) throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    const rows = await this.database<{ readonly conversation_id: string }[]>`
      SELECT conversation_id FROM unified_conversation_attachments WHERE id = ${attachmentId} LIMIT 1
    `;
    if (rows[0] === undefined) throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
    return rows[0].conversation_id;
  }
}
