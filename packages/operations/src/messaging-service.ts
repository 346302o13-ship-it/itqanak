import {
  recordAuditEvent,
  requireAdmin,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";

import {
  MessagingSettingsError,
  announcementLevels,
  type AnnouncementLevel,
  type PlatformMessagingSettings,
  type RuntimeMessagingSettings,
  type UpdateAnnouncementInput,
  type UpdateMessagingContactInput,
} from "./messaging-types.js";

interface MessagingSettingsRow {
  readonly support_whatsapp_e164: string | null;
  readonly whatsapp_notify_recipient_e164: string | null;
  readonly announcement_active: boolean;
  readonly announcement_level: AnnouncementLevel;
  readonly announcement_ar: string | null;
  readonly announcement_en: string | null;
  readonly announcement_published_at: Date | string | null;
  readonly version: number | string;
  readonly updated_at: Date | string;
}

const E164 = /^\+[1-9][0-9]{7,14}$/u;

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MessagingSettingsError("SETTINGS_UNAVAILABLE");
  return parsed;
}

function toSettings(row: MessagingSettingsRow): PlatformMessagingSettings {
  return {
    ...(row.support_whatsapp_e164 === null
      ? {}
      : { supportWhatsAppE164: row.support_whatsapp_e164 }),
    ...(row.whatsapp_notify_recipient_e164 === null
      ? {}
      : { whatsappNotifyRecipientE164: row.whatsapp_notify_recipient_e164 }),
    announcementActive: row.announcement_active,
    announcementLevel: row.announcement_level,
    ...(row.announcement_ar === null ? {} : { announcementAr: row.announcement_ar }),
    ...(row.announcement_en === null ? {} : { announcementEn: row.announcement_en }),
    ...(row.announcement_published_at === null
      ? {}
      : { announcementPublishedAt: toDate(row.announcement_published_at) }),
    version: Number(row.version),
    updatedAt: toDate(row.updated_at),
  };
}

const SELECT_COLUMNS = `
  support_whatsapp_e164,
  whatsapp_notify_recipient_e164,
  announcement_active,
  announcement_level,
  announcement_ar,
  announcement_en,
  announcement_published_at,
  version,
  updated_at
`;

function normalizePhone(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const compact = trimmed.replace(/[\s()-]/gu, "");
  if (!E164.test(compact)) throw new MessagingSettingsError("INVALID_PHONE");
  return compact;
}

function normalizeAnnouncementText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length < 2 || trimmed.length > 600) {
    throw new MessagingSettingsError("INVALID_ANNOUNCEMENT");
  }
  return trimmed;
}

function assertVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new MessagingSettingsError("INVALID_VERSION");
  }
  return parsed;
}

async function readRow(database: DatabaseClient): Promise<MessagingSettingsRow> {
  const rows = await database.unsafe<MessagingSettingsRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM platform_messaging_settings WHERE singleton_key = 'platform' LIMIT 1`,
  );
  const row = rows[0];
  if (row === undefined) throw new MessagingSettingsError("SETTINGS_UNAVAILABLE");
  return row;
}

export interface PlatformMessagingServiceOptions {
  readonly database: DatabaseClient;
}

export class PlatformMessagingService {
  private readonly database: DatabaseClient;

  public constructor(options: PlatformMessagingServiceOptions) {
    this.database = options.database;
  }

  /** Unauthenticated runtime read for the Worker and the announcement endpoint. */
  public async getRuntimeMessaging(): Promise<RuntimeMessagingSettings> {
    const settings = toSettings(await readRow(this.database));
    return {
      ...(settings.supportWhatsAppE164 === undefined
        ? {}
        : { supportWhatsAppE164: settings.supportWhatsAppE164 }),
      ...(settings.whatsappNotifyRecipientE164 === undefined
        ? {}
        : { whatsappNotifyRecipientE164: settings.whatsappNotifyRecipientE164 }),
      ...(settings.announcementActive &&
      settings.announcementAr !== undefined &&
      settings.announcementEn !== undefined
        ? {
            announcement: {
              level: settings.announcementLevel,
              ar: settings.announcementAr,
              en: settings.announcementEn,
              ...(settings.announcementPublishedAt === undefined
                ? {}
                : { publishedAt: settings.announcementPublishedAt }),
            },
          }
        : {}),
    };
  }

  public async getAdminSettings(
    principal: AuthenticatedPrincipal,
  ): Promise<PlatformMessagingSettings> {
    requirePermission(requireAdmin(principal), "admin.operations.read");
    return toSettings(await readRow(this.database));
  }

  /** Delivery health of the registration / request-review WhatsApp notifications. */
  public async getNotifyOutboxStats(principal: AuthenticatedPrincipal): Promise<{
    readonly delivered24h: number;
    readonly queued: number;
    readonly deadLetter: number;
    readonly lastDeliveredAt?: Date;
  }> {
    requirePermission(requireAdmin(principal), "admin.operations.read");
    const rows = await this.database<
      {
        readonly delivered_24h: number | string;
        readonly queued: number | string;
        readonly dead_letter: number | string;
        readonly last_delivered_at: Date | string | null;
      }[]
    >`
      SELECT
        count(*) FILTER (
          WHERE status = 'DELIVERED' AND processed_at >= now() - interval '24 hours'
        )::text AS delivered_24h,
        count(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING', 'RETRY'))::text AS queued,
        count(*) FILTER (WHERE status = 'DEAD_LETTER')::text AS dead_letter,
        max(processed_at) FILTER (WHERE status = 'DELIVERED') AS last_delivered_at
      FROM outbox_events
      WHERE event_type IN ('ACCOUNT_REGISTRATION_CREATED', 'REQUEST_NEEDS_REVIEW')
    `;
    const row = rows[0];
    if (row === undefined) throw new MessagingSettingsError("SETTINGS_UNAVAILABLE");
    return {
      delivered24h: Number(row.delivered_24h),
      queued: Number(row.queued),
      deadLetter: Number(row.dead_letter),
      ...(row.last_delivered_at === null ? {} : { lastDeliveredAt: toDate(row.last_delivered_at) }),
    };
  }

  public async updateContact(
    principal: AuthenticatedPrincipal,
    input: UpdateMessagingContactInput,
    context: RequestAuditContext = {},
  ): Promise<PlatformMessagingSettings> {
    requirePermission(requireAdmin(principal), "admin.operations.manage");
    const expectedVersion = assertVersion(input.expectedVersion);
    const support = normalizePhone(input.supportWhatsAppE164);
    const recipient = normalizePhone(input.whatsappNotifyRecipientE164);
    return this.applyUpdate(
      principal,
      context,
      expectedVersion,
      `support_whatsapp_e164 = $1, whatsapp_notify_recipient_e164 = $2`,
      [support, recipient],
      "PLATFORM_MESSAGING_CONTACT_UPDATED",
      { supportConfigured: support !== null, recipientConfigured: recipient !== null },
    );
  }

  public async updateAnnouncement(
    principal: AuthenticatedPrincipal,
    input: UpdateAnnouncementInput,
    context: RequestAuditContext = {},
  ): Promise<PlatformMessagingSettings> {
    requirePermission(requireAdmin(principal), "admin.operations.manage");
    const expectedVersion = assertVersion(input.expectedVersion);
    if (!(announcementLevels as readonly string[]).includes(input.level)) {
      throw new MessagingSettingsError("INVALID_ANNOUNCEMENT");
    }
    const ar = normalizeAnnouncementText(input.ar);
    const en = normalizeAnnouncementText(input.en);
    const active = input.active === true;
    if (active && (ar === null || en === null)) {
      throw new MessagingSettingsError("INVALID_ANNOUNCEMENT");
    }
    return this.applyUpdate(
      principal,
      context,
      expectedVersion,
      `announcement_active = $1, announcement_level = $2, announcement_ar = $3,
       announcement_en = $4,
       announcement_published_at = CASE WHEN $1 THEN COALESCE(announcement_published_at, now()) ELSE NULL END`,
      [active, input.level, ar, en],
      "PLATFORM_MESSAGING_ANNOUNCEMENT_UPDATED",
      { active, level: input.level },
    );
  }

  private async applyUpdate(
    principal: AuthenticatedPrincipal,
    context: RequestAuditContext,
    expectedVersion: number,
    assignments: string,
    values: readonly (string | number | boolean | null)[],
    eventType: string,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<PlatformMessagingSettings> {
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const versionParam = values.length + 1;
      const actorParam = values.length + 2;
      const rows = await tx.unsafe<MessagingSettingsRow[]>(
        `UPDATE platform_messaging_settings
         SET ${assignments}, version = version + 1, updated_by_user_id = $${actorParam}
         WHERE singleton_key = 'platform' AND version = $${versionParam}
         RETURNING ${SELECT_COLUMNS}`,
        [...values, expectedVersion, principal.userId],
      );
      const row = rows[0];
      if (row === undefined) {
        const current = await tx.unsafe<{ readonly version: number }[]>(
          `SELECT version FROM platform_messaging_settings WHERE singleton_key = 'platform' LIMIT 1`,
        );
        throw new MessagingSettingsError(
          current.length === 0 ? "SETTINGS_UNAVAILABLE" : "VERSION_CONFLICT",
        );
      }
      const settings = toSettings(row);
      await recordAuditEvent(tx, {
        ...context,
        eventType,
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        sessionId: principal.sessionId,
        metadata: { ...metadata, version: settings.version },
      });
      return settings;
    });
  }
}
