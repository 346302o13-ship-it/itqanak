import { randomUUID } from "node:crypto";

import {
  hasPermission,
  recordAuditEvent,
  requirePermission,
  requireRole,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { JsonObject, JsonValue, RequestStatus } from "@itqanak/core";
import { isRequestStatus } from "@itqanak/core";
import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

import { isUuid, normalizeBoundedPage } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import type {
  AttachmentScanStatus,
  ChatContentType,
  ChatSenderType,
  MarkConversationResult,
  MessageReceiptStatus,
  SendUnifiedMessageInput,
  SendUnifiedMessageResult,
  ServiceQuote,
  ServiceQuoteCurrency,
  ServiceQuoteStatus,
  UnifiedConversationDetail,
  UnifiedConversationListInput,
  UnifiedConversationListResult,
  UnifiedConversationSummary,
  UnifiedMessage,
  UnifiedMessageListInput,
  UnifiedMessageListResult,
  UnifiedRequestSummary,
} from "./types.js";
import { normalizeUnifiedMessageInput } from "./unified-validation.js";

interface ConversationRow {
  readonly id: string;
  readonly student_user_id: string;
  readonly student_display_name: string;
  readonly student_phone_e164: string | null;
  readonly student_email: string | null;
  readonly created_at: Date | string;
}

interface ConversationListRow extends ConversationRow {
  readonly last_message_preview: string | null;
  readonly last_message_at: Date | string | null;
  readonly unread_count: number | string;
  readonly request_count: number | string;
  readonly active_request_count: number | string;
  readonly latest_request_id: string | null;
  readonly latest_request_number: string | null;
  readonly latest_request_title: string | null;
  readonly latest_request_status: string | null;
  readonly latest_request_version: number | string | null;
  readonly latest_request_updated_at: Date | string | null;
}

interface RequestSummaryRow {
  readonly id: string;
  readonly request_number: string;
  readonly title: string;
  readonly status: string;
  readonly version: number | string;
  readonly updated_at: Date | string;
}

interface MessageRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly sender_type: string;
  readonly sender_user_id: string | null;
  readonly sender_display_name: string | null;
  readonly content_type: string;
  readonly body: string;
  readonly client_message_id: string | null;
  readonly client_payload_fingerprint: string | null;
  readonly metadata: unknown;
  readonly message_status: string;
  readonly sent_at: Date | string;
  readonly reply_to_message_id: string | null;
  readonly reply_body: string | null;
  readonly reply_sender_type: string | null;
  readonly reply_content_type: string | null;
  readonly request_id: string | null;
  readonly request_number: string | null;
  readonly request_title: string | null;
  readonly request_status: string | null;
  readonly request_version: number | string | null;
  readonly request_updated_at: Date | string | null;
  readonly attachment_id: string | null;
  readonly attachment_source: string | null;
  readonly attachment_filename: string | null;
  readonly attachment_mime_type: string | null;
  readonly attachment_size_bytes: number | string | null;
  readonly attachment_scan_status: string | null;
  readonly quote_id: string | null;
  readonly quote_conversation_id: string | null;
  readonly quote_request_id: string | null;
  readonly quote_student_user_id: string | null;
  readonly quote_amount_minor: number | string | null;
  readonly quote_currency: string | null;
  readonly quote_minor_unit: number | string | null;
  readonly quote_description_ar: string | null;
  readonly quote_description_en: string | null;
  readonly quote_expires_at: Date | string | null;
  readonly quote_status: string | null;
  readonly quote_version: number | string | null;
  readonly quote_created_by_user_id: string | null;
  readonly quote_responded_at: Date | string | null;
  readonly quote_created_at: Date | string | null;
  readonly quote_updated_at: Date | string | null;
}

interface UnifiedAttachmentAccessRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly request_id: string | null;
  readonly uploaded_by_user_id: string;
  readonly original_filename: string;
  readonly detected_mime_type: string | null;
  readonly declared_mime_type: string;
  readonly storage_status: string;
  readonly scan_status: string;
}

interface CountRow {
  readonly count: number | string;
}

export interface UnifiedConversationServiceOptions {
  readonly database: DatabaseClient;
  readonly logger?: Logger;
  readonly config?: Pick<AppConfig, "nodeEnv">;
}

type ConversationAccessMode = "ADMIN" | "STUDENT";

const conversationSelect = `
  conversations.id, conversations.student_user_id,
  students.display_name AS student_display_name,
  students.phone_e164 AS student_phone_e164,
  students.email AS student_email,
  conversations.created_at
`;

const messageSelect = `
  messages.id, messages.conversation_id, messages.sender_type, messages.sender_user_id,
  senders.display_name AS sender_display_name, messages.content_type, messages.body,
  messages.client_message_id, messages.client_payload_fingerprint, messages.metadata,
  messages.sent_at, messages.reply_to_message_id,
  reply_target.body AS reply_body, reply_target.sender_type AS reply_sender_type,
  reply_target.content_type AS reply_content_type,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM support_message_receipts AS receipts
      WHERE receipts.message_id = messages.id AND receipts.status = 'READ'
    ) THEN 'READ'
    WHEN EXISTS (
      SELECT 1 FROM support_message_receipts AS receipts
      WHERE receipts.message_id = messages.id AND receipts.status = 'DELIVERED'
    ) THEN 'DELIVERED'
    ELSE 'SENT'
  END AS message_status,
  requests.id AS request_id, requests.request_number, requests.title AS request_title,
  requests.status AS request_status, requests.version AS request_version,
  requests.updated_at AS request_updated_at,
  COALESCE(conversation_attachments.id, legacy_attachments.id) AS attachment_id,
  CASE
    WHEN conversation_attachments.id IS NOT NULL THEN 'CONVERSATION'
    WHEN legacy_attachments.id IS NOT NULL THEN 'REQUEST_LEGACY'
    ELSE NULL
  END AS attachment_source,
  COALESCE(conversation_attachments.original_filename, legacy_attachments.original_filename)
    AS attachment_filename,
  COALESCE(
    conversation_attachments.detected_mime_type,
    conversation_attachments.declared_mime_type,
    legacy_attachments.detected_mime_type,
    legacy_attachments.declared_mime_type
  ) AS attachment_mime_type,
  COALESCE(conversation_attachments.size_bytes, legacy_attachments.size_bytes)
    AS attachment_size_bytes,
  COALESCE(conversation_attachments.scan_status, legacy_attachments.scan_status)
    AS attachment_scan_status,
  quotes.id AS quote_id, quotes.conversation_id AS quote_conversation_id,
  quotes.request_id AS quote_request_id, quotes.student_user_id AS quote_student_user_id,
  quotes.amount_minor AS quote_amount_minor, quotes.currency AS quote_currency,
  quotes.minor_unit AS quote_minor_unit, quotes.description_ar AS quote_description_ar,
  quotes.description_en AS quote_description_en, quotes.expires_at AS quote_expires_at,
  quotes.status AS quote_status, quotes.version AS quote_version,
  quotes.created_by_user_id AS quote_created_by_user_id,
  quotes.responded_at AS quote_responded_at, quotes.created_at AS quote_created_at,
  quotes.updated_at AS quote_updated_at
`;

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Unified conversation has an invalid date.");
  return parsed;
}

function optionalDate(value: Date | string | null): Date | undefined {
  return value === null ? undefined : toDate(value);
}

function toSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Unified conversation has an invalid ${field}.`);
  }
  return parsed;
}

function toRequestStatus(value: string): RequestStatus {
  if (!isRequestStatus(value))
    throw new Error("Unified conversation has an invalid request status.");
  return value;
}

function toContentType(value: string): ChatContentType {
  if (
    !(["TEXT", "IMAGE", "AUDIO", "FILE", "SYSTEM", "ACTION"] as const).includes(
      value as ChatContentType,
    )
  ) {
    throw new Error("Unified conversation has an invalid content type.");
  }
  return value as ChatContentType;
}

function toSenderType(value: string): ChatSenderType {
  if (value !== "STUDENT" && value !== "ADMIN" && value !== "SYSTEM") {
    throw new Error("Unified conversation has an invalid sender type.");
  }
  return value;
}

function toReceiptStatus(value: string): MessageReceiptStatus {
  if (value !== "SENT" && value !== "DELIVERED" && value !== "READ") {
    throw new Error("Unified conversation has an invalid receipt status.");
  }
  return value;
}

function toScanStatus(value: string): AttachmentScanStatus | "SCAN_SKIPPED_BY_ADMIN" {
  if (
    !(
      [
        "NOT_REQUIRED",
        "PENDING_SCAN",
        "CLEAN",
        "INFECTED",
        "SCAN_ERROR",
        "SCAN_SKIPPED_DEVELOPMENT",
        "SCAN_SKIPPED_BY_ADMIN",
        "REJECTED",
      ] as const
    ).includes(value as AttachmentScanStatus | "SCAN_SKIPPED_BY_ADMIN")
  ) {
    throw new Error("Unified conversation has an invalid attachment scan status.");
  }
  return value as AttachmentScanStatus | "SCAN_SKIPPED_BY_ADMIN";
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function toJsonObject(value: unknown): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== "object" || !isJsonValue(value)) {
    throw new Error("Unified conversation has invalid message metadata.");
  }
  return value as JsonObject;
}

function toRequest(row: RequestSummaryRow): UnifiedRequestSummary {
  return {
    id: row.id,
    requestNumber: row.request_number,
    title: row.title,
    status: toRequestStatus(row.status),
    version: toSafeInteger(row.version, "request version"),
    updatedAt: toDate(row.updated_at),
  };
}

function latestRequest(row: ConversationListRow): UnifiedRequestSummary | undefined {
  if (
    row.latest_request_id === null ||
    row.latest_request_number === null ||
    row.latest_request_title === null ||
    row.latest_request_status === null ||
    row.latest_request_version === null ||
    row.latest_request_updated_at === null
  ) {
    return undefined;
  }
  return toRequest({
    id: row.latest_request_id,
    request_number: row.latest_request_number,
    title: row.latest_request_title,
    status: row.latest_request_status,
    version: row.latest_request_version,
    updated_at: row.latest_request_updated_at,
  });
}

function toConversation(row: ConversationListRow): UnifiedConversationSummary {
  const latest = latestRequest(row);
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    studentDisplayName: row.student_display_name,
    ...(row.student_phone_e164 === null ? {} : { studentPhoneE164: row.student_phone_e164 }),
    ...(row.student_email === null ? {} : { studentEmail: row.student_email }),
    ...(row.last_message_preview === null ? {} : { lastMessagePreview: row.last_message_preview }),
    ...(row.last_message_at === null ? {} : { lastMessageAt: toDate(row.last_message_at) }),
    unreadCount: toSafeInteger(row.unread_count, "unread count"),
    requestCount: toSafeInteger(row.request_count, "request count"),
    activeRequestCount: toSafeInteger(row.active_request_count, "active request count"),
    ...(latest === undefined ? {} : { latestRequest: latest }),
    createdAt: toDate(row.created_at),
  };
}

function toQuote(row: MessageRow): ServiceQuote | undefined {
  if (
    row.quote_id === null ||
    row.quote_conversation_id === null ||
    row.quote_request_id === null ||
    row.quote_student_user_id === null ||
    row.quote_amount_minor === null ||
    row.quote_currency === null ||
    row.quote_minor_unit === null ||
    row.quote_description_ar === null ||
    row.quote_description_en === null ||
    row.quote_expires_at === null ||
    row.quote_status === null ||
    row.quote_version === null ||
    row.quote_created_by_user_id === null ||
    row.quote_created_at === null ||
    row.quote_updated_at === null
  ) {
    return undefined;
  }
  const currency = row.quote_currency;
  if (currency !== "SAR" && currency !== "AED" && currency !== "KWD") {
    throw new Error("Unified conversation has an invalid quote currency.");
  }
  const status = row.quote_status;
  if (
    status !== "PENDING" &&
    status !== "ACCEPTED" &&
    status !== "REJECTED" &&
    status !== "EXPIRED" &&
    status !== "WITHDRAWN"
  ) {
    throw new Error("Unified conversation has an invalid quote status.");
  }
  const minorUnit = toSafeInteger(row.quote_minor_unit, "quote minor unit");
  if (minorUnit !== 2 && minorUnit !== 3) {
    throw new Error("Unified conversation has an invalid quote minor unit.");
  }
  const respondedAt = optionalDate(row.quote_responded_at);
  return {
    id: row.quote_id,
    conversationId: row.quote_conversation_id,
    requestId: row.quote_request_id,
    studentUserId: row.quote_student_user_id,
    amountMinor: toSafeInteger(row.quote_amount_minor, "quote amount"),
    currency: currency as ServiceQuoteCurrency,
    minorUnit,
    descriptionAr: row.quote_description_ar,
    descriptionEn: row.quote_description_en,
    expiresAt: toDate(row.quote_expires_at),
    status: status as ServiceQuoteStatus,
    version: toSafeInteger(row.quote_version, "quote version"),
    createdByUserId: row.quote_created_by_user_id,
    ...(respondedAt === undefined ? {} : { respondedAt }),
    createdAt: toDate(row.quote_created_at),
    updatedAt: toDate(row.quote_updated_at),
  };
}

function toMessage(row: MessageRow): UnifiedMessage {
  let request: UnifiedRequestSummary | undefined;
  if (
    row.request_id !== null &&
    row.request_number !== null &&
    row.request_title !== null &&
    row.request_status !== null &&
    row.request_version !== null &&
    row.request_updated_at !== null
  ) {
    request = toRequest({
      id: row.request_id,
      request_number: row.request_number,
      title: row.request_title,
      status: row.request_status,
      version: row.request_version,
      updated_at: row.request_updated_at,
    });
  }
  const quote = toQuote(row);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: toSenderType(row.sender_type),
    ...(row.sender_user_id === null ? {} : { senderUserId: row.sender_user_id }),
    ...(row.sender_display_name === null ? {} : { senderDisplayName: row.sender_display_name }),
    contentType: toContentType(row.content_type),
    body: row.body,
    ...(request === undefined ? {} : { request }),
    ...(row.attachment_id === null ||
    row.attachment_source === null ||
    row.attachment_filename === null ||
    row.attachment_mime_type === null ||
    row.attachment_size_bytes === null ||
    row.attachment_scan_status === null
      ? {}
      : {
          attachment: {
            id: row.attachment_id,
            source: row.attachment_source === "CONVERSATION" ? "CONVERSATION" : "REQUEST_LEGACY",
            originalFilename: row.attachment_filename,
            mimeType: row.attachment_mime_type,
            sizeBytes: toSafeInteger(row.attachment_size_bytes, "attachment size"),
            scanStatus: toScanStatus(row.attachment_scan_status),
          },
        }),
    ...(quote === undefined ? {} : { quote }),
    ...(row.reply_to_message_id === null ||
    row.reply_body === null ||
    row.reply_sender_type === null ||
    row.reply_content_type === null
      ? {}
      : {
          replyTo: {
            id: row.reply_to_message_id,
            body: row.reply_body,
            senderType: toSenderType(row.reply_sender_type),
            contentType: toContentType(row.reply_content_type),
          },
        }),
    ...(row.client_message_id === null ? {} : { clientMessageId: row.client_message_id }),
    metadata: toJsonObject(row.metadata),
    status: toReceiptStatus(row.message_status),
    sentAt: toDate(row.sent_at),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

export class UnifiedConversationService {
  private readonly database: DatabaseClient;
  private readonly logger: Logger | undefined;
  private readonly nodeEnv: AppConfig["nodeEnv"];

  public constructor(options: UnifiedConversationServiceOptions) {
    this.database = options.database;
    this.logger = options.logger;
    this.nodeEnv = options.config?.nodeEnv ?? "production";
  }

  public async getOrCreateOwnConversation(
    principal: AuthenticatedPrincipal,
    context: RequestAuditContext = {},
  ): Promise<UnifiedConversationDetail> {
    requirePermission(requireRole(principal, "STUDENT"), "conversations.read.own");
    const conversationId = await this.ensureConversation(principal.userId, principal.userId);
    return this.getConversation(principal, conversationId, context);
  }

  public async openConversationForStudent(
    principal: AuthenticatedPrincipal,
    studentUserId: string,
    context: RequestAuditContext = {},
  ): Promise<UnifiedConversationDetail> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.conversations.read");
    if (!isUuid(studentUserId)) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    const conversationId = await this.ensureConversation(studentUserId, principal.userId);
    return this.getConversation(principal, conversationId, context);
  }

  public async getConversation(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    context: RequestAuditContext = {},
  ): Promise<UnifiedConversationDetail> {
    const access = await this.resolveConversation(this.database, principal, conversationId, "read");
    const [summaryRows, requestRows] = await Promise.all([
      this.readConversationRows(this.database, principal.userId, access.row.id),
      this.database<RequestSummaryRow[]>`
        SELECT id, request_number, title, status, version, updated_at
        FROM service_requests
        WHERE student_user_id = ${access.row.student_user_id}
        ORDER BY updated_at DESC, id DESC
      `,
    ]);
    const summary = summaryRows[0];
    if (summary === undefined) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "unified_conversation.viewed",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      targetUserId: access.row.student_user_id,
      sessionId: principal.sessionId,
      resourceType: "support_conversation",
      resourceId: access.row.id,
      metadata: { mode: access.mode },
    });
    return { ...toConversation(summary), requests: requestRows.map(toRequest) };
  }

  public async listConversations(
    principal: AuthenticatedPrincipal,
    input: UnifiedConversationListInput = {},
    context: RequestAuditContext = {},
    options: Readonly<{ recordAudit?: boolean }> = {},
  ): Promise<UnifiedConversationListResult> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.conversations.read");
    const { page, pageSize, offset } = normalizeBoundedPage(input.page, input.pageSize, 100);
    const search = input.search?.trim().slice(0, 100);
    const pattern = search === undefined || search.length === 0 ? null : `%${escapeLike(search)}%`;
    const [counts, rows] = await Promise.all([
      this.database.unsafe<CountRow[]>(
        `SELECT count(*)::text AS count
         FROM support_conversations AS conversations
         INNER JOIN users AS students ON students.id = conversations.student_user_id
         WHERE $1::text IS NULL
            OR students.display_name ILIKE $1 ESCAPE E'\\\\'
            OR students.phone_e164 ILIKE $1 ESCAPE E'\\\\'
            OR students.email ILIKE $1 ESCAPE E'\\\\'`,
        [pattern],
      ),
      this.database.unsafe<ConversationListRow[]>(
        `${this.conversationListQuery()}
         WHERE $1::text IS NULL
            OR students.display_name ILIKE $1 ESCAPE E'\\\\'
            OR students.phone_e164 ILIKE $1 ESCAPE E'\\\\'
            OR students.email ILIKE $1 ESCAPE E'\\\\'
         ORDER BY conversations.last_message_at DESC NULLS LAST,
                  conversations.created_at DESC, conversations.id DESC
         LIMIT $3 OFFSET $4`,
        [pattern, principal.userId, pageSize, offset],
      ),
    ]);
    const total = toSafeInteger(counts[0]?.count ?? "0", "conversation count");
    const result = {
      items: rows.map(toConversation),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    if (options.recordAudit !== false) {
      await recordAuditEvent(this.database, {
        ...context,
        eventType: "unified_conversations.listed",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        metadata: { resultCount: result.items.length },
      });
    }
    return result;
  }

  /**
   * Poll-tuned sibling of listConversations: no COUNT(*), no audit row, and an
   * optional `updatedAfter` cursor so a steady-state refresh returns only the
   * conversations that changed since the client's last poll (usually none).
   */
  public async listConversationUpdates(
    principal: AuthenticatedPrincipal,
    input: Readonly<{ search?: string; updatedAfter?: Date; limit?: number }> = {},
  ): Promise<{ readonly items: readonly UnifiedConversationSummary[] }> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.conversations.read");
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 30)));
    const search = input.search?.trim().slice(0, 100);
    const pattern = search === undefined || search.length === 0 ? null : `%${escapeLike(search)}%`;
    const since =
      input.updatedAfter instanceof Date && !Number.isNaN(input.updatedAfter.getTime())
        ? input.updatedAfter
        : null;
    const rows = await this.database.unsafe<ConversationListRow[]>(
      `${this.conversationListQuery()}
       WHERE ($1::text IS NULL
            OR students.display_name ILIKE $1 ESCAPE E'\\\\'
            OR students.phone_e164 ILIKE $1 ESCAPE E'\\\\'
            OR students.email ILIKE $1 ESCAPE E'\\\\')
         AND ($4::timestamptz IS NULL OR conversations.last_message_at > $4)
       ORDER BY conversations.last_message_at DESC NULLS LAST,
                conversations.created_at DESC, conversations.id DESC
       LIMIT $3`,
      [pattern, principal.userId, limit, since],
    );
    return { items: rows.map(toConversation) };
  }

  public async listMessages(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    input: UnifiedMessageListInput = {},
  ): Promise<UnifiedMessageListResult> {
    const access = await this.resolveConversation(this.database, principal, conversationId, "read");

    if (input.afterId !== undefined && isUuid(input.afterId)) {
      // Incremental delta: the caller already holds everything up to and
      // including `afterId`. No COUNT(*), no OFFSET -- a quiet conversation
      // costs one index probe and returns zero rows.
      const anchor = await this.database<{ readonly sent_at: Date; readonly id: string }[]>`
        SELECT sent_at, id FROM support_messages
        WHERE id = ${input.afterId} AND conversation_id = ${access.row.id}
      `;
      if (anchor[0] !== undefined) {
        const deltaLimit = 200;
        const deltaRows = await this.database.unsafe<MessageRow[]>(
          `SELECT ${messageSelect}
           FROM support_messages AS messages
           LEFT JOIN users AS senders ON senders.id = messages.sender_user_id
           LEFT JOIN service_requests AS requests ON requests.id = messages.request_id
           LEFT JOIN unified_conversation_attachments AS conversation_attachments
             ON conversation_attachments.id = messages.attachment_id
           LEFT JOIN service_request_attachments AS legacy_attachments
             ON legacy_attachments.id = messages.legacy_request_attachment_id
           LEFT JOIN service_quotes AS quotes ON quotes.id = messages.quote_id
           LEFT JOIN support_messages AS reply_target ON reply_target.id = messages.reply_to_message_id
           WHERE messages.conversation_id = $1
             AND (messages.sent_at, messages.id) > ($2, $3)
           ORDER BY messages.sent_at ASC, messages.id ASC
           LIMIT $4`,
          [access.row.id, anchor[0].sent_at, anchor[0].id, deltaLimit],
        );
        return {
          items: deltaRows.map(toMessage),
          page: 1,
          pageSize: deltaLimit,
          incremental: true,
        };
      }
      // The anchor no longer resolves (conversation switch, pruned client
      // state): fall through to a normal recent-page read so the client heals.
    }

    const { page, pageSize, offset } = normalizeBoundedPage(input.page, input.pageSize, 100);
    const [counts, rows] = await Promise.all([
      this.database<CountRow[]>`
        SELECT count(*)::text AS count FROM support_messages
        WHERE conversation_id = ${access.row.id}
      `,
      this.database.unsafe<MessageRow[]>(
        `SELECT ${messageSelect}
         FROM support_messages AS messages
         LEFT JOIN users AS senders ON senders.id = messages.sender_user_id
         LEFT JOIN service_requests AS requests ON requests.id = messages.request_id
         LEFT JOIN unified_conversation_attachments AS conversation_attachments
           ON conversation_attachments.id = messages.attachment_id
         LEFT JOIN service_request_attachments AS legacy_attachments
           ON legacy_attachments.id = messages.legacy_request_attachment_id
         LEFT JOIN service_quotes AS quotes ON quotes.id = messages.quote_id
           LEFT JOIN support_messages AS reply_target ON reply_target.id = messages.reply_to_message_id
         WHERE messages.conversation_id = $1
         ORDER BY messages.sent_at DESC, messages.id DESC
         LIMIT $2 OFFSET $3`,
        [access.row.id, pageSize, offset],
      ),
    ]);
    const total = toSafeInteger(counts[0]?.count ?? "0", "message count");
    return {
      items: rows.map(toMessage).reverse(),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      incremental: false,
    };
  }

  public async sendMessage(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    input: SendUnifiedMessageInput,
    context: RequestAuditContext = {},
  ): Promise<SendUnifiedMessageResult> {
    const normalized = normalizeUnifiedMessageInput(input, randomUUID());
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const access = await this.resolveConversation(tx, principal, conversationId, "send");
      let requestId = normalized.requestId;
      let messageBody = normalized.body;
      if (normalized.attachmentId !== undefined) {
        const attachments = await tx<UnifiedAttachmentAccessRow[]>`
          SELECT id, conversation_id, request_id, uploaded_by_user_id, original_filename,
                 detected_mime_type, declared_mime_type, storage_status, scan_status
          FROM unified_conversation_attachments
          WHERE id = ${normalized.attachmentId}
            AND conversation_id = ${access.row.id}
            AND deleted_at IS NULL
          FOR SHARE
        `;
        const attachment = attachments[0];
        if (
          attachment === undefined ||
          attachment.storage_status !== "STORED" ||
          (attachment.scan_status !== "CLEAN" &&
            attachment.scan_status !== "SCAN_SKIPPED_BY_ADMIN" &&
            !(
              this.nodeEnv !== "production" && attachment.scan_status === "SCAN_SKIPPED_DEVELOPMENT"
            )) ||
          (access.mode === "STUDENT" && attachment.uploaded_by_user_id !== principal.userId)
        ) {
          throw new RequestDomainError("INVALID_MESSAGE_ATTACHMENT");
        }
        if (requestId !== undefined && attachment.request_id !== requestId) {
          throw new RequestDomainError("INVALID_MESSAGE_ATTACHMENT");
        }
        requestId = attachment.request_id ?? undefined;
        const mimeType = attachment.detected_mime_type ?? attachment.declared_mime_type;
        if (
          (normalized.contentType === "IMAGE" && !mimeType.startsWith("image/")) ||
          (normalized.contentType === "AUDIO" && !mimeType.startsWith("audio/"))
        ) {
          throw new RequestDomainError("INVALID_MESSAGE_ATTACHMENT");
        }
        messageBody ??= attachment.original_filename;
      }
      if (requestId !== undefined) {
        const requests = await tx<{ readonly id: string }[]>`
          SELECT id FROM service_requests
          WHERE id = ${requestId} AND student_user_id = ${access.row.student_user_id}
          LIMIT 1
        `;
        if (requests[0] === undefined) throw new RequestDomainError("REQUEST_NOT_FOUND");
      }
      if (messageBody === undefined) throw new RequestDomainError("INVALID_MESSAGE");

      if (normalized.replyToMessageId !== undefined) {
        const target = await tx<{ readonly id: string }[]>`
          SELECT id FROM support_messages
          WHERE id = ${normalized.replyToMessageId} AND conversation_id = ${access.row.id}
          LIMIT 1
        `;
        if (target[0] === undefined) throw new RequestDomainError("INVALID_MESSAGE");
      }

      const inserted = await tx<{ readonly id: string }[]>`
        INSERT INTO support_messages (
          conversation_id, sender_type, sender_user_id, content_type, body,
          attachment_id, client_message_id, client_payload_fingerprint, request_id,
          reply_to_message_id
        ) VALUES (
          ${access.row.id}, ${access.mode}, ${principal.userId}, ${normalized.contentType},
          ${messageBody}, ${normalized.attachmentId ?? null}, ${normalized.clientMessageId},
          ${normalized.fingerprint}, ${requestId ?? null}, ${normalized.replyToMessageId ?? null}
        )
        ON CONFLICT (conversation_id, sender_user_id, client_message_id)
          WHERE sender_user_id IS NOT NULL AND client_message_id IS NOT NULL
        DO NOTHING
        RETURNING id
      `;
      let messageId = inserted[0]?.id;
      const idempotentReplay = messageId === undefined;
      if (messageId === undefined) {
        const replay = await tx<
          { readonly id: string; readonly client_payload_fingerprint: string | null }[]
        >`
          SELECT id, client_payload_fingerprint FROM support_messages
          WHERE conversation_id = ${access.row.id}
            AND sender_user_id = ${principal.userId}
            AND client_message_id = ${normalized.clientMessageId}
          LIMIT 1
        `;
        if (
          replay[0] === undefined ||
          replay[0].client_payload_fingerprint !== normalized.fingerprint
        ) {
          throw new RequestDomainError("IDEMPOTENCY_KEY_REUSED");
        }
        messageId = replay[0].id;
      } else {
        const recipients = await this.recipientIds(tx, access.mode, access.row.student_user_id);
        for (const recipientUserId of recipients) {
          await tx`
            INSERT INTO support_message_receipts (message_id, recipient_user_id, status)
            VALUES (${messageId}, ${recipientUserId}, 'SENT')
            ON CONFLICT (message_id, recipient_user_id) DO NOTHING
          `;
        }
        await tx`
          INSERT INTO outbox_events (
            event_type, aggregate_type, aggregate_id, idempotency_key, payload
          ) VALUES (
            'UNIFIED_MESSAGE_CREATED', 'SUPPORT_MESSAGE', ${messageId},
            ${`unified-message:${messageId}`},
            ${tx.json({
              schemaVersion: 1,
              messageId,
              conversationId: access.row.id,
              studentUserId: access.row.student_user_id,
            })}
          )
          ON CONFLICT (idempotency_key) DO NOTHING
        `;
        await recordAuditEvent(tx, {
          ...context,
          eventType: "unified_conversation.message_sent",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: access.row.student_user_id,
          sessionId: principal.sessionId,
          resourceType: "support_message",
          resourceId: messageId,
          metadata: {
            senderType: access.mode,
            contentType: normalized.contentType,
            requestLinked: requestId !== undefined,
          },
        });
      }
      return { message: await this.readMessage(tx, messageId), idempotentReplay };
    });
    if (!result.idempotentReplay) {
      this.logger?.info("unified_conversation_message_sent", {
        conversationId: result.message.conversationId,
        messageId: result.message.id,
      });
    }
    return result;
  }

  public async markDelivered(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    context: RequestAuditContext = {},
  ): Promise<MarkConversationResult> {
    return this.markConversation(principal, conversationId, "DELIVERED", context);
  }

  public async markRead(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    context: RequestAuditContext = {},
  ): Promise<MarkConversationResult> {
    return this.markConversation(principal, conversationId, "READ", context);
  }

  public async readMessage(database: DatabaseClient, messageId: string): Promise<UnifiedMessage> {
    const rows = await database.unsafe<MessageRow[]>(
      `SELECT ${messageSelect}
       FROM support_messages AS messages
       LEFT JOIN users AS senders ON senders.id = messages.sender_user_id
       LEFT JOIN service_requests AS requests ON requests.id = messages.request_id
       LEFT JOIN unified_conversation_attachments AS conversation_attachments
         ON conversation_attachments.id = messages.attachment_id
       LEFT JOIN service_request_attachments AS legacy_attachments
         ON legacy_attachments.id = messages.legacy_request_attachment_id
       LEFT JOIN service_quotes AS quotes ON quotes.id = messages.quote_id
           LEFT JOIN support_messages AS reply_target ON reply_target.id = messages.reply_to_message_id
       WHERE messages.id = $1 LIMIT 1`,
      [messageId],
    );
    if (rows[0] === undefined) throw new Error("Unified message could not be read back.");
    return toMessage(rows[0]);
  }

  private async markConversation(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    status: "DELIVERED" | "READ",
    context: RequestAuditContext,
  ): Promise<MarkConversationResult> {
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const access = await this.resolveConversation(tx, principal, conversationId, "read");
      const rows = await tx<{ readonly message_id: string }[]>`
        UPDATE support_message_receipts AS receipts
        SET status = ${status},
            delivered_at = COALESCE(receipts.delivered_at, now()),
            read_at = CASE
              WHEN ${status} = 'READ' THEN COALESCE(receipts.read_at, now())
              ELSE receipts.read_at
            END,
            updated_at = now()
        FROM support_messages AS messages
        WHERE receipts.message_id = messages.id
          AND messages.conversation_id = ${access.row.id}
          AND receipts.recipient_user_id = ${principal.userId}
          AND CASE receipts.status WHEN 'SENT' THEN 1 WHEN 'DELIVERED' THEN 2 ELSE 3 END
              < CASE ${status} WHEN 'SENT' THEN 1 WHEN 'DELIVERED' THEN 2 ELSE 3 END
        RETURNING receipts.message_id
      `;
      let notificationCount = 0;
      if (status === "READ") {
        const notifications = await tx<{ readonly id: string }[]>`
          UPDATE user_notifications SET read_at = now()
          WHERE recipient_user_id = ${principal.userId}
            AND conversation_id = ${access.row.id}
            AND read_at IS NULL
          RETURNING id
        `;
        notificationCount = notifications.length;
      }
      if (rows.length > 0 || notificationCount > 0) {
        await recordAuditEvent(tx, {
          ...context,
          eventType: `unified_conversation.messages_${status.toLowerCase()}`,
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: access.row.student_user_id,
          sessionId: principal.sessionId,
          resourceType: "support_conversation",
          resourceId: access.row.id,
          metadata: { messageCount: rows.length, notificationCount },
        });
      }
      return { conversationId: access.row.id, updatedMessageCount: rows.length, status };
    });
  }

  private async ensureConversation(studentUserId: string, creatorUserId: string): Promise<string> {
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      await tx`
        INSERT INTO support_conversations (student_user_id, created_by_user_id)
        SELECT users.id, ${creatorUserId}
        FROM users
        INNER JOIN user_roles ON user_roles.user_id = users.id
          AND user_roles.role_code = 'STUDENT'
        WHERE users.id = ${studentUserId} AND users.status = 'ACTIVE'
        ON CONFLICT (student_user_id) DO NOTHING
      `;
      const rows = await tx<{ readonly id: string }[]>`
        SELECT id FROM support_conversations WHERE student_user_id = ${studentUserId} LIMIT 1
      `;
      if (rows[0] === undefined) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
      return rows[0].id;
    });
  }

  private async resolveConversation(
    database: DatabaseClient,
    principal: AuthenticatedPrincipal,
    conversationId: string,
    operation: "read" | "send",
  ): Promise<{ readonly mode: ConversationAccessMode; readonly row: ConversationRow }> {
    const adminPermission =
      operation === "read" ? "admin.conversations.read" : "admin.conversations.send";
    const studentPermission =
      operation === "read" ? "conversations.read.own" : "conversations.send.own";
    const adminAccess = hasPermission(principal, adminPermission);
    if (adminAccess) requireRole(principal, "ADMIN");
    else requirePermission(requireRole(principal, "STUDENT"), studentPermission);
    if (!isUuid(conversationId)) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    const rows = await database.unsafe<ConversationRow[]>(
      `SELECT ${conversationSelect}
       FROM support_conversations AS conversations
       INNER JOIN users AS students ON students.id = conversations.student_user_id
       WHERE conversations.id = $1 AND ($2::boolean OR conversations.student_user_id = $3)
       LIMIT 1`,
      [conversationId, adminAccess, principal.userId],
    );
    if (rows[0] === undefined) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    return { mode: adminAccess ? "ADMIN" : "STUDENT", row: rows[0] };
  }

  private async recipientIds(
    database: DatabaseClient,
    senderMode: ConversationAccessMode,
    studentUserId: string,
  ): Promise<readonly string[]> {
    if (senderMode === "ADMIN") return [studentUserId];
    const rows = await database<{ readonly id: string }[]>`
      SELECT users.id FROM users
      INNER JOIN user_roles ON user_roles.user_id = users.id
      WHERE users.status = 'ACTIVE' AND user_roles.role_code = 'ADMIN'
      ORDER BY users.id
    `;
    return rows.map((row) => row.id);
  }

  private conversationListQuery(): string {
    return `SELECT ${conversationSelect},
      last_message.body AS last_message_preview,
      last_message.sent_at AS last_message_at,
      COALESCE(unread.unread_count, '0') AS unread_count,
      request_counts.request_count,
      request_counts.active_request_count,
      latest_request.id AS latest_request_id,
      latest_request.request_number AS latest_request_number,
      latest_request.title AS latest_request_title,
      latest_request.status AS latest_request_status,
      latest_request.version AS latest_request_version,
      latest_request.updated_at AS latest_request_updated_at
    FROM support_conversations AS conversations
    INNER JOIN users AS students ON students.id = conversations.student_user_id
    LEFT JOIN LATERAL (
      SELECT messages.body, messages.sent_at
      FROM support_messages AS messages
      WHERE messages.conversation_id = conversations.id
      ORDER BY messages.sent_at DESC, messages.id DESC LIMIT 1
    ) AS last_message ON TRUE
    LEFT JOIN (
      -- All of this recipient's unread counts in one grouped pass, joined once,
      -- instead of a correlated COUNT re-run for every conversation row.
      SELECT unread_messages.conversation_id, count(*)::text AS unread_count
      FROM support_message_receipts AS receipts
      INNER JOIN support_messages AS unread_messages ON unread_messages.id = receipts.message_id
      WHERE receipts.recipient_user_id = $2
        AND receipts.status <> 'READ'
      GROUP BY unread_messages.conversation_id
    ) AS unread ON unread.conversation_id = conversations.id
    LEFT JOIN LATERAL (
      SELECT count(*)::text AS request_count,
        count(*) FILTER (
          WHERE requests.status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')
        )::text AS active_request_count
      FROM service_requests AS requests
      WHERE requests.student_user_id = conversations.student_user_id
    ) AS request_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT requests.id, requests.request_number, requests.title, requests.status,
             requests.version, requests.updated_at
      FROM service_requests AS requests
      WHERE requests.student_user_id = conversations.student_user_id
      ORDER BY requests.updated_at DESC, requests.id DESC LIMIT 1
    ) AS latest_request ON TRUE`;
  }

  private async readConversationRows(
    database: DatabaseClient,
    principalUserId: string,
    conversationId: string,
  ): Promise<ConversationListRow[]> {
    return database.unsafe<ConversationListRow[]>(
      `${this.conversationListQuery()} WHERE conversations.id = $1 LIMIT 1`,
      [conversationId, principalUserId],
    );
  }
}
