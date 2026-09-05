import { createHash, randomUUID } from "node:crypto";

import {
  hasPermission,
  recordAuditEvent,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import {
  isRequestStatus,
  type JsonObject,
  type JsonValue,
  type RequestStatus,
} from "@itqanak/core";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

import {
  assertChatAttachmentMatchesContent,
  normalizeBoundedPage,
  normalizeChatMessageInput,
} from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import { moderateMessagePreview } from "./message-preview-moderation.js";
import type {
  ChatContentType,
  ChatMessage,
  ChatMessageListInput,
  ChatMessageListResult,
  ChatSenderType,
  ConversationListInput,
  ConversationListResult,
  ConversationSummary,
  MarkConversationResult,
  MessageReceiptStatus,
  SendChatMessageInput,
  SendChatMessageResult,
} from "./types.js";

interface ConversationAccessRow {
  readonly id: string;
  readonly request_id: string;
  readonly request_number: string;
  readonly request_title: string;
  readonly request_status: string;
  readonly student_user_id: string;
  readonly student_display_name: string;
  readonly student_phone_e164: string | null;
  readonly assigned_admin_user_id: string | null;
  readonly assigned_admin_display_name: string | null;
}

interface ConversationListRow extends ConversationAccessRow {
  readonly last_message_type: string | null;
  readonly last_message_preview: string | null;
  readonly last_message_at: Date | string | null;
  readonly unread_count: number | string;
}

interface CountRow {
  readonly count: number | string;
}

interface MessageRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly sender_type: string;
  readonly sender_user_id: string | null;
  readonly sender_display_name: string | null;
  readonly content_type: string;
  readonly body: string | null;
  readonly attachment_id: string | null;
  readonly attachment_filename: string | null;
  readonly attachment_mime_type: string | null;
  readonly attachment_size_bytes: number | string | null;
  readonly attachment_scan_status: string | null;
  readonly client_message_id: string | null;
  readonly client_payload_fingerprint: string | null;
  readonly metadata: unknown;
  readonly message_status: string;
  readonly sent_at: Date | string;
}

interface AttachmentForMessageRow {
  readonly id: string;
  readonly request_id: string;
  readonly detected_mime_type: string | null;
  readonly storage_status: string;
  readonly scan_status: string;
}

interface InsertedMessageRow {
  readonly id: string;
}

type ConversationAccessMode = "ADMIN" | "STUDENT";

export interface ChatServiceOptions {
  readonly database: DatabaseClient;
  readonly logger?: Logger;
}

const messageSelect = `
  messages.id, messages.conversation_id, messages.sender_type, messages.sender_user_id,
  senders.display_name AS sender_display_name, messages.content_type, messages.body,
  messages.attachment_id, attachments.original_filename AS attachment_filename,
  attachments.detected_mime_type AS attachment_mime_type,
  attachments.size_bytes AS attachment_size_bytes,
  attachments.scan_status AS attachment_scan_status, messages.client_message_id,
  messages.client_payload_fingerprint, messages.metadata, messages.sent_at,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM service_request_message_receipts AS receipts
      WHERE receipts.message_id = messages.id AND receipts.status = 'READ'
    ) THEN 'READ'
    WHEN EXISTS (
      SELECT 1 FROM service_request_message_receipts AS receipts
      WHERE receipts.message_id = messages.id AND receipts.status = 'DELIVERED'
    ) THEN 'DELIVERED'
    ELSE 'SENT'
  END AS message_status
`;

const conversationSelect = `
  conversations.id, requests.id AS request_id, requests.request_number,
  requests.title AS request_title, requests.status AS request_status,
  students.id AS student_user_id, students.display_name AS student_display_name,
  students.phone_e164 AS student_phone_e164,
  current_assignment.assigned_admin_user_id,
  current_assignment.assigned_admin_display_name
`;

const assignmentJoin = `
  LEFT JOIN LATERAL (
    SELECT assignments.assigned_admin_user_id,
           administrators.display_name AS assigned_admin_display_name
    FROM service_request_assignments AS assignments
    INNER JOIN users AS administrators ON administrators.id = assignments.assigned_admin_user_id
    WHERE assignments.request_id = requests.id AND assignments.unassigned_at IS NULL
    LIMIT 1
  ) AS current_assignment ON TRUE
`;

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Chat row contains an invalid timestamp.");
  }
  return parsed;
}

function toSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Chat row contains an invalid ${field}.`);
  }
  return parsed;
}

function toRequestStatus(value: string): RequestStatus {
  if (!isRequestStatus(value)) {
    throw new Error("Chat row contains an unsupported request status.");
  }
  return value;
}

function toContentType(value: string): ChatContentType {
  if (
    value !== "TEXT" &&
    value !== "IMAGE" &&
    value !== "AUDIO" &&
    value !== "FILE" &&
    value !== "SYSTEM" &&
    value !== "ACTION"
  ) {
    throw new Error("Chat row contains an unsupported content type.");
  }
  return value;
}

function toSenderType(value: string): ChatSenderType {
  if (value !== "STUDENT" && value !== "ADMIN" && value !== "SYSTEM") {
    throw new Error("Chat row contains an unsupported sender type.");
  }
  return value;
}

function toReceiptStatus(value: string): MessageReceiptStatus {
  if (value !== "SENT" && value !== "DELIVERED" && value !== "READ") {
    throw new Error("Chat row contains an unsupported receipt status.");
  }
  return value;
}

function toAttachmentScanStatus(
  value: string | null,
): NonNullable<ChatMessage["attachment"]>["scanStatus"] {
  if (
    value !== "NOT_REQUIRED" &&
    value !== "PENDING_SCAN" &&
    value !== "CLEAN" &&
    value !== "INFECTED" &&
    value !== "SCAN_ERROR" &&
    value !== "SCAN_SKIPPED_DEVELOPMENT" &&
    value !== "SCAN_SKIPPED_BY_ADMIN" &&
    value !== "REJECTED"
  ) {
    throw new Error("Chat attachment contains an unsupported scan status.");
  }
  return value;
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
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== "object") {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

function toJsonObject(value: unknown): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== "object" || !isJsonValue(value)) {
    throw new Error("Chat row contains invalid message metadata.");
  }
  return value as JsonObject;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const objectValue = value as { readonly [key: string]: JsonValue };
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(objectValue[key] ?? null)}`)
    .join(",")}}`;
}

function messageFingerprint(input: {
  readonly contentType: ChatContentType;
  readonly body?: string;
  readonly attachmentId?: string;
  readonly metadata: JsonObject;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        contentType: input.contentType,
        body: input.body ?? null,
        attachmentId: input.attachmentId ?? null,
        metadata: input.metadata,
      }),
      "utf8",
    )
    .digest("hex");
}

function toMessage(row: MessageRow): ChatMessage {
  const senderType = toSenderType(row.sender_type);
  const contentType = toContentType(row.content_type);
  const attachment =
    row.attachment_id === null
      ? undefined
      : {
          id: row.attachment_id,
          originalFilename: row.attachment_filename ?? "attachment",
          mimeType: row.attachment_mime_type ?? "application/octet-stream",
          sizeBytes: toSafeInteger(row.attachment_size_bytes ?? 0, "attachment_size_bytes"),
          scanStatus: toAttachmentScanStatus(row.attachment_scan_status),
        };
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType,
    ...(row.sender_user_id === null ? {} : { senderUserId: row.sender_user_id }),
    ...(row.sender_display_name === null ? {} : { senderDisplayName: row.sender_display_name }),
    contentType,
    ...(row.body === null ? {} : { body: row.body }),
    ...(attachment === undefined ? {} : { attachment }),
    ...(row.client_message_id === null ? {} : { clientMessageId: row.client_message_id }),
    metadata: toJsonObject(row.metadata),
    status: toReceiptStatus(row.message_status),
    sentAt: toDate(row.sent_at),
  };
}

function toConversation(row: ConversationListRow): ConversationSummary {
  return {
    id: row.id,
    requestId: row.request_id,
    requestNumber: row.request_number,
    requestTitle: row.request_title,
    requestStatus: toRequestStatus(row.request_status),
    studentUserId: row.student_user_id,
    studentDisplayName: row.student_display_name,
    ...(row.student_phone_e164 === null ? {} : { studentPhoneE164: row.student_phone_e164 }),
    ...(row.assigned_admin_user_id === null
      ? {}
      : { assignedAdminUserId: row.assigned_admin_user_id }),
    ...(row.assigned_admin_display_name === null
      ? {}
      : { assignedAdminDisplayName: row.assigned_admin_display_name }),
    ...(row.last_message_type === null
      ? {}
      : { lastMessageType: toContentType(row.last_message_type) }),
    ...(row.last_message_preview === null
      ? {}
      : { lastMessagePreview: moderateMessagePreview(row.last_message_preview) }),
    ...(row.last_message_at === null ? {} : { lastMessageAt: toDate(row.last_message_at) }),
    unreadCount: toSafeInteger(row.unread_count, "unread_count"),
  };
}

export class ChatService {
  private readonly database: DatabaseClient;
  private readonly logger: Logger | undefined;

  public constructor(options: ChatServiceOptions) {
    this.database = options.database;
    this.logger = options.logger;
  }

  public async listConversations(
    principal: AuthenticatedPrincipal,
    input: ConversationListInput = {},
  ): Promise<ConversationListResult> {
    const adminAccess = hasPermission(principal, "admin.requests.chat.read");
    if (!adminAccess) {
      requirePermission(principal, "requests.chat.read.own");
    }
    const { page, pageSize, offset } = normalizeBoundedPage(input.page, input.pageSize, 50);
    const search = input.search?.trim().slice(0, 100);
    const searchPattern =
      search === undefined || search.length === 0 ? null : `%${escapeLike(search)}%`;
    const requestStatus = input.requestStatus ?? null;
    const lastMessageJoin = `
      LEFT JOIN LATERAL (
        SELECT messages.content_type AS last_message_type,
               left(COALESCE(messages.body, messages.content_type), 160) AS last_message_preview,
               messages.sent_at AS last_message_at
        FROM service_request_messages AS messages
        WHERE messages.conversation_id = conversations.id
        ORDER BY messages.sent_at DESC, messages.id DESC
        LIMIT 1
      ) AS last_message ON TRUE
    `;
    let countRows: CountRow[];
    let rows: ConversationListRow[];
    if (adminAccess) {
      const assignedAdminUserId = input.assignedAdminUserId ?? null;
      const unassignedOnly = input.unassignedOnly === true;
      const predicate = `
        ($1::text IS NULL OR requests.request_number ILIKE $1 ESCAPE E'\\\\'
          OR requests.title ILIKE $1 ESCAPE E'\\\\'
          OR students.display_name ILIKE $1 ESCAPE E'\\\\'
          OR students.phone_e164 ILIKE $1 ESCAPE E'\\\\')
        AND ($2::text IS NULL OR requests.status = $2)
        AND ($3::uuid IS NULL OR current_assignment.assigned_admin_user_id = $3)
        AND (NOT $4::boolean OR current_assignment.assigned_admin_user_id IS NULL)
      `;
      const parameters = [searchPattern, requestStatus, assignedAdminUserId, unassignedOnly];
      [countRows, rows] = await Promise.all([
        this.database.unsafe<CountRow[]>(
          `SELECT count(*)::text AS count
           FROM service_request_conversations AS conversations
           INNER JOIN service_requests AS requests ON requests.id = conversations.request_id
           INNER JOIN users AS students ON students.id = requests.student_user_id
           ${assignmentJoin}
           WHERE ${predicate}`,
          parameters,
        ),
        this.database.unsafe<ConversationListRow[]>(
          `SELECT ${conversationSelect}, last_message.last_message_type,
                  last_message.last_message_preview, last_message.last_message_at,
                  (
                    SELECT count(*)::text FROM service_request_messages AS unread_messages
                    WHERE unread_messages.conversation_id = conversations.id
                      AND unread_messages.sender_user_id IS DISTINCT FROM $5
                      AND NOT EXISTS (
                        SELECT 1 FROM service_request_message_receipts AS receipts
                        WHERE receipts.message_id = unread_messages.id
                          AND receipts.recipient_user_id = $5 AND receipts.status = 'READ'
                      )
                  ) AS unread_count
           FROM service_request_conversations AS conversations
           INNER JOIN service_requests AS requests ON requests.id = conversations.request_id
           INNER JOIN users AS students ON students.id = requests.student_user_id
           ${assignmentJoin}
           ${lastMessageJoin}
           WHERE ${predicate}
           ORDER BY conversations.last_message_at DESC NULLS LAST,
                    conversations.created_at DESC, conversations.id DESC
           LIMIT $6 OFFSET $7`,
          [...parameters, principal.userId, pageSize, offset],
        ),
      ]);
    } else {
      const predicate = `
        requests.student_user_id = $1
        AND ($2::text IS NULL OR requests.request_number ILIKE $2 ESCAPE E'\\\\'
          OR requests.title ILIKE $2 ESCAPE E'\\\\')
        AND ($3::text IS NULL OR requests.status = $3)
      `;
      const parameters = [principal.userId, searchPattern, requestStatus];
      [countRows, rows] = await Promise.all([
        this.database.unsafe<CountRow[]>(
          `SELECT count(*)::text AS count
           FROM service_request_conversations AS conversations
           INNER JOIN service_requests AS requests ON requests.id = conversations.request_id
           WHERE ${predicate}`,
          parameters,
        ),
        this.database.unsafe<ConversationListRow[]>(
          `SELECT ${conversationSelect}, last_message.last_message_type,
                  last_message.last_message_preview, last_message.last_message_at,
                  (
                    SELECT count(*)::text FROM service_request_messages AS unread_messages
                    WHERE unread_messages.conversation_id = conversations.id
                      AND unread_messages.sender_user_id IS DISTINCT FROM $1
                      AND NOT EXISTS (
                        SELECT 1 FROM service_request_message_receipts AS receipts
                        WHERE receipts.message_id = unread_messages.id
                          AND receipts.recipient_user_id = $1 AND receipts.status = 'READ'
                      )
                  ) AS unread_count
           FROM service_request_conversations AS conversations
           INNER JOIN service_requests AS requests ON requests.id = conversations.request_id
           INNER JOIN users AS students ON students.id = requests.student_user_id
           ${assignmentJoin}
           ${lastMessageJoin}
           WHERE ${predicate}
           ORDER BY conversations.last_message_at DESC NULLS LAST,
                    conversations.created_at DESC, conversations.id DESC
           LIMIT $4 OFFSET $5`,
          [...parameters, pageSize, offset],
        ),
      ]);
    }
    const total = toSafeInteger(countRows[0]?.count ?? "0", "count");
    return {
      items: rows.map(toConversation),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  public async listChatMessages(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
    input: ChatMessageListInput = {},
  ): Promise<ChatMessageListResult> {
    const access = await this.resolveConversation(
      this.database,
      principal,
      requestIdentifier,
      "read",
    );
    const { page, pageSize, offset } = normalizeBoundedPage(input.page, input.pageSize, 100);
    const [counts, rows] = await Promise.all([
      this.database<CountRow[]>`
        SELECT count(*)::text AS count FROM service_request_messages
        WHERE conversation_id = ${access.row.id}
      `,
      this.database.unsafe<MessageRow[]>(
        `SELECT ${messageSelect}
         FROM service_request_messages AS messages
         LEFT JOIN users AS senders ON senders.id = messages.sender_user_id
         LEFT JOIN service_request_attachments AS attachments ON attachments.id = messages.attachment_id
         WHERE messages.conversation_id = $1
         ORDER BY messages.sent_at DESC, messages.id DESC
         LIMIT $2 OFFSET $3`,
        [access.row.id, pageSize, offset],
      ),
    ]);
    const total = toSafeInteger(counts[0]?.count ?? "0", "count");
    return {
      items: rows.map(toMessage).reverse(),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  public async sendChatMessage(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
    input: SendChatMessageInput,
    context: RequestAuditContext = {},
  ): Promise<SendChatMessageResult> {
    const normalized = normalizeChatMessageInput(input);
    const clientMessageId = normalized.clientMessageId ?? randomUUID();
    const fingerprint = messageFingerprint(normalized);
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const access = await this.resolveConversation(tx, principal, requestIdentifier, "send");
      if (
        access.mode === "STUDENT" &&
        (normalized.contentType === "SYSTEM" || normalized.contentType === "ACTION")
      ) {
        throw new RequestDomainError("INVALID_MESSAGE");
      }
      if (normalized.attachmentId !== undefined) {
        const attachmentRows = await tx<AttachmentForMessageRow[]>`
          SELECT id, request_id, detected_mime_type, storage_status, scan_status
          FROM service_request_attachments
          WHERE id = ${normalized.attachmentId} AND deleted_at IS NULL
          FOR SHARE
        `;
        const attachment = attachmentRows[0];
        if (
          attachment === undefined ||
          attachment.request_id !== access.row.request_id ||
          attachment.storage_status !== "STORED" ||
          (attachment.scan_status !== "CLEAN" &&
            attachment.scan_status !== "SCAN_SKIPPED_DEVELOPMENT" &&
            attachment.scan_status !== "SCAN_SKIPPED_BY_ADMIN") ||
          attachment.detected_mime_type === null
        ) {
          throw new RequestDomainError("INVALID_MESSAGE_ATTACHMENT");
        }
        assertChatAttachmentMatchesContent(normalized.contentType, attachment.detected_mime_type);
      }
      const senderType: ChatSenderType = access.mode === "ADMIN" ? "ADMIN" : "STUDENT";
      const inserted = await tx<InsertedMessageRow[]>`
        INSERT INTO service_request_messages (
          conversation_id, sender_type, sender_user_id, content_type, body,
          attachment_id, client_message_id, client_payload_fingerprint, metadata
        ) VALUES (
          ${access.row.id}, ${senderType}, ${principal.userId}, ${normalized.contentType},
          ${normalized.body ?? null}, ${normalized.attachmentId ?? null}, ${clientMessageId},
          ${fingerprint}, ${tx.json(normalized.metadata)}
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
          SELECT id, client_payload_fingerprint
          FROM service_request_messages
          WHERE conversation_id = ${access.row.id}
            AND sender_user_id = ${principal.userId}
            AND client_message_id = ${clientMessageId}
          LIMIT 1
        `;
        if (replay[0] === undefined || replay[0].client_payload_fingerprint !== fingerprint) {
          throw new RequestDomainError("IDEMPOTENCY_KEY_REUSED");
        }
        messageId = replay[0].id;
      } else {
        const recipientUserId =
          access.mode === "ADMIN" ? access.row.student_user_id : access.row.assigned_admin_user_id;
        if (recipientUserId !== null && recipientUserId !== principal.userId) {
          await tx`
            INSERT INTO service_request_message_receipts (
              message_id, recipient_user_id, status
            ) VALUES (${messageId}, ${recipientUserId}, 'SENT')
            ON CONFLICT (message_id, recipient_user_id) DO NOTHING
          `;
        }
        await tx`
          UPDATE service_request_conversations
          SET updated_at = now(), last_message_at = now()
          WHERE id = ${access.row.id}
        `;
        await tx`
          INSERT INTO outbox_events (
            event_type, aggregate_type, aggregate_id, idempotency_key, payload
          ) VALUES (
            'REQUEST_MESSAGE_CREATED', 'SERVICE_REQUEST_CONVERSATION', ${access.row.id},
            ${`conversation:${access.row.id}:message:${messageId}`},
            ${tx.json({
              schemaVersion: 1,
              conversationId: access.row.id,
              requestId: access.row.request_id,
              messageId,
              contentType: normalized.contentType,
            })}
          )
          ON CONFLICT (idempotency_key) DO NOTHING
        `;
        await recordAuditEvent(tx, {
          ...context,
          eventType: "request.chat.message_sent",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: access.row.student_user_id,
          sessionId: principal.sessionId,
          resourceType: "service_request_message",
          resourceId: messageId,
          metadata: { contentType: normalized.contentType },
        });
      }
      const message = await this.readMessage(tx, messageId);
      return { message, idempotentReplay };
    });
    if (!result.idempotentReplay) {
      this.logger?.info("request_chat_message_sent", {
        messageId: result.message.id,
        conversationId: result.message.conversationId,
      });
    }
    return result;
  }

  public async markConversationDelivered(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
    context: RequestAuditContext = {},
  ): Promise<MarkConversationResult> {
    return this.markConversation(principal, requestIdentifier, "DELIVERED", context);
  }

  public async markConversationRead(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
    context: RequestAuditContext = {},
  ): Promise<MarkConversationResult> {
    return this.markConversation(principal, requestIdentifier, "READ", context);
  }

  private async markConversation(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
    status: "DELIVERED" | "READ",
    context: RequestAuditContext,
  ): Promise<MarkConversationResult> {
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const access = await this.resolveConversation(tx, principal, requestIdentifier, "read");
      const rows =
        status === "READ"
          ? await tx<{ readonly message_id: string }[]>`
              INSERT INTO service_request_message_receipts (
                message_id, recipient_user_id, status, delivered_at, read_at
              )
              SELECT messages.id, ${principal.userId}, 'READ', now(), now()
              FROM service_request_messages AS messages
              WHERE messages.conversation_id = ${access.row.id}
                AND messages.sender_user_id IS DISTINCT FROM ${principal.userId}
              ON CONFLICT (message_id, recipient_user_id) DO UPDATE
              SET status = 'READ',
                  delivered_at = COALESCE(service_request_message_receipts.delivered_at, now()),
                  read_at = COALESCE(service_request_message_receipts.read_at, now()),
                  updated_at = now()
              WHERE service_request_message_receipts.status <> 'READ'
              RETURNING message_id
            `
          : await tx<{ readonly message_id: string }[]>`
              INSERT INTO service_request_message_receipts (
                message_id, recipient_user_id, status, delivered_at
              )
              SELECT messages.id, ${principal.userId}, 'DELIVERED', now()
              FROM service_request_messages AS messages
              WHERE messages.conversation_id = ${access.row.id}
                AND messages.sender_user_id IS DISTINCT FROM ${principal.userId}
              ON CONFLICT (message_id, recipient_user_id) DO UPDATE
              SET status = 'DELIVERED',
                  delivered_at = COALESCE(service_request_message_receipts.delivered_at, now()),
                  updated_at = now()
              WHERE service_request_message_receipts.status = 'SENT'
              RETURNING message_id
            `;
      if (rows.length > 0) {
        await recordAuditEvent(tx, {
          ...context,
          eventType:
            status === "READ" ? "request.chat.messages_read" : "request.chat.messages_delivered",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: access.row.student_user_id,
          sessionId: principal.sessionId,
          resourceType: "service_request_conversation",
          resourceId: access.row.id,
          metadata: { messageCount: rows.length },
        });
      }
      return {
        conversationId: access.row.id,
        updatedMessageCount: rows.length,
        status,
      };
    });
    this.logger?.info("request_chat_receipts_updated", {
      conversationId: result.conversationId,
      status,
      messageCount: result.updatedMessageCount,
    });
    return result;
  }

  private async resolveConversation(
    database: DatabaseClient,
    principal: AuthenticatedPrincipal,
    identifier: string,
    operation: "read" | "send",
  ): Promise<{ readonly mode: ConversationAccessMode; readonly row: ConversationAccessRow }> {
    const adminPermission =
      operation === "read" ? "admin.requests.chat.read" : "admin.requests.chat.send";
    const studentPermission =
      operation === "read" ? "requests.chat.read.own" : "requests.chat.send.own";
    const adminAccess = hasPermission(principal, adminPermission);
    if (!adminAccess) {
      requirePermission(principal, studentPermission);
    }
    const normalized = identifier.trim();
    if (normalized.length === 0 || normalized.length > 80) {
      throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    }
    const rows = await database.unsafe<ConversationAccessRow[]>(
      `SELECT ${conversationSelect}
       FROM service_request_conversations AS conversations
       INNER JOIN service_requests AS requests ON requests.id = conversations.request_id
       INNER JOIN users AS students ON students.id = requests.student_user_id
       ${assignmentJoin}
       WHERE (
         conversations.id::text = $1 OR requests.id::text = $1 OR requests.request_number = $1
       )
       AND ($2::boolean OR requests.student_user_id = $3)
       LIMIT 1`,
      [normalized, adminAccess, principal.userId],
    );
    if (rows[0] === undefined) {
      throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    }
    return { mode: adminAccess ? "ADMIN" : "STUDENT", row: rows[0] };
  }

  private async readMessage(database: DatabaseClient, messageId: string): Promise<ChatMessage> {
    const rows = await database.unsafe<MessageRow[]>(
      `SELECT ${messageSelect}
       FROM service_request_messages AS messages
       LEFT JOIN users AS senders ON senders.id = messages.sender_user_id
       LEFT JOIN service_request_attachments AS attachments ON attachments.id = messages.attachment_id
       WHERE messages.id = $1
       LIMIT 1`,
      [messageId],
    );
    if (rows[0] === undefined) {
      throw new Error("Created chat message could not be read back.");
    }
    return toMessage(rows[0]);
  }
}
