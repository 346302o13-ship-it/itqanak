import "server-only";

import { requireAdmin, requirePermission, type AuthenticatedPrincipal } from "@itqanak/auth";
import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";

import {
  maskOperationalPhone,
  whatsappHealth,
  workerHealth,
  type MonitoringHealth,
} from "./admin-monitoring-presenters";
import {
  monitoringWhatsAppConfigured,
  type MonitoringWhatsAppConfiguration,
} from "./admin-monitoring-config";

export type { MonitoringHealth } from "./admin-monitoring-presenters";

export interface AdminMonitoringSnapshot {
  readonly capturedAt: Date;
  readonly worker: {
    readonly health: MonitoringHealth;
    readonly activeCount: number;
    readonly lastSeenAt?: Date;
  };
  readonly whatsapp: {
    readonly health: MonitoringHealth;
    readonly mode: AppConfig["whatsapp"]["mode"];
    readonly configured: boolean;
    readonly recipientMasked?: string;
    readonly delivered24Hours: number;
    readonly queued: number;
    readonly deadLetter: number;
    readonly lastDeliveredAt?: Date;
  };
  readonly platform: {
    readonly maintenanceEnabled: boolean;
    readonly fileScanQueuePaused: boolean;
    readonly fileScannerObservedState: string;
    readonly fileScannerObservedAt?: Date;
  };
  readonly files: {
    readonly stored: number;
    readonly explicitlyUnscanned: number;
    readonly pendingScan: number;
    readonly blocked: number;
  };
  readonly activity: {
    readonly conversations: number;
    readonly messages24Hours: number;
    readonly unreadNotifications: number;
    readonly staleUnreadNotifications: number;
    readonly pendingQuotes: number;
    readonly activeRequests: number;
    readonly pendingAccounts: number;
  };
  readonly automation: {
    readonly outboxPending: number;
    readonly outboxDeadLetter: number;
    readonly outboxOldestPendingAgeSeconds: number;
  };
  readonly requestStatuses: readonly {
    readonly status: string;
    readonly count: number;
  }[];
  readonly recentAutomationProblems: readonly {
    readonly id: string;
    readonly eventType: string;
    readonly status: "RETRY" | "DEAD_LETTER";
    readonly attemptCount: number;
    readonly errorCode?: string;
    readonly createdAt: Date;
    readonly availableAt: Date;
  }[];
}

interface MonitoringRow {
  readonly captured_at: Date | string;
  readonly worker_last_seen_at: Date | string | null;
  readonly active_worker_count: number | string;
  readonly whatsapp_delivered_24h: number | string;
  readonly whatsapp_queued: number | string;
  readonly whatsapp_dead_letter: number | string;
  readonly whatsapp_last_delivered_at: Date | string | null;
  readonly outbox_pending_total: number | string;
  readonly outbox_dead_letter_total: number | string;
  readonly outbox_oldest_pending_age_seconds: number | string;
  readonly maintenance_enabled: boolean;
  readonly file_scan_queue_paused: boolean;
  readonly file_scanner_observed_state: string;
  readonly file_scanner_observed_at: Date | string | null;
  readonly stored_attachments: number | string;
  readonly unscanned_attachments: number | string;
  readonly pending_scan_attachments: number | string;
  readonly blocked_attachments: number | string;
  readonly conversation_count: number | string;
  readonly messages_24h: number | string;
  readonly unread_notifications: number | string;
  readonly stale_unread_notifications: number | string;
  readonly pending_quotes: number | string;
  readonly active_requests: number | string;
  readonly pending_accounts: number | string;
}

interface RequestStatusRow {
  readonly status: string;
  readonly count: number | string;
}

interface AutomationProblemRow {
  readonly id: string;
  readonly event_type: string;
  readonly status: "RETRY" | "DEAD_LETTER";
  readonly attempt_count: number | string;
  readonly last_error_code: string | null;
  readonly created_at: Date | string;
  readonly available_at: Date | string;
}

function count(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Monitoring returned an invalid ${field}.`);
  }
  return parsed;
}

function date(value: Date | string, field: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Monitoring returned an invalid ${field}.`);
  }
  return parsed;
}

export async function loadAdminMonitoringSnapshot(
  database: DatabaseClient,
  principal: AuthenticatedPrincipal,
  whatsapp: MonitoringWhatsAppConfiguration,
): Promise<AdminMonitoringSnapshot> {
  requirePermission(requireAdmin(principal), "admin.operations.read");
  const whatsappNotificationFence = whatsapp.notificationsNotBefore ?? new Date();

  const [summaryRows, requestStatusRows, problemRows] = await Promise.all([
    database<MonitoringRow[]>`
      WITH attachments AS (
        SELECT storage_status, scan_status
        FROM service_request_attachments
        WHERE deleted_at IS NULL
        UNION ALL
        SELECT storage_status, scan_status
        FROM unified_conversation_attachments
        WHERE deleted_at IS NULL
      ), operations AS (
        SELECT maintenance_enabled, file_scan_queue_paused,
               file_scanner_observed_state, file_scanner_observed_at
        FROM platform_operational_settings
        WHERE singleton_key = 'platform'
      )
      SELECT
        now() AS captured_at,
        (SELECT max(last_seen_at) FROM worker_heartbeats) AS worker_last_seen_at,
        (SELECT count(*)::text FROM worker_heartbeats
          WHERE last_seen_at >= now() - interval '2 minutes') AS active_worker_count,
        (SELECT count(*)::text FROM outbox_events
          WHERE event_type IN ('ACCOUNT_REGISTRATION_CREATED', 'REQUEST_NEEDS_REVIEW')
            AND created_at >= ${whatsappNotificationFence}
            AND status = 'DELIVERED'
            AND processed_at >= now() - interval '24 hours') AS whatsapp_delivered_24h,
        (SELECT count(*)::text FROM outbox_events
          WHERE event_type IN ('ACCOUNT_REGISTRATION_CREATED', 'REQUEST_NEEDS_REVIEW')
            AND created_at >= ${whatsappNotificationFence}
            AND status IN ('PENDING', 'PROCESSING', 'RETRY')) AS whatsapp_queued,
        (SELECT count(*)::text FROM outbox_events
          WHERE event_type IN ('ACCOUNT_REGISTRATION_CREATED', 'REQUEST_NEEDS_REVIEW')
            AND created_at >= ${whatsappNotificationFence}
            AND status = 'DEAD_LETTER') AS whatsapp_dead_letter,
        (SELECT max(processed_at) FROM outbox_events
          WHERE event_type IN ('ACCOUNT_REGISTRATION_CREATED', 'REQUEST_NEEDS_REVIEW')
            AND created_at >= ${whatsappNotificationFence}
            AND status = 'DELIVERED') AS whatsapp_last_delivered_at,
        (SELECT count(*)::text FROM outbox_events
          WHERE status IN ('PENDING', 'PROCESSING', 'RETRY')) AS outbox_pending_total,
        (SELECT count(*)::text FROM outbox_events
          WHERE status = 'DEAD_LETTER') AS outbox_dead_letter_total,
        (SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at)))::bigint, 0)::text
          FROM outbox_events
          WHERE status IN ('PENDING', 'PROCESSING', 'RETRY')) AS outbox_oldest_pending_age_seconds,
        operations.maintenance_enabled,
        operations.file_scan_queue_paused,
        operations.file_scanner_observed_state,
        operations.file_scanner_observed_at,
        (SELECT count(*)::text FROM attachments
          WHERE storage_status = 'STORED') AS stored_attachments,
        (SELECT count(*)::text FROM attachments
          WHERE storage_status = 'STORED'
            AND scan_status = 'SCAN_SKIPPED_BY_ADMIN') AS unscanned_attachments,
        (SELECT count(*)::text FROM attachments
          WHERE storage_status = 'STORED'
            AND scan_status = 'PENDING_SCAN') AS pending_scan_attachments,
        (SELECT count(*)::text FROM attachments
          WHERE scan_status IN ('INFECTED', 'REJECTED', 'SCAN_ERROR')) AS blocked_attachments,
        (SELECT count(*)::text FROM support_conversations) AS conversation_count,
        (SELECT count(*)::text FROM support_messages
          WHERE sent_at >= now() - interval '24 hours') AS messages_24h,
        (SELECT count(*)::text FROM user_notifications
          WHERE read_at IS NULL) AS unread_notifications,
        (SELECT count(*)::text FROM user_notifications
          WHERE read_at IS NULL
            AND created_at < now() - interval '24 hours') AS stale_unread_notifications,
        (SELECT count(*)::text FROM service_quotes
          WHERE status = 'PENDING' AND expires_at > now()) AS pending_quotes,
        (SELECT count(*)::text FROM service_requests
          WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')) AS active_requests,
        (SELECT count(*)::text FROM users
          WHERE status = 'PENDING_VERIFICATION'
            AND phone_verification_status = 'PENDING') AS pending_accounts
      FROM operations
    `,
    database<RequestStatusRow[]>`
      SELECT status, count(*)::text AS count
      FROM service_requests
      GROUP BY status
      ORDER BY count(*) DESC, status ASC
    `,
    database<AutomationProblemRow[]>`
      SELECT id, event_type, status, attempt_count, last_error_code, created_at, available_at
      FROM outbox_events
      WHERE status IN ('RETRY', 'DEAD_LETTER')
        AND (
          event_type IN ('ATTACHMENT_SCAN_REQUESTED', 'UNIFIED_ATTACHMENT_SCAN_REQUESTED')
          OR (
            event_type IN ('ACCOUNT_REGISTRATION_CREATED', 'REQUEST_NEEDS_REVIEW')
            AND created_at >= ${whatsappNotificationFence}
          )
        )
      ORDER BY created_at DESC, id DESC
      LIMIT 12
    `,
  ]);

  const row = summaryRows[0];
  if (row === undefined) throw new Error("Platform monitoring settings are unavailable.");
  const capturedAt = date(row.captured_at, "capture time");
  const lastSeenAt =
    row.worker_last_seen_at === null
      ? undefined
      : date(row.worker_last_seen_at, "worker heartbeat");
  const delivered24Hours = count(row.whatsapp_delivered_24h, "WhatsApp delivery count");
  const queued = count(row.whatsapp_queued, "WhatsApp queue count");
  const deadLetter = count(row.whatsapp_dead_letter, "WhatsApp dead-letter count");
  const configured = monitoringWhatsAppConfigured(whatsapp);
  const maskedRecipient = maskOperationalPhone(whatsapp.supportRecipientE164);

  return {
    capturedAt,
    worker: {
      health: workerHealth(capturedAt, lastSeenAt),
      activeCount: count(row.active_worker_count, "active worker count"),
      ...(lastSeenAt === undefined ? {} : { lastSeenAt }),
    },
    whatsapp: {
      health: whatsappHealth({
        mode: whatsapp.mode,
        configured,
        delivered24Hours,
        queued,
        deadLetter,
      }),
      mode: whatsapp.mode,
      configured,
      ...(maskedRecipient === undefined ? {} : { recipientMasked: maskedRecipient }),
      delivered24Hours,
      queued,
      deadLetter,
      ...(row.whatsapp_last_delivered_at === null
        ? {}
        : { lastDeliveredAt: date(row.whatsapp_last_delivered_at, "WhatsApp delivery time") }),
    },
    platform: {
      maintenanceEnabled: row.maintenance_enabled,
      fileScanQueuePaused: row.file_scan_queue_paused,
      fileScannerObservedState: row.file_scanner_observed_state,
      ...(row.file_scanner_observed_at === null
        ? {}
        : { fileScannerObservedAt: date(row.file_scanner_observed_at, "scanner observation") }),
    },
    files: {
      stored: count(row.stored_attachments, "stored attachment count"),
      explicitlyUnscanned: count(row.unscanned_attachments, "unscanned attachment count"),
      pendingScan: count(row.pending_scan_attachments, "pending scan attachment count"),
      blocked: count(row.blocked_attachments, "blocked attachment count"),
    },
    activity: {
      conversations: count(row.conversation_count, "conversation count"),
      messages24Hours: count(row.messages_24h, "message count"),
      unreadNotifications: count(row.unread_notifications, "unread notification count"),
      staleUnreadNotifications: count(row.stale_unread_notifications, "stale notification count"),
      pendingQuotes: count(row.pending_quotes, "pending quote count"),
      activeRequests: count(row.active_requests, "active request count"),
      pendingAccounts: count(row.pending_accounts, "pending account count"),
    },
    automation: {
      outboxPending: count(row.outbox_pending_total, "outbox pending count"),
      outboxDeadLetter: count(row.outbox_dead_letter_total, "outbox dead-letter count"),
      outboxOldestPendingAgeSeconds: count(
        row.outbox_oldest_pending_age_seconds,
        "outbox oldest pending age",
      ),
    },
    requestStatuses: requestStatusRows.map((statusRow) => ({
      status: statusRow.status,
      count: count(statusRow.count, "request status count"),
    })),
    recentAutomationProblems: problemRows.map((problem) => ({
      id: problem.id,
      eventType: problem.event_type,
      status: problem.status,
      attemptCount: count(problem.attempt_count, "automation attempt count"),
      ...(problem.last_error_code === null ? {} : { errorCode: problem.last_error_code }),
      createdAt: date(problem.created_at, "automation creation time"),
      availableAt: date(problem.available_at, "automation availability time"),
    })),
  };
}
