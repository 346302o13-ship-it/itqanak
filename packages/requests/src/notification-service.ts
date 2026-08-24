import {
  recordAuditEvent,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";

import { isUuid, normalizeBoundedPage } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import {
  notificationKinds,
  type MarkNotificationsReadResult,
  type NotificationKind,
  type NotificationListInput,
  type NotificationListResult,
  type UserNotification,
} from "./types.js";

interface NotificationRow {
  readonly id: string;
  readonly kind: string;
  readonly conversation_id: string | null;
  readonly request_id: string | null;
  readonly message_id: string | null;
  readonly quote_id: string | null;
  readonly title_ar: string;
  readonly title_en: string;
  readonly body_ar: string | null;
  readonly body_en: string | null;
  readonly action_href: string | null;
  readonly created_at: Date | string;
  readonly read_at: Date | string | null;
}

interface CountRow {
  readonly count: number | string;
}

export interface NotificationServiceOptions {
  readonly database: DatabaseClient;
}

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Notification contains an invalid date.");
  return parsed;
}

function toCount(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid notification count.");
  return parsed;
}

function toKind(value: string): NotificationKind {
  if (!(notificationKinds as readonly string[]).includes(value)) {
    throw new Error("Notification contains an invalid kind.");
  }
  return value as NotificationKind;
}

function toNotification(row: NotificationRow): UserNotification {
  return {
    id: row.id,
    kind: toKind(row.kind),
    ...(row.conversation_id === null ? {} : { conversationId: row.conversation_id }),
    ...(row.request_id === null ? {} : { requestId: row.request_id }),
    ...(row.message_id === null ? {} : { messageId: row.message_id }),
    ...(row.quote_id === null ? {} : { quoteId: row.quote_id }),
    titleAr: row.title_ar,
    titleEn: row.title_en,
    ...(row.body_ar === null ? {} : { bodyAr: row.body_ar }),
    ...(row.body_en === null ? {} : { bodyEn: row.body_en }),
    ...(row.action_href === null ? {} : { actionHref: row.action_href }),
    createdAt: toDate(row.created_at),
    ...(row.read_at === null ? {} : { readAt: toDate(row.read_at) }),
  };
}

export class NotificationService {
  private readonly database: DatabaseClient;

  public constructor(options: NotificationServiceOptions) {
    this.database = options.database;
  }

  public async listNotifications(
    principal: AuthenticatedPrincipal,
    input: NotificationListInput = {},
  ): Promise<NotificationListResult> {
    requirePermission(principal, "notifications.read.own");
    const { page, pageSize, offset } = normalizeBoundedPage(input.page, input.pageSize, 100);
    const unreadOnly = input.unreadOnly === true;
    const [totalRows, unreadRows, rows] = await Promise.all([
      this.database<CountRow[]>`
        SELECT count(*)::text AS count FROM user_notifications
        WHERE recipient_user_id = ${principal.userId}
          AND (${unreadOnly} = false OR read_at IS NULL)
      `,
      this.database<CountRow[]>`
        SELECT count(*)::text AS count FROM user_notifications
        WHERE recipient_user_id = ${principal.userId} AND read_at IS NULL
      `,
      this.database<NotificationRow[]>`
        SELECT id, kind, conversation_id, request_id, message_id, quote_id,
               title_ar, title_en, body_ar, body_en, action_href, created_at, read_at
        FROM user_notifications
        WHERE recipient_user_id = ${principal.userId}
          AND (${unreadOnly} = false OR read_at IS NULL)
        ORDER BY created_at DESC, id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
    ]);
    const total = toCount(totalRows[0]?.count ?? "0");
    return {
      items: rows.map(toNotification),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      unreadCount: toCount(unreadRows[0]?.count ?? "0"),
    };
  }

  public async getUnreadCount(principal: AuthenticatedPrincipal): Promise<number> {
    requirePermission(principal, "notifications.read.own");
    const rows = await this.database<CountRow[]>`
      SELECT count(*)::text AS count FROM user_notifications
      WHERE recipient_user_id = ${principal.userId} AND read_at IS NULL
    `;
    return toCount(rows[0]?.count ?? "0");
  }

  public async markRead(
    principal: AuthenticatedPrincipal,
    notificationId: string,
    context: RequestAuditContext = {},
  ): Promise<MarkNotificationsReadResult> {
    requirePermission(principal, "notifications.read.own");
    if (!isUuid(notificationId)) throw new RequestDomainError("NOTIFICATION_NOT_FOUND");
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const existing = await tx<{ readonly id: string; readonly read_at: Date | null }[]>`
        SELECT id, read_at FROM user_notifications
        WHERE id = ${notificationId} AND recipient_user_id = ${principal.userId}
        FOR UPDATE
      `;
      if (existing[0] === undefined) throw new RequestDomainError("NOTIFICATION_NOT_FOUND");
      const updated = await tx<{ readonly id: string }[]>`
        UPDATE user_notifications SET read_at = now()
        WHERE id = ${notificationId} AND recipient_user_id = ${principal.userId}
          AND read_at IS NULL
        RETURNING id
      `;
      if (updated.length > 0) {
        await recordAuditEvent(tx, {
          ...context,
          eventType: "notification.read",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: principal.userId,
          sessionId: principal.sessionId,
          resourceType: "user_notification",
          resourceId: notificationId,
        });
      }
      return {
        updatedCount: updated.length,
        unreadCount: await this.unreadCountIn(tx, principal.userId),
      };
    });
  }

  public async markAllRead(
    principal: AuthenticatedPrincipal,
    context: RequestAuditContext = {},
  ): Promise<MarkNotificationsReadResult> {
    requirePermission(principal, "notifications.read.own");
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const updated = await tx<{ readonly id: string }[]>`
        UPDATE user_notifications SET read_at = now()
        WHERE recipient_user_id = ${principal.userId} AND read_at IS NULL
        RETURNING id
      `;
      if (updated.length > 0) {
        await recordAuditEvent(tx, {
          ...context,
          eventType: "notifications.all_read",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          targetUserId: principal.userId,
          sessionId: principal.sessionId,
          metadata: { notificationCount: updated.length },
        });
      }
      return { updatedCount: updated.length, unreadCount: 0 };
    });
  }

  private async unreadCountIn(database: DatabaseClient, userId: string): Promise<number> {
    const rows = await database<CountRow[]>`
      SELECT count(*)::text AS count FROM user_notifications
      WHERE recipient_user_id = ${userId} AND read_at IS NULL
    `;
    return toCount(rows[0]?.count ?? "0");
  }
}
