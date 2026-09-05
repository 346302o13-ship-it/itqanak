import {
  recordAuditEvent,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";

import { isUuid } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import {
  announcementPreview,
  assertSettingsVersion,
  computeGroupUnread,
  groupChannelFingerprint,
  normalizeGroupChannelBody,
} from "./group-channel-logic.js";

export type GroupChannelSenderType = "ADMIN" | "STUDENT" | "SYSTEM";

export interface GroupChannelMessage {
  readonly id: string;
  readonly senderType: GroupChannelSenderType;
  readonly authoredByMe: boolean;
  /** The real author name — populated only when an administrator is viewing, so
   *  students never see who posted another student's message. */
  readonly authorName?: string;
  readonly contentType: "TEXT" | "SYSTEM";
  readonly body: string;
  readonly sentAt: string;
  readonly deleted: boolean;
}

export interface GroupChannelView {
  readonly messages: readonly GroupChannelMessage[];
  readonly membersCanPost: boolean;
  readonly canPost: boolean;
  readonly isAdmin: boolean;
  readonly settingsVersion: number;
  readonly unreadCount: number;
  readonly lastMessageAt?: string;
}

export interface GroupChannelPostInput {
  readonly body?: unknown;
  readonly clientMessageId?: unknown;
}

export interface GroupChannelPostResult {
  readonly message: GroupChannelMessage;
  readonly idempotentReplay: boolean;
}

export interface GroupChannelServiceOptions {
  readonly database: DatabaseClient;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

interface MessageRow {
  readonly id: string;
  readonly sender_type: GroupChannelSenderType;
  readonly sender_user_id: string | null;
  readonly content_type: "TEXT" | "SYSTEM";
  readonly body: string;
  readonly sent_at: Date | string;
  readonly deleted_at: Date | string | null;
  readonly author_name: string | null;
}

interface SettingsRow {
  readonly members_can_post: boolean;
  readonly version: number | string;
}

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("group channel row has an invalid date");
  return parsed;
}

function isAdmin(principal: AuthenticatedPrincipal): boolean {
  return principal.roles.includes("ADMIN");
}

/**
 * The single platform-wide student group. Administrators always post; students
 * post only while `members_can_post` is set. Administrators additionally see the
 * real author of every message for moderation — students never do.
 */
export class GroupChannelService {
  private readonly database: DatabaseClient;

  public constructor(options: GroupChannelServiceOptions) {
    this.database = options.database;
  }

  public async getSettings(): Promise<{ membersCanPost: boolean; version: number }> {
    const [row] = await this.database<SettingsRow[]>`
      SELECT members_can_post, version FROM group_channel_settings WHERE singleton_key = 'group'
    `;
    if (row === undefined) throw new RequestDomainError("CONVERSATION_NOT_FOUND");
    return { membersCanPost: row.members_can_post, version: Number(row.version) };
  }

  public async getView(
    principal: AuthenticatedPrincipal,
    input: { readonly limit?: number } = {},
  ): Promise<GroupChannelView> {
    const admin = isAdmin(principal);
    const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
    const [settings, rows, readRows] = await Promise.all([
      this.getSettings(),
      this.database<MessageRow[]>`
        SELECT
          m.id, m.sender_type, m.sender_user_id, m.content_type,
          CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,
          m.sent_at, m.deleted_at, author.display_name AS author_name
        FROM group_channel_messages m
        LEFT JOIN users author ON author.id = m.sender_user_id
        ORDER BY m.sent_at DESC, m.id DESC
        LIMIT ${limit}
      `,
      this.database<{ last_read_at: Date | string }[]>`
        SELECT last_read_at FROM group_channel_reads WHERE user_id = ${principal.userId}
      `,
    ]);
    const ordered = [...rows].reverse();
    // The real author name is exposed only to an administrator — students never
    // learn who posted another student's message.
    const messages: GroupChannelMessage[] = ordered.map((row) => ({
      id: row.id,
      senderType: row.sender_type,
      authoredByMe: row.sender_user_id === principal.userId,
      ...(admin && row.author_name !== null ? { authorName: row.author_name } : {}),
      contentType: row.content_type,
      body: row.body,
      sentAt: toDate(row.sent_at).toISOString(),
      deleted: row.deleted_at !== null,
    }));
    const lastReadAt = readRows[0] === undefined ? undefined : toDate(readRows[0].last_read_at);
    const unreadCount = computeGroupUnread({
      lastReadAt,
      messageTimes: ordered
        .filter((row) => row.deleted_at === null && row.sender_user_id !== principal.userId)
        .map((row) => toDate(row.sent_at)),
    });
    const lastLive = [...ordered].reverse().find((row) => row.deleted_at === null);
    return {
      messages,
      membersCanPost: settings.membersCanPost,
      canPost: admin || settings.membersCanPost,
      isAdmin: admin,
      settingsVersion: settings.version,
      unreadCount,
      ...(lastLive === undefined ? {} : { lastMessageAt: toDate(lastLive.sent_at).toISOString() }),
    };
  }

  public async post(
    principal: AuthenticatedPrincipal,
    input: GroupChannelPostInput,
    context: RequestAuditContext = {},
  ): Promise<GroupChannelPostResult> {
    const admin = isAdmin(principal);
    const body = normalizeGroupChannelBody(input.body);
    const clientMessageId = typeof input.clientMessageId === "string" ? input.clientMessageId : "";
    if (!isUuid(clientMessageId)) throw new RequestDomainError("INVALID_MESSAGE");
    const fingerprint = groupChannelFingerprint({ body });
    const senderType: GroupChannelSenderType = admin ? "ADMIN" : "STUDENT";

    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      if (!admin) {
        const [settings] = await tx<SettingsRow[]>`
          SELECT members_can_post, version FROM group_channel_settings
          WHERE singleton_key = 'group' FOR SHARE
        `;
        if (settings === undefined || !settings.members_can_post) {
          throw new RequestDomainError("GROUP_CHANNEL_CLOSED");
        }
      }
      const inserted = await tx<{ id: string; sent_at: Date | string }[]>`
        INSERT INTO group_channel_messages (
          sender_type, sender_user_id, content_type, body,
          client_message_id, client_payload_fingerprint
        ) VALUES (
          ${senderType}, ${principal.userId}, 'TEXT', ${body},
          ${clientMessageId}, ${fingerprint}
        )
        ON CONFLICT (sender_user_id, client_message_id)
          WHERE sender_user_id IS NOT NULL AND client_message_id IS NOT NULL
        DO NOTHING
        RETURNING id, sent_at
      `;
      let messageId = inserted[0]?.id;
      let sentAt = inserted[0]?.sent_at;
      const idempotentReplay = messageId === undefined;
      if (messageId === undefined) {
        const [replay] = await tx<
          { id: string; sent_at: Date | string; client_payload_fingerprint: string | null }[]
        >`
          SELECT id, sent_at, client_payload_fingerprint FROM group_channel_messages
          WHERE sender_user_id = ${principal.userId} AND client_message_id = ${clientMessageId}
          LIMIT 1
        `;
        if (replay === undefined || replay.client_payload_fingerprint !== fingerprint) {
          throw new RequestDomainError("IDEMPOTENCY_KEY_REUSED");
        }
        messageId = replay.id;
        sentAt = replay.sent_at;
      } else if (admin) {
        await this.fanOutAnnouncement(tx, principal.userId, messageId, body);
      }
      await recordAuditEvent(tx, {
        ...context,
        eventType: "group_channel.message_posted",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "group_channel_message",
        resourceId: messageId,
        metadata: { senderType, idempotentReplay },
      });
      return {
        idempotentReplay,
        message: {
          id: messageId,
          senderType,
          authoredByMe: true,
          ...(admin ? { authorName: principal.displayName } : {}),
          contentType: "TEXT" as const,
          body,
          sentAt: toDate(sentAt ?? new Date()).toISOString(),
          deleted: false,
        },
      };
    });
  }

  private async fanOutAnnouncement(
    tx: DatabaseClient,
    adminUserId: string,
    messageId: string,
    body: string,
  ): Promise<void> {
    const preview = announcementPreview(body);
    await tx`
      INSERT INTO user_notifications (
        recipient_user_id, kind, title_ar, title_en, body_ar, body_en,
        action_href, idempotency_key
      )
      SELECT
        u.id, 'SYSTEM_ANNOUNCEMENT', 'إعلان جديد من الإدارة', 'New announcement',
        ${preview}, ${preview}, '/conversation?view=group',
        'group-announce:' || ${messageId}::text || ':' || u.id::text
      FROM users u
      INNER JOIN user_roles r ON r.user_id = u.id
      WHERE u.status = 'ACTIVE' AND r.role_code = 'STUDENT' AND u.id <> ${adminUserId}
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
  }

  public async markRead(principal: AuthenticatedPrincipal): Promise<{ unreadCount: 0 }> {
    await this.database`
      INSERT INTO group_channel_reads (user_id, last_read_at, last_read_message_id, updated_at)
      SELECT
        ${principal.userId}, now(),
        (SELECT id FROM group_channel_messages WHERE deleted_at IS NULL
         ORDER BY sent_at DESC, id DESC LIMIT 1),
        now()
      ON CONFLICT (user_id) DO UPDATE
        SET last_read_at = now(),
            last_read_message_id = EXCLUDED.last_read_message_id,
            updated_at = now()
    `;
    return { unreadCount: 0 };
  }

  public async setPolicy(
    principal: AuthenticatedPrincipal,
    input: { readonly membersCanPost?: unknown; readonly expectedVersion?: unknown },
    context: RequestAuditContext = {},
  ): Promise<{ membersCanPost: boolean; version: number }> {
    if (!isAdmin(principal)) throw new RequestDomainError("REQUEST_FORBIDDEN");
    const membersCanPost = input.membersCanPost === true;
    const current = await this.getSettings();
    assertSettingsVersion(input.expectedVersion, current.version);
    if (current.membersCanPost === membersCanPost) {
      return current;
    }
    const [row] = await this.database<SettingsRow[]>`
      UPDATE group_channel_settings
      SET members_can_post = ${membersCanPost},
          version = version + 1,
          updated_by_user_id = ${principal.userId}
      WHERE singleton_key = 'group' AND version = ${current.version}
      RETURNING members_can_post, version
    `;
    if (row === undefined) throw new RequestDomainError("VERSION_CONFLICT");
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "group_channel.policy_changed",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      sessionId: principal.sessionId,
      resourceType: "group_channel_settings",
      resourceId: "group",
      metadata: { membersCanPost },
    });
    return { membersCanPost: row.members_can_post, version: Number(row.version) };
  }

  public async deleteMessage(
    principal: AuthenticatedPrincipal,
    messageId: string,
    context: RequestAuditContext = {},
  ): Promise<void> {
    if (!isUuid(messageId)) throw new RequestDomainError("MESSAGE_NOT_FOUND");
    const admin = isAdmin(principal);
    const rows = await this.database<{ id: string }[]>`
      UPDATE group_channel_messages
      SET deleted_at = now(), deleted_by_user_id = ${principal.userId}
      WHERE id = ${messageId}
        AND deleted_at IS NULL
        AND (${admin} OR sender_user_id = ${principal.userId})
      RETURNING id
    `;
    if (rows.length === 0) throw new RequestDomainError("MESSAGE_NOT_FOUND");
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "group_channel.message_deleted",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      sessionId: principal.sessionId,
      resourceType: "group_channel_message",
      resourceId: messageId,
      metadata: { byAdmin: admin },
    });
  }
}
