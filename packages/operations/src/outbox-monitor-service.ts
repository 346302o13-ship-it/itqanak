import {
  recordAuditEvent,
  requireAdmin,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";

export interface OutboxMonitorFilter {
  readonly status?: "PENDING" | "PROCESSING" | "RETRY" | "DELIVERED" | "DEAD_LETTER";
  readonly typePrefix?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface OutboxEventRow {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId?: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly lastErrorCode?: string;
  readonly createdAt: Date;
  readonly availableAt: Date;
  readonly processedAt?: Date;
}

export interface OutboxMonitorReport {
  readonly items: readonly OutboxEventRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
  readonly stats: {
    readonly pending: number;
    readonly processing: number;
    readonly retry: number;
    readonly delivered: number;
    readonly deadLetter: number;
    /** PENDING/RETRY rows waiting more than an hour — the ones worth a look. */
    readonly stuck: number;
    readonly oldestUnprocessedMinutes: number | null;
  };
  /** The event types with the most rows right now (any status). */
  readonly topTypes: readonly { readonly type: string; readonly count: number }[];
}

interface DbRow {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string | null;
  readonly status: string;
  readonly attempt_count: number | string;
  readonly last_error_code: string | null;
  readonly created_at: Date | string;
  readonly available_at: Date | string;
  readonly processed_at: Date | string | null;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toInt(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

const RETRYABLE = new Set(["DEAD_LETTER", "RETRY"]);

export interface OutboxMonitorServiceOptions {
  readonly database: DatabaseClient;
}

export class OutboxMonitorService {
  private readonly database: DatabaseClient;

  public constructor(options: OutboxMonitorServiceOptions) {
    this.database = options.database;
  }

  public async getReport(
    principal: AuthenticatedPrincipal,
    filter: OutboxMonitorFilter = {},
  ): Promise<OutboxMonitorReport> {
    requirePermission(requireAdmin(principal), "admin.operations.read");
    const pageSize = 25;
    const page =
      Number.isSafeInteger(filter.page) && (filter.page ?? 0) >= 1
        ? Math.min(filter.page ?? 1, 10_000)
        : 1;
    const offset = (page - 1) * pageSize;
    const status =
      filter.status !== undefined &&
      ["PENDING", "PROCESSING", "RETRY", "DELIVERED", "DEAD_LETTER"].includes(filter.status)
        ? filter.status
        : null;
    const prefix = filter.typePrefix?.trim().slice(0, 60);
    const pattern =
      prefix === undefined || prefix.length === 0 ? null : `${prefix.replaceAll("%", "")}%`;

    const [stats, topTypes, count, rows] = await Promise.all([
      this.database<
        {
          readonly pending: string;
          readonly processing: string;
          readonly retry: string;
          readonly delivered: string;
          readonly dead_letter: string;
          readonly stuck: string;
          readonly oldest_minutes: number | string | null;
        }[]
      >`
        SELECT
          count(*) FILTER (WHERE status = 'PENDING')::text AS pending,
          count(*) FILTER (WHERE status = 'PROCESSING')::text AS processing,
          count(*) FILTER (WHERE status = 'RETRY')::text AS retry,
          count(*) FILTER (WHERE status = 'DELIVERED')::text AS delivered,
          count(*) FILTER (WHERE status = 'DEAD_LETTER')::text AS dead_letter,
          count(*) FILTER (
            WHERE status IN ('PENDING', 'RETRY') AND created_at < now() - interval '1 hour'
          )::text AS stuck,
          EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (
            WHERE status IN ('PENDING', 'RETRY', 'PROCESSING')
          ))) / 60 AS oldest_minutes
        FROM outbox_events
      `,
      this.database<{ readonly event_type: string; readonly count: string }[]>`
        SELECT event_type, count(*)::text AS count
        FROM outbox_events
        GROUP BY event_type
        ORDER BY count(*) DESC, event_type ASC
        LIMIT 8
      `,
      this.database.unsafe<{ readonly count: string }[]>(
        `SELECT count(*)::text AS count FROM outbox_events
         WHERE ($1::text IS NULL OR status = $1)
           AND ($2::text IS NULL OR event_type ILIKE $2)`,
        [status, pattern],
      ),
      this.database.unsafe<DbRow[]>(
        `SELECT id, event_type, aggregate_type, aggregate_id, status, attempt_count,
                last_error_code, created_at, available_at, processed_at
         FROM outbox_events
         WHERE ($1::text IS NULL OR status = $1)
           AND ($2::text IS NULL OR event_type ILIKE $2)
         ORDER BY created_at DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [status, pattern, pageSize, offset],
      ),
    ]);

    const stat = stats[0];
    const total = toInt(count[0]?.count ?? "0");
    const oldest = stat?.oldest_minutes;
    return {
      items: rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        aggregateType: row.aggregate_type,
        status: row.status,
        attemptCount: toInt(row.attempt_count),
        createdAt: toDate(row.created_at),
        availableAt: toDate(row.available_at),
        ...(row.aggregate_id === null ? {} : { aggregateId: row.aggregate_id }),
        ...(row.last_error_code === null ? {} : { lastErrorCode: row.last_error_code }),
        ...(row.processed_at === null ? {} : { processedAt: toDate(row.processed_at) }),
      })),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      stats: {
        pending: toInt(stat?.pending ?? "0"),
        processing: toInt(stat?.processing ?? "0"),
        retry: toInt(stat?.retry ?? "0"),
        delivered: toInt(stat?.delivered ?? "0"),
        deadLetter: toInt(stat?.dead_letter ?? "0"),
        stuck: toInt(stat?.stuck ?? "0"),
        oldestUnprocessedMinutes:
          oldest === null || oldest === undefined ? null : Math.round(Number(oldest)),
      },
      topTypes: topTypes.map((entry) => ({ type: entry.event_type, count: toInt(entry.count) })),
    };
  }

  /** Re-queues a dead-lettered (or stuck-retry) event for another delivery attempt. */
  public async retryEvent(
    principal: AuthenticatedPrincipal,
    eventId: string,
    context: RequestAuditContext = {},
  ): Promise<void> {
    requirePermission(requireAdmin(principal), "admin.operations.manage");
    if (!/^[0-9a-f-]{36}$/iu.test(eventId)) {
      throw new Error("Invalid outbox event id.");
    }
    const rows = await this.database<{ readonly id: string; readonly status: string }[]>`
      SELECT id, status FROM outbox_events WHERE id = ${eventId} LIMIT 1
    `;
    const row = rows[0];
    if (row === undefined || !RETRYABLE.has(row.status)) {
      throw new Error("Outbox event cannot be retried.");
    }
    await this.database`
      UPDATE outbox_events
      SET status = 'PENDING', attempt_count = 0, available_at = now(), last_error_code = NULL
      WHERE id = ${eventId} AND status = ${row.status}
    `;
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "PLATFORM_OUTBOX_EVENT_RETRIED",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      sessionId: principal.sessionId,
      resourceType: "outbox_event",
      resourceId: eventId,
      metadata: { previousStatus: row.status },
    });
  }
}
