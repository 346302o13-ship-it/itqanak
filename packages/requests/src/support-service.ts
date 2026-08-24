import { createHash, randomUUID } from "node:crypto";

import {
  hasPermission,
  recordAuditEvent,
  requirePermission,
  requireRole,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { JsonObject, JsonValue } from "@itqanak/core";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

import { isUuid, normalizeBoundedPage } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import type {
  ChatContentType,
  ChatSenderType,
  MarkConversationResult,
  MessageReceiptStatus,
  SendSupportMessageInput,
  SendSupportMessageResult,
  SupportConversationListInput,
  SupportConversationListResult,
  SupportConversationSummary,
  SupportMessage,
  SupportMessageListResult,
} from "./types.js";

interface SupportConversationRow {
  readonly id: string;
  readonly student_user_id: string;
  readonly student_display_name: string;
  readonly student_phone_e164: string;
  readonly created_at: Date | string;
}

interface SupportConversationListRow extends SupportConversationRow {
  readonly last_message_preview: string | null;
  readonly last_message_at: Date | string | null;
  readonly unread_count: number | string;
}

interface SupportMessageRow {
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
}

interface CountRow {
  readonly count: number | string;
}

export interface SupportServiceOptions {
  readonly database: DatabaseClient;
  readonly logger?: Logger;
}

const conversationSelect = `
  conversations.id, conversations.student_user_id,
  students.display_name AS student_display_name,
  students.phone_e164 AS student_phone_e164, conversations.created_at
`;

const messageSelect = `
  messages.id, messages.conversation_id, messages.sender_type, messages.sender_user_id,
  senders.display_name AS sender_display_name, messages.content_type, messages.body,
  messages.client_message_id, messages.client_payload_fingerprint, messages.metadata,
  messages.sent_at,
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
  END AS message_status
`;

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Support row contains an invalid timestamp.");
  return parsed;
}

function toSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Support row contains an invalid ${field}.`);
  }
  return parsed;
}

function toSenderType(value: string): ChatSenderType {
  if (value !== "STUDENT" && value !== "ADMIN" && value !== "SYSTEM") {
    throw new Error("Support row contains an invalid sender type.");
  }
  return value;
}

function toContentType(value: string): ChatContentType {
  if (
    !(["TEXT", "IMAGE", "AUDIO", "FILE", "SYSTEM", "ACTION"] as const).includes(
      value as ChatContentType,
    )
  ) {
    throw new Error("Support row contains an invalid content type.");
  }
  return value as ChatContentType;
}

function toReceiptStatus(value: string): MessageReceiptStatus {
  if (value !== "SENT" && value !== "DELIVERED" && value !== "READ") {
    throw new Error("Support row contains an invalid receipt status.");
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
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function toJsonObject(value: unknown): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== "object" || !isJsonValue(value)) {
    throw new Error("Support row contains invalid metadata.");
  }
  return value as JsonObject;
}

function toConversation(row: SupportConversationListRow): SupportConversationSummary {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    studentDisplayName: row.student_display_name,
    studentPhoneE164: row.student_phone_e164,
    ...(row.last_message_preview === null ? {} : { lastMessagePreview: row.last_message_preview }),
    ...(row.last_message_at === null ? {} : { lastMessageAt: toDate(row.last_message_at) }),
    unreadCount: toSafeInteger(row.unread_count, "unread_count"),
    createdAt: toDate(row.created_at),
  };
}

function toMessage(row: SupportMessageRow): SupportMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: toSenderType(row.sender_type),
    ...(row.sender_user_id === null ? {} : { senderUserId: row.sender_user_id }),
    ...(row.sender_display_name === null ? {} : { senderDisplayName: row.sender_display_name }),
    contentType: toContentType(row.content_type),
    body: row.body,
    ...(row.client_message_id === null ? {} : { clientMessageId: row.client_message_id }),
    metadata: toJsonObject(row.metadata),
    status: toReceiptStatus(row.message_status),
    sentAt: toDate(row.sent_at),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function normalizedBody(value: string): string {
  const body = value.trim();
  if (body.length < 1 || body.length > 10_000 || body.includes("\0")) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  return body;
}

export class SupportService {
  private readonly database: DatabaseClient;
  private readonly logger: Logger | undefined;

  public constructor(options: SupportServiceOptions) {
    this.database = options.database;
    this.logger = options.logger;
  }

  public async getOrCreateOwnConversation(
    principal: AuthenticatedPrincipal,
    context: RequestAuditContext = {},
  ): Promise<SupportConversationSummary> {
    requirePermission(principal, "support.chat.read.own");
    return this.openConversation(principal, principal.userId, "STUDENT", context);
  }

  public async openConversationForStudent(
    principal: AuthenticatedPrincipal,
    studentUserId: string,
    context: RequestAuditContext = {},
  ): Promise<SupportConversationSummary> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.support.chat.send");
    if (!isUuid(studentUserId)) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    return this.openConversation(principal, studentUserId, "ADMIN", context);
  }

  public async listConversations(
    principal: AuthenticatedPrincipal,
    input: SupportConversationListInput = {},
    context: RequestAuditContext = {},
  ): Promise<SupportConversationListResult> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.support.chat.read");
    const { page, pageSize, offset } = normalizeBoundedPage(input.page, input.pageSize, 100);
    const search = input.search?.trim().slice(0, 100);
    const pattern = search === undefined || search.length === 0 ? null : `%${escapeLike(search)}%`;
    const [counts, rows] = await Promise.all([
      this.database.unsafe<CountRow[]>(
        `SELECT count(*)::text AS count
         FROM support_conversations AS conversations
         INNER JOIN users AS students ON students.id = conversations.student_user_id
         WHERE $1::text IS NULL OR students.display_name ILIKE $1 ESCAPE E'\\\\'
           OR students.phone_e164 ILIKE $1 ESCAPE E'\\\\'`,
        [pattern],
      ),
      this.database.unsafe<SupportConversationListRow[]>(
        `SELECT ${conversationSelect}, last_message.last_message_preview,
                last_message.last_message_at,
                (
                  SELECT count(*)::text FROM support_messages AS unread_messages
                  WHERE unread_messages.conversation_id = conversations.id
                    AND unread_messages.sender_user_id IS DISTINCT FROM $2
                    AND NOT EXISTS (
                      SELECT 1 FROM support_message_receipts AS receipts
                      WHERE receipts.message_id = unread_messages.id
                        AND receipts.recipient_user_id = $2 AND receipts.status = 'READ'
                    )
                ) AS unread_count
         FROM support_conversations AS conversations
         INNER JOIN users AS students ON students.id = conversations.student_user_id
         LEFT JOIN LATERAL (
           SELECT left(messages.body, 160) AS last_message_preview,
                  messages.sent_at AS last_message_at
           FROM support_messages AS messages
           WHERE messages.conversation_id = conversations.id
           ORDER BY messages.sent_at DESC, messages.id DESC
           LIMIT 1
         ) AS last_message ON TRUE
         WHERE $1::text IS NULL OR students.display_name ILIKE $1 ESCAPE E'\\\\'
           OR students.phone_e164 ILIKE $1 ESCAPE E'\\\\'
         ORDER BY conversations.last_message_at DESC NULLS LAST,
                  conversations.created_at DESC, conversations.id DESC
         LIMIT $3 OFFSET $4`,
        [pattern, principal.userId, pageSize, offset],
      ),
    ]);
    const total = toSafeInteger(counts[0]?.count ?? "0", "count");
    const result = {
      items: rows.map(toConversation),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "support.conversations_listed",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      targetUserId: principal.userId,
      sessionId: principal.sessionId,
      metadata: { result_count: result.items.length },
    });
    return result;
  }

  public async listMessages(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    input: { readonly page?: number; readonly pageSize?: number } = {},
  ): Promise<SupportMessageListResult> {
    const access = await this.resolveConversation(this.database, principal, conversationId, "read");
    const { page, pageSize, offset } = normalizeBoundedPage(input.page, input.pageSize, 100);
    const [counts, rows] = await Promise.all([
      this.database<CountRow[]>`
        SELECT count(*)::text AS count FROM support_messages
        WHERE conversation_id = ${access.row.id}
      `,
      this.database.unsafe<SupportMessageRow[]>(
        `SELECT ${messageSelect}
         FROM support_messages AS messages
         LEFT JOIN users AS senders ON senders.id = messages.sender_user_id
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

  public async sendMessage(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    input: SendSupportMessageInput,
    context: RequestAuditContext = {},
  ): Promise<SendSupportMessageResult> {
    const body = normalizedBody(input.body);
    const clientMessageId = input.clientMessageId ?? randomUUID();
    if (!isUuid(clientMessageId)) throw new RequestDomainError("INVALID_MESSAGE");
    const fingerprint = createHash("sha256").update(body, "utf8").digest("hex");
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const access = await this.resolveConversation(tx, principal, conversationId, "send");
      const senderType = access.mode;
      const inserted = await tx<{ readonly id: string }[]>`
        INSERT INTO support_messages (
          conversation_id, sender_type, sender_user_id, content_type, body,
          client_message_id, client_payload_fingerprint
        ) VALUES (
          ${access.row.id}, ${senderType}, ${principal.userId}, 'TEXT', ${body},
          ${clientMessageId}, ${fingerprint}
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
            AND client_message_id = ${clientMessageId}
          LIMIT 1
        `;
        if (replay[0] === undefined || replay[0].client_payload_fingerprint !== fingerprint) {
          throw new RequestDomainError("IDEMPOTENCY_KEY_REUSED");
        }
        messageId = replay[0].id;
      } else {
        if (senderType === "ADMIN") {
          await tx`
            INSERT INTO support_message_receipts (message_id, recipient_user_id, status)
            VALUES (${messageId}, ${access.row.student_user_id}, 'SENT')
            ON CONFLICT (message_id, recipient_user_id) DO NOTHING
          `;
        }
        await tx`
          UPDATE support_conversations
          SET updated_at = now(), last_message_at = now()
          WHERE id = ${access.row.id}
        `;
        await recordAuditEvent(tx, {
          ...context,
          eventType: "support.message_sent",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: access.row.student_user_id,
          sessionId: principal.sessionId,
          resourceType: "support_message",
          resourceId: messageId,
          metadata: { senderType },
        });
      }
      return { message: await this.readMessage(tx, messageId), idempotentReplay };
    });
    if (!result.idempotentReplay) {
      this.logger?.info("support_message_sent", {
        messageId: result.message.id,
        conversationId: result.message.conversationId,
      });
    }
    return result;
  }

  public async markRead(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    context: RequestAuditContext = {},
  ): Promise<MarkConversationResult> {
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const access = await this.resolveConversation(tx, principal, conversationId, "read");
      const rows = await tx<{ readonly message_id: string }[]>`
        INSERT INTO support_message_receipts (
          message_id, recipient_user_id, status, delivered_at, read_at
        )
        SELECT messages.id, ${principal.userId}, 'READ', now(), now()
        FROM support_messages AS messages
        WHERE messages.conversation_id = ${access.row.id}
          AND messages.sender_user_id IS DISTINCT FROM ${principal.userId}
        ON CONFLICT (message_id, recipient_user_id) DO UPDATE
        SET status = 'READ',
            delivered_at = COALESCE(support_message_receipts.delivered_at, now()),
            read_at = COALESCE(support_message_receipts.read_at, now()), updated_at = now()
        WHERE support_message_receipts.status <> 'READ'
        RETURNING message_id
      `;
      if (rows.length > 0) {
        await recordAuditEvent(tx, {
          ...context,
          eventType: "support.messages_read",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: access.row.student_user_id,
          sessionId: principal.sessionId,
          resourceType: "support_conversation",
          resourceId: access.row.id,
          metadata: { messageCount: rows.length },
        });
      }
      return {
        conversationId: access.row.id,
        updatedMessageCount: rows.length,
        status: "READ" as const,
      };
    });
    return result;
  }

  private async openConversation(
    principal: AuthenticatedPrincipal,
    studentUserId: string,
    mode: "ADMIN" | "STUDENT",
    context: RequestAuditContext,
  ): Promise<SupportConversationSummary> {
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const inserted = await tx<{ readonly id: string }[]>`
        INSERT INTO support_conversations (student_user_id, created_by_user_id)
        SELECT users.id, ${principal.userId}
        FROM users
        INNER JOIN user_roles ON user_roles.user_id = users.id
          AND user_roles.role_code = 'STUDENT'
        WHERE users.id = ${studentUserId} AND users.status = 'ACTIVE'
        ON CONFLICT (student_user_id) DO NOTHING
        RETURNING id
      `;
      const rows = await tx.unsafe<SupportConversationListRow[]>(
        `SELECT ${conversationSelect}, NULL::text AS last_message_preview,
                conversations.last_message_at, 0::text AS unread_count
         FROM support_conversations AS conversations
         INNER JOIN users AS students ON students.id = conversations.student_user_id
         WHERE conversations.student_user_id = $1
         LIMIT 1`,
        [studentUserId],
      );
      const row = rows[0];
      if (row === undefined) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
      if (inserted[0] !== undefined) {
        await recordAuditEvent(tx, {
          ...context,
          eventType: "support.conversation_opened",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: studentUserId,
          sessionId: principal.sessionId,
          resourceType: "support_conversation",
          resourceId: row.id,
          metadata: { openedBy: mode },
        });
      }
      return toConversation(row);
    });
  }

  private async resolveConversation(
    database: DatabaseClient,
    principal: AuthenticatedPrincipal,
    conversationId: string,
    operation: "read" | "send",
  ): Promise<{ readonly mode: "ADMIN" | "STUDENT"; readonly row: SupportConversationRow }> {
    const adminPermission =
      operation === "read" ? "admin.support.chat.read" : "admin.support.chat.send";
    const studentPermission =
      operation === "read" ? "support.chat.read.own" : "support.chat.send.own";
    const adminAccess = hasPermission(principal, adminPermission);
    if (adminAccess) requireRole(principal, "ADMIN");
    else requirePermission(principal, studentPermission);
    if (!isUuid(conversationId)) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    const rows = await database.unsafe<SupportConversationRow[]>(
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

  private async readMessage(database: DatabaseClient, messageId: string): Promise<SupportMessage> {
    const rows = await database.unsafe<SupportMessageRow[]>(
      `SELECT ${messageSelect}
       FROM support_messages AS messages
       LEFT JOIN users AS senders ON senders.id = messages.sender_user_id
       WHERE messages.id = $1 LIMIT 1`,
      [messageId],
    );
    if (rows[0] === undefined) throw new Error("Created support message could not be read back.");
    return toMessage(rows[0]);
  }
}
