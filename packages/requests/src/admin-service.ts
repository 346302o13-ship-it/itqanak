import { createHash } from "node:crypto";

import {
  recordAuditEvent,
  requirePermission,
  requireRole,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import {
  canTransitionRequest,
  isRequestStatus,
  type JsonObject,
  type RequestStatus,
} from "@itqanak/core";
import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

import { isUuid, normalizeBoundedPage } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import {
  canArchivePendingRequest,
  isStalePendingStatus,
  stalePendingRequestReason,
} from "./pending-requests.js";
import type {
  AcademicLevel,
  AdminCreateRequestInput,
  ArchivePendingRequestsInput,
  ArchivePendingRequestsResult,
  AdminRequestDetail,
  AdminRequestEditInput,
  AdminRequestListInput,
  AdminRequestListResult,
  AdminRequestSummary,
  AdminRequestTransitionInput,
  AssignRequestInput,
  AttachmentScanStatus,
  AttachmentStorageStatus,
  CreatedDraftResult,
  RequestAssignmentSummary,
  RequestAttachmentSummary,
  RequestEventSummary,
  RequestLanguageCode,
  RequestUrgency,
  StalePendingRequestFilter,
  StalePendingRequestItem,
  StalePendingRequestReport,
} from "./types.js";
import {
  assertRequestFieldsSubmittable,
  normalizeDraftRequestInput,
  requestSubmissionFingerprint,
} from "./validation.js";

interface AdminRequestRow {
  readonly id: string;
  readonly request_number: string;
  readonly student_user_id: string;
  readonly student_display_name: string;
  readonly student_phone_e164: string | null;
  readonly student_country_code: string | null;
  readonly student_phone_verified_at: Date | string | null;
  readonly service_id: string;
  readonly service_slug: string;
  readonly service_name_ar: string;
  readonly status: string;
  readonly title: string;
  readonly description: string;
  readonly deadline_at: Date | string | null;
  readonly urgency: string;
  readonly budget_amount: string | number | null;
  readonly budget_currency: string | null;
  readonly language_code: string | null;
  readonly academic_level: string | null;
  readonly institution_name: string | null;
  readonly privacy_requested: boolean;
  readonly submission_fingerprint: string;
  readonly academic_integrity_version: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly submitted_at: Date | string | null;
  readonly cancelled_at: Date | string | null;
  readonly completed_at: Date | string | null;
  readonly version: number | string;
  readonly conversation_id: string;
  readonly assignment_id: string | null;
  readonly assigned_admin_user_id: string | null;
  readonly assigned_admin_display_name: string | null;
  readonly assigned_at: Date | string | null;
  readonly unread_message_count: number | string;
}

interface CountRow {
  readonly count: number | string;
}

interface StalePendingStatRow {
  readonly total: string;
  readonly draft: string;
  readonly submitted: string;
  readonly under_review: string;
  readonly quoted: string;
  readonly filtered_total: string;
}

interface StalePendingRow {
  readonly id: string;
  readonly request_number: string;
  readonly status: string;
  readonly title: string;
  readonly student_user_id: string;
  readonly student_display_name: string;
  readonly service_name_ar: string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly days_pending: number | string;
  readonly has_financial_record: boolean;
  readonly archived_at: Date | string | null;
  readonly archived_by_name: string | null;
  readonly archive_reason: string | null;
}

interface ArchiveTargetRow {
  readonly id: string;
  readonly status: string;
  readonly archived_at: Date | string | null;
  readonly has_financial_record: boolean;
}

interface RequestEventRow {
  readonly id: number | string;
  readonly event_type: string;
  readonly from_status: string | null;
  readonly to_status: string | null;
  readonly request_version: number | string;
  readonly created_at: Date | string;
}

interface AttachmentRow {
  readonly id: string;
  readonly original_filename: string;
  readonly detected_mime_type: string | null;
  readonly declared_mime_type: string;
  readonly size_bytes: number | string;
  readonly storage_status: string;
  readonly scan_status: string;
  readonly created_at: Date | string;
  readonly deleted_at: Date | string | null;
}

interface AssignmentRow {
  readonly id: string;
  readonly assigned_admin_user_id: string;
}

interface ServiceRow {
  readonly id: string;
  readonly active: boolean;
  readonly category_active: boolean;
}

export interface AdminRequestServiceOptions {
  readonly database: DatabaseClient;
  readonly config?: Pick<AppConfig, "academicIntegrityVersion">;
  readonly logger?: Logger;
}

const assignmentJoin = `
  LEFT JOIN LATERAL (
    SELECT assignments.id AS assignment_id, assignments.assigned_admin_user_id,
           administrators.display_name AS assigned_admin_display_name,
           assignments.assigned_at
    FROM service_request_assignments AS assignments
    INNER JOIN users AS administrators ON administrators.id = assignments.assigned_admin_user_id
    WHERE assignments.request_id = requests.id AND assignments.unassigned_at IS NULL
    LIMIT 1
  ) AS current_assignment ON TRUE
`;

const adminRequestSelect = `
  requests.id, requests.request_number, requests.student_user_id,
  students.display_name AS student_display_name, students.phone_e164 AS student_phone_e164,
  students.country_code AS student_country_code,
  students.phone_verified_at AS student_phone_verified_at,
  requests.service_id, services.slug AS service_slug, services.name_ar AS service_name_ar,
  requests.status, requests.title, requests.description, requests.deadline_at,
  requests.urgency, requests.budget_amount, requests.budget_currency,
  requests.language_code, requests.academic_level, requests.institution_name,
  requests.privacy_requested, requests.submission_fingerprint,
  requests.academic_integrity_version,
  requests.created_at, requests.updated_at, requests.submitted_at,
  requests.cancelled_at, requests.completed_at, requests.version,
  conversations.id AS conversation_id, current_assignment.assignment_id,
  current_assignment.assigned_admin_user_id,
  current_assignment.assigned_admin_display_name, current_assignment.assigned_at
`;

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Administrative request row contains an invalid timestamp.");
  }
  return parsed;
}

function optionalDate(value: Date | string | null): Date | undefined {
  return value === null ? undefined : toDate(value);
}

function toSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Administrative request row contains an invalid ${field}.`);
  }
  return parsed;
}

function toStatus(value: string): RequestStatus {
  if (!isRequestStatus(value)) {
    throw new Error("Administrative request row contains an unsupported status.");
  }
  return value;
}

function optionalStatus(value: string | null): RequestStatus | undefined {
  return value === null ? undefined : toStatus(value);
}

function toUrgency(value: string): RequestUrgency {
  if (value !== "NORMAL" && value !== "URGENT") {
    throw new Error("Administrative request row contains an unsupported urgency.");
  }
  return value;
}

function toLanguage(value: string | null): RequestLanguageCode | undefined {
  if (value === null) {
    return undefined;
  }
  if (
    value !== "ar" &&
    value !== "en" &&
    value !== "fr" &&
    value !== "de" &&
    value !== "es" &&
    value !== "tr"
  ) {
    throw new Error("Administrative request row contains an unsupported language.");
  }
  return value;
}

function toAcademicLevel(value: string | null): AcademicLevel | undefined {
  if (value === null) {
    return undefined;
  }
  if (
    value !== "SECONDARY" &&
    value !== "DIPLOMA" &&
    value !== "BACHELOR" &&
    value !== "MASTER" &&
    value !== "DOCTORATE" &&
    value !== "PROFESSIONAL" &&
    value !== "OTHER"
  ) {
    throw new Error("Administrative request row contains an unsupported academic level.");
  }
  return value;
}

function toAssignment(row: AdminRequestRow): RequestAssignmentSummary | undefined {
  if (
    row.assignment_id === null ||
    row.assigned_admin_user_id === null ||
    row.assigned_admin_display_name === null ||
    row.assigned_at === null
  ) {
    return undefined;
  }
  return {
    id: row.assignment_id,
    adminUserId: row.assigned_admin_user_id,
    adminDisplayName: row.assigned_admin_display_name,
    assignedAt: toDate(row.assigned_at),
  };
}

function toSummary(row: AdminRequestRow): AdminRequestSummary {
  const assignment = toAssignment(row);
  return {
    id: row.id,
    requestNumber: row.request_number,
    serviceId: row.service_id,
    serviceSlug: row.service_slug,
    serviceNameAr: row.service_name_ar,
    status: toStatus(row.status),
    title: row.title,
    ...(row.deadline_at === null ? {} : { deadlineAt: toDate(row.deadline_at) }),
    urgency: toUrgency(row.urgency),
    version: toSafeInteger(row.version, "version"),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    studentUserId: row.student_user_id,
    studentDisplayName: row.student_display_name,
    ...(row.student_phone_e164 === null ? {} : { studentPhoneE164: row.student_phone_e164 }),
    ...(row.student_country_code === "SA" ||
    row.student_country_code === "AE" ||
    row.student_country_code === "KW"
      ? { studentCountryCode: row.student_country_code }
      : {}),
    studentPhoneVerified: row.student_phone_verified_at !== null,
    ...(assignment === undefined ? {} : { assignment }),
    conversationId: row.conversation_id,
    unreadMessageCount: toSafeInteger(row.unread_message_count, "unread_message_count"),
  };
}

function toStorageStatus(value: string): AttachmentStorageStatus {
  if (
    value !== "PENDING_UPLOAD" &&
    value !== "STORED" &&
    value !== "DELETE_PENDING" &&
    value !== "DELETED" &&
    value !== "UPLOAD_FAILED"
  ) {
    throw new Error("Administrative attachment row contains an unsupported storage status.");
  }
  return value;
}

function toScanStatus(value: string): AttachmentScanStatus {
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
    throw new Error("Administrative attachment row contains an unsupported scan status.");
  }
  return value;
}

function toEvent(row: RequestEventRow): RequestEventSummary {
  const fromStatus = optionalStatus(row.from_status);
  const toStatusValue = optionalStatus(row.to_status);
  return {
    id: String(row.id),
    eventType: row.event_type,
    ...(fromStatus === undefined ? {} : { fromStatus }),
    ...(toStatusValue === undefined ? {} : { toStatus: toStatusValue }),
    requestVersion: toSafeInteger(row.request_version, "request_version"),
    createdAt: toDate(row.created_at),
  };
}

function toAttachment(row: AttachmentRow): RequestAttachmentSummary {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    ...(row.detected_mime_type === null ? {} : { detectedMimeType: row.detected_mime_type }),
    declaredMimeType: row.declared_mime_type,
    sizeBytes: toSafeInteger(row.size_bytes, "size_bytes"),
    storageStatus: toStorageStatus(row.storage_status),
    scanStatus: toScanStatus(row.scan_status),
    createdAt: toDate(row.created_at),
    ...(row.deleted_at === null ? {} : { deletedAt: toDate(row.deleted_at) }),
  };
}

function assertExpectedVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

export class AdminRequestService {
  private readonly database: DatabaseClient;
  private readonly academicIntegrityVersion: string;
  private readonly logger: Logger | undefined;

  public constructor(options: AdminRequestServiceOptions) {
    this.database = options.database;
    this.academicIntegrityVersion =
      options.config?.academicIntegrityVersion.trim() || "admin-assisted-request";
    this.logger = options.logger;
  }

  public async createRequestForStudent(
    principal: AuthenticatedPrincipal,
    input: AdminCreateRequestInput,
    context: RequestAuditContext = {},
  ): Promise<CreatedDraftResult> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.manage");
    if (!isUuid(input.studentUserId)) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const students = await tx<{ readonly id: string }[]>`
        SELECT users.id
        FROM users
        INNER JOIN user_roles ON user_roles.user_id = users.id
          AND user_roles.role_code = 'STUDENT'
        WHERE users.id = ${input.studentUserId} AND users.status = 'ACTIVE'
        LIMIT 1
        FOR SHARE OF users
      `;
      if (students[0] === undefined) {
        throw new RequestDomainError("REQUEST_NOT_FOUND");
      }
      // Resolve the student before validating the mutable request fields. This
      // keeps a missing student on the documented not-found path even when the
      // submitted draft is incomplete, and avoids leaking validation ordering.
      const normalized = normalizeDraftRequestInput(input);
      const submitImmediately = input.submitImmediately !== false;
      if (submitImmediately) assertRequestFieldsSubmittable(normalized);
      const baseFingerprint = requestSubmissionFingerprint(normalized.serviceId, normalized);
      const fingerprint = createHash("sha256")
        .update(`${baseFingerprint}:${submitImmediately ? "SUBMITTED" : "DRAFT"}`, "utf8")
        .digest("hex");
      const services = await tx<ServiceRow[]>`
        SELECT services.id, services.active, categories.active AS category_active
        FROM services
        INNER JOIN service_categories AS categories ON categories.id = services.category_id
        WHERE services.id = ${normalized.serviceId}
        FOR SHARE OF services, categories
      `;
      const service = services[0];
      if (service === undefined || !service.active || !service.category_active) {
        throw new RequestDomainError("SERVICE_INACTIVE");
      }
      const inserted = await tx<{ readonly id: string }[]>`
        INSERT INTO service_requests (
          student_user_id, service_id, request_kind, status, title, description,
          deadline_at, urgency, budget_amount, budget_currency, language_code,
          academic_level, institution_name, privacy_requested, submission_key,
          submission_fingerprint, academic_integrity_version,
          academic_integrity_accepted_at, submitted_at, version
        ) VALUES (
          ${input.studentUserId}, ${service.id}, 'SERVICE',
          ${submitImmediately ? "SUBMITTED" : "DRAFT"}, ${normalized.title},
          ${normalized.description}, ${normalized.deadlineAt ?? null}, ${normalized.urgency},
          ${normalized.budgetAmount ?? null}, ${normalized.budgetCurrency ?? null},
          ${normalized.languageCode ?? null}, ${normalized.academicLevel ?? null},
          ${normalized.institutionName ?? null}, ${normalized.privacyRequested},
          ${normalized.submissionKey}, ${fingerprint},
          ${submitImmediately ? this.academicIntegrityVersion : null},
          CASE WHEN ${submitImmediately} THEN now() ELSE NULL END,
          CASE WHEN ${submitImmediately} THEN now() ELSE NULL END,
          ${submitImmediately ? 2 : 1}
        )
        ON CONFLICT (student_user_id, submission_key) DO NOTHING
        RETURNING id
      `;
      const insertedId = inserted[0]?.id;
      if (insertedId === undefined) {
        const replayRows = await tx.unsafe<AdminRequestRow[]>(
          `SELECT ${adminRequestSelect},
                  (
                    SELECT count(*)::text FROM service_request_messages AS unread_messages
                    WHERE unread_messages.conversation_id = conversations.id
                      AND unread_messages.sender_user_id IS DISTINCT FROM $2
                      AND NOT EXISTS (
                        SELECT 1 FROM service_request_message_receipts AS receipts
                        WHERE receipts.message_id = unread_messages.id
                          AND receipts.recipient_user_id = $2 AND receipts.status = 'READ'
                      )
                  ) AS unread_message_count
           FROM service_requests AS requests
           INNER JOIN users AS students ON students.id = requests.student_user_id
           INNER JOIN services ON services.id = requests.service_id
           INNER JOIN service_request_conversations AS conversations ON conversations.request_id = requests.id
           ${assignmentJoin}
           WHERE requests.student_user_id = $1 AND requests.submission_key = $3
           LIMIT 1`,
          [input.studentUserId, principal.userId, normalized.submissionKey],
        );
        const replay = replayRows[0];
        if (replay === undefined) {
          throw new RequestDomainError("VERSION_CONFLICT");
        }
        if (replay.submission_fingerprint !== fingerprint) {
          throw new RequestDomainError("IDEMPOTENCY_KEY_REUSED");
        }
        return { request: toSummary(replay), idempotentReplay: true };
      }
      const created = await this.readAdminRow(tx, principal.userId, insertedId);
      const createdEventId = await this.appendAdminEvent(tx, {
        requestId: created.id,
        eventType: "REQUEST_CREATED",
        actorUserId: principal.userId,
        requestVersion: 1,
        metadata: { source: "ADMIN" },
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.appendSystemMessage(
        tx,
        created.conversation_id,
        "ACTION",
        "REQUEST_CREATED_BY_ADMIN",
        created.student_user_id,
        { version: 1 },
      );
      await this.enqueue(tx, {
        eventType: "REQUEST_CREATED",
        requestId: created.id,
        idempotencyKey: `request:${created.id}:created:v1`,
        payload: { schemaVersion: 1, requestId: created.id, eventId: createdEventId },
      });
      let reviewEventId = createdEventId;
      if (submitImmediately) {
        reviewEventId = await this.appendAdminEvent(tx, {
          requestId: created.id,
          eventType: "REQUEST_SUBMITTED",
          actorUserId: principal.userId,
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
          requestVersion: 2,
          metadata: { source: "ADMIN", studentConfirmedViaWhatsApp: true },
          ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
        });
        await this.appendSystemMessage(
          tx,
          created.conversation_id,
          "ACTION",
          "REQUEST_SUBMITTED_BY_ADMIN",
          created.student_user_id,
          { version: 2 },
        );
        await this.enqueue(tx, {
          eventType: "REQUEST_SUBMITTED",
          requestId: created.id,
          idempotencyKey: `request:${created.id}:submitted:v2`,
          payload: { schemaVersion: 1, requestId: created.id, eventId: reviewEventId, version: 2 },
        });
        await this.enqueue(tx, {
          eventType: "REQUEST_NEEDS_REVIEW",
          requestId: created.id,
          idempotencyKey: `request:${created.id}:needs-review:v2`,
          payload: { schemaVersion: 1, requestId: created.id, eventId: reviewEventId, version: 2 },
        });
      }
      await recordAuditEvent(tx, {
        ...context,
        eventType: "request.created_by_admin",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: created.student_user_id,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: created.id,
        metadata: { submitImmediately, version: created.version },
      });
      return { request: toSummary(created), idempotentReplay: false };
    });
    if (!result.idempotentReplay) {
      this.logger?.info("request_created_by_admin", { requestId: result.request.id });
    }
    return result;
  }

  public async listAdminRequests(
    principal: AuthenticatedPrincipal,
    input: AdminRequestListInput = {},
  ): Promise<AdminRequestListResult> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.read");
    const { page, pageSize, offset } = normalizeBoundedPage(input.page, input.pageSize, 100);
    const search = input.search?.trim().slice(0, 100);
    const searchPattern =
      search === undefined || search.length === 0 ? null : `%${escapeLike(search)}%`;
    const status = input.status ?? null;
    const serviceId = input.serviceId ?? null;
    const assignedAdminUserId = input.assignedAdminUserId ?? null;
    const unassignedOnly = input.unassignedOnly === true;
    const orderBy =
      input.sort === "oldest"
        ? "requests.created_at ASC, requests.id ASC"
        : input.sort === "deadline"
          ? "requests.deadline_at ASC NULLS LAST, requests.created_at DESC, requests.id DESC"
          : "requests.created_at DESC, requests.id DESC";
    const predicate = `
      ($1::text IS NULL OR requests.request_number ILIKE $1 ESCAPE E'\\\\'
        OR requests.title ILIKE $1 ESCAPE E'\\\\'
        OR students.display_name ILIKE $1 ESCAPE E'\\\\')
      AND ($2::text IS NULL OR requests.status = $2)
      AND ($3::uuid IS NULL OR requests.service_id = $3)
      AND ($4::uuid IS NULL OR current_assignment.assigned_admin_user_id = $4)
      AND (NOT $5::boolean OR current_assignment.assigned_admin_user_id IS NULL)
      AND requests.archived_at IS NULL
    `;
    const parameters = [searchPattern, status, serviceId, assignedAdminUserId, unassignedOnly];
    const [counts, rows] = await Promise.all([
      this.database.unsafe<CountRow[]>(
        `SELECT count(*)::text AS count
         FROM service_requests AS requests
         INNER JOIN users AS students ON students.id = requests.student_user_id
         ${assignmentJoin}
         WHERE ${predicate}`,
        parameters,
      ),
      this.database.unsafe<AdminRequestRow[]>(
        `SELECT ${adminRequestSelect},
                (
                  SELECT count(*)::text FROM service_request_messages AS unread_messages
                  WHERE unread_messages.conversation_id = conversations.id
                    AND unread_messages.sender_user_id IS DISTINCT FROM $6
                    AND NOT EXISTS (
                      SELECT 1 FROM service_request_message_receipts AS receipts
                      WHERE receipts.message_id = unread_messages.id
                        AND receipts.recipient_user_id = $6 AND receipts.status = 'READ'
                    )
                ) AS unread_message_count
         FROM service_requests AS requests
         INNER JOIN users AS students ON students.id = requests.student_user_id
         INNER JOIN services ON services.id = requests.service_id
         INNER JOIN service_request_conversations AS conversations ON conversations.request_id = requests.id
         ${assignmentJoin}
         WHERE ${predicate}
         ORDER BY ${orderBy}
         LIMIT $7 OFFSET $8`,
        [...parameters, principal.userId, pageSize, offset],
      ),
    ]);
    const total = toSafeInteger(counts[0]?.count ?? "0", "count");
    return {
      items: rows.map(toSummary),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Read-only review of non-terminal requests that have gone idle long enough
   * to warrant follow-up or removal (DRAFT > 7d, SUBMITTED/UNDER_REVIEW/QUOTED >
   * 30d without an update). Requests with a financial due are surfaced but
   * flagged as never-deletable.
   */
  public async listStalePendingRequests(
    principal: AuthenticatedPrincipal,
    filter: StalePendingRequestFilter = {},
  ): Promise<StalePendingRequestReport> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.read");
    const { page, pageSize, offset } = normalizeBoundedPage(filter.page, filter.pageSize, 100);
    const status =
      filter.status !== undefined && isStalePendingStatus(filter.status) ? filter.status : null;
    const studentUserId =
      filter.studentUserId !== undefined && isUuid(filter.studentUserId)
        ? filter.studentUserId
        : null;
    const minDaysPending =
      typeof filter.minDaysPending === "number" &&
      Number.isSafeInteger(filter.minDaysPending) &&
      filter.minDaysPending > 0
        ? Math.min(filter.minDaysPending, 100_000)
        : null;
    const mode = filter.includeArchived === "only" ? "only" : "exclude";

    const staleCte = `
      stale AS (
        SELECT requests.id, requests.request_number, requests.status, requests.title,
               requests.student_user_id, students.display_name AS student_display_name,
               services.name_ar AS service_name_ar,
               requests.created_at, requests.updated_at, requests.archived_at,
               requests.archive_reason, archivist.display_name AS archived_by_name,
               GREATEST(0, EXTRACT(DAY FROM (now() - requests.updated_at))::int) AS days_pending,
               EXISTS (
                 SELECT 1 FROM finance_dues AS dues WHERE dues.request_id = requests.id
               ) AS has_financial_record
        FROM service_requests AS requests
        INNER JOIN users AS students ON students.id = requests.student_user_id
        INNER JOIN services ON services.id = requests.service_id
        LEFT JOIN users AS archivist ON archivist.id = requests.archived_by_user_id
        WHERE requests.status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'QUOTED')
          AND (
            ($4::text = 'only' AND requests.archived_at IS NOT NULL)
            OR (
              $4::text <> 'only'
              AND requests.archived_at IS NULL
              AND (
                (requests.status = 'DRAFT'
                  AND requests.updated_at < now() - interval '7 days')
                OR (requests.status <> 'DRAFT'
                  AND requests.updated_at < now() - interval '30 days')
              )
            )
          )
          AND ($2::uuid IS NULL OR requests.student_user_id = $2::uuid)
          AND (
            $3::int IS NULL
            OR EXTRACT(DAY FROM (now() - requests.updated_at))::int >= $3::int
          )
      )
    `;

    const [statRows, pageRows] = await Promise.all([
      this.database.unsafe<StalePendingStatRow[]>(
        `WITH ${staleCte}
         SELECT count(*)::text AS total,
                count(*) FILTER (WHERE status = 'DRAFT')::text AS draft,
                count(*) FILTER (WHERE status = 'SUBMITTED')::text AS submitted,
                count(*) FILTER (WHERE status = 'UNDER_REVIEW')::text AS under_review,
                count(*) FILTER (WHERE status = 'QUOTED')::text AS quoted,
                count(*) FILTER (WHERE $1::text IS NULL OR status = $1::text)::text
                  AS filtered_total
         FROM stale`,
        [status, studentUserId, minDaysPending, mode],
      ),
      this.database.unsafe<StalePendingRow[]>(
        `WITH ${staleCte}
         SELECT id, request_number, status, title, student_user_id, student_display_name,
                service_name_ar, created_at, updated_at, days_pending, has_financial_record,
                archived_at, archived_by_name, archive_reason
         FROM stale
         WHERE ($1::text IS NULL OR status = $1::text)
         ORDER BY archived_at DESC NULLS LAST, days_pending DESC, request_number ASC
         LIMIT $5 OFFSET $6`,
        [status, studentUserId, minDaysPending, mode, pageSize, offset],
      ),
    ]);

    const stat = statRows[0];
    const filteredTotal = toSafeInteger(stat?.filtered_total ?? "0", "filtered_total");
    const items: StalePendingRequestItem[] = pageRows.map((row) => {
      const rowStatus = isStalePendingStatus(row.status) ? row.status : "SUBMITTED";
      const daysPending = toSafeInteger(row.days_pending, "days_pending");
      const archivedAt =
        row.archived_at === null
          ? undefined
          : row.archived_at instanceof Date
            ? row.archived_at
            : new Date(row.archived_at);
      return {
        id: row.id,
        requestNumber: row.request_number,
        status: rowStatus,
        title: row.title,
        studentUserId: row.student_user_id,
        studentDisplayName: row.student_display_name,
        serviceNameAr: row.service_name_ar,
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
        daysPending,
        reason: stalePendingRequestReason(rowStatus, daysPending) ?? "معلّق",
        hasFinancialRecord: row.has_financial_record === true,
        ...(archivedAt === undefined ? {} : { archivedAt }),
        ...(row.archived_by_name === null ? {} : { archivedByName: row.archived_by_name }),
        ...(row.archive_reason === null ? {} : { archiveReason: row.archive_reason }),
      };
    });

    return {
      items,
      page,
      pageSize,
      total: filteredTotal,
      pageCount: Math.max(1, Math.ceil(filteredTotal / pageSize)),
      stats: {
        total: toSafeInteger(stat?.total ?? "0", "total"),
        draft: toSafeInteger(stat?.draft ?? "0", "draft"),
        submitted: toSafeInteger(stat?.submitted ?? "0", "submitted"),
        underReview: toSafeInteger(stat?.under_review ?? "0", "under_review"),
        quoted: toSafeInteger(stat?.quoted ?? "0", "quoted"),
      },
    };
  }

  /**
   * Archives up to 100 non-terminal requests: a reversible soft state that
   * hides them from the request inbox, the student dashboard/list and the
   * stale-pending review. Requests that are terminal, already archived, or
   * carry a financial due are skipped and reported back.
   */
  public async archivePendingRequests(
    principal: AuthenticatedPrincipal,
    input: ArchivePendingRequestsInput,
    context: RequestAuditContext = {},
  ): Promise<ArchivePendingRequestsResult> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.archive");
    const ids = [...new Set(input.requestIds)].filter((value) => isUuid(value)).slice(0, 100);
    if (ids.length === 0) {
      throw new RequestDomainError("INVALID_REQUEST");
    }
    const reason = input.reason?.trim().slice(0, 500);
    const normalizedReason = reason !== undefined && reason.length > 0 ? reason : null;

    const archivedIds: string[] = [];
    const skipped: {
      id: string;
      reason: "NOT_FOUND" | "NOT_PENDING" | "HAS_FINANCE" | "ALREADY_ARCHIVED";
    }[] = [];

    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx.unsafe<ArchiveTargetRow[]>(
        `SELECT requests.id, requests.status, requests.archived_at,
                EXISTS (
                  SELECT 1 FROM finance_dues AS dues WHERE dues.request_id = requests.id
                ) AS has_financial_record
         FROM service_requests AS requests
         WHERE requests.id = ANY($1::uuid[])
         FOR UPDATE`,
        [ids],
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const id of ids) {
        const row = byId.get(id);
        if (row === undefined) {
          skipped.push({ id, reason: "NOT_FOUND" });
          continue;
        }
        const verdict = canArchivePendingRequest({
          status: row.status,
          hasFinancialRecord: row.has_financial_record === true,
          alreadyArchived: row.archived_at !== null,
        });
        if (!verdict.ok) {
          skipped.push({ id, reason: verdict.reason });
          continue;
        }
        const updated = await tx<{ readonly id: string }[]>`
          UPDATE service_requests
          SET archived_at = now(), archived_by_user_id = ${principal.userId},
              archive_reason = ${normalizedReason}, updated_at = now()
          WHERE id = ${id} AND archived_at IS NULL
          RETURNING id
        `;
        if (updated[0] === undefined) {
          skipped.push({ id, reason: "ALREADY_ARCHIVED" });
          continue;
        }
        archivedIds.push(id);
        await recordAuditEvent(tx, {
          ...context,
          eventType: "service_request.archived",
          outcome: "SUCCESS",
          actorUserId: principal.userId,
          sessionId: principal.sessionId,
          resourceType: "service_request",
          resourceId: id,
          metadata: normalizedReason === null ? {} : { reason: normalizedReason },
        });
      }
    });

    return { archivedIds, skipped };
  }

  /** Restores a single archived request to normal visibility. */
  public async restorePendingRequest(
    principal: AuthenticatedPrincipal,
    requestId: string,
    context: RequestAuditContext = {},
  ): Promise<void> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.archive");
    if (!isUuid(requestId)) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    const restored = await this.database<{ readonly id: string }[]>`
      UPDATE service_requests
      SET archived_at = NULL, archived_by_user_id = NULL, archive_reason = NULL,
          updated_at = now()
      WHERE id = ${requestId} AND archived_at IS NOT NULL
      RETURNING id
    `;
    if (restored[0] === undefined) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "service_request.restored",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      sessionId: principal.sessionId,
      resourceType: "service_request",
      resourceId: requestId,
    });
  }

  public async getAdminRequest(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
  ): Promise<AdminRequestDetail> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.read");
    const row = await this.readAdminRow(this.database, principal.userId, requestIdentifier);
    const [events, attachments] = await Promise.all([
      this.database<RequestEventRow[]>`
        SELECT id, event_type, from_status, to_status, request_version, created_at
        FROM service_request_events
        WHERE request_id = ${row.id}
        ORDER BY created_at ASC, id ASC
      `,
      this.database<AttachmentRow[]>`
        SELECT id, original_filename, detected_mime_type, declared_mime_type,
               size_bytes, storage_status, scan_status, created_at, deleted_at
        FROM service_request_attachments
        WHERE request_id = ${row.id} AND deleted_at IS NULL
        ORDER BY created_at ASC, id ASC
      `,
    ]);
    const languageCode = toLanguage(row.language_code);
    const academicLevel = toAcademicLevel(row.academic_level);
    const submittedAt = optionalDate(row.submitted_at);
    const cancelledAt = optionalDate(row.cancelled_at);
    const completedAt = optionalDate(row.completed_at);
    return {
      ...toSummary(row),
      description: row.description,
      ...(row.budget_amount === null ? {} : { budgetAmount: String(row.budget_amount) }),
      ...(row.budget_currency === null ? {} : { budgetCurrency: row.budget_currency }),
      ...(languageCode === undefined ? {} : { languageCode }),
      ...(academicLevel === undefined ? {} : { academicLevel }),
      ...(row.institution_name === null ? {} : { institutionName: row.institution_name }),
      privacyRequested: row.privacy_requested,
      ...(submittedAt === undefined ? {} : { submittedAt }),
      ...(cancelledAt === undefined ? {} : { cancelledAt }),
      ...(completedAt === undefined ? {} : { completedAt }),
      events: events.map(toEvent),
      attachments: attachments.map(toAttachment),
    };
  }

  public async updateRequestDetails(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
    input: AdminRequestEditInput,
    context: RequestAuditContext = {},
  ): Promise<AdminRequestSummary> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.manage");
    assertExpectedVersion(input.expectedVersion);
    const normalizedBase = normalizeDraftRequestInput({
      serviceId: "00000000-0000-4000-8000-000000000000",
      submissionKey: "00000000-0000-4000-8000-000000000001",
      title: input.title,
      description: input.description,
      deadlineAt: null,
      urgency: input.urgency,
    });
    assertRequestFieldsSubmittable(normalizedBase);
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const current = await this.lockRequest(tx, principal.userId, requestIdentifier);
      const currentVersion = toSafeInteger(current.version, "version");
      if (currentVersion !== input.expectedVersion) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const currentDeadlineDate = optionalDate(current.deadline_at);
      const currentDeadline = currentDeadlineDate?.getTime();
      let normalizedDeadline: Date | undefined;
      if (input.deadlineAt !== undefined && input.deadlineAt !== null) {
        const candidate =
          input.deadlineAt instanceof Date
            ? new Date(input.deadlineAt.getTime())
            : new Date(input.deadlineAt);
        const validTimestamp = !Number.isNaN(candidate.getTime());
        const explicitZone =
          input.deadlineAt instanceof Date ||
          /T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(input.deadlineAt.trim());
        if (!validTimestamp || !explicitZone) {
          throw new RequestDomainError("INVALID_DEADLINE");
        }
        if (candidate.getTime() === currentDeadline) {
          normalizedDeadline = currentDeadlineDate;
        } else {
          normalizedDeadline = normalizeDraftRequestInput({
            ...normalizedBase,
            serviceId: "00000000-0000-4000-8000-000000000000",
            submissionKey: "00000000-0000-4000-8000-000000000001",
            deadlineAt: input.deadlineAt,
          }).deadlineAt;
        }
      }
      const normalized = {
        ...normalizedBase,
        ...(normalizedDeadline === undefined ? {} : { deadlineAt: normalizedDeadline }),
      };
      const nextDeadline = normalized.deadlineAt?.getTime();
      const changedFields = [
        ...(current.title === normalized.title ? [] : ["title"]),
        ...(current.description === normalized.description ? [] : ["description"]),
        ...(currentDeadline === nextDeadline ? [] : ["deadlineAt"]),
        ...(current.urgency === normalized.urgency ? [] : ["urgency"]),
      ];
      if (changedFields.length === 0) {
        return current;
      }
      const revision = {
        title: { before: current.title, after: normalized.title },
        description: { before: current.description, after: normalized.description },
        deadlineAt: {
          before: optionalDate(current.deadline_at)?.toISOString() ?? null,
          after: normalized.deadlineAt?.toISOString() ?? null,
        },
        urgency: { before: current.urgency, after: normalized.urgency },
      };
      const updated = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests
        SET title = ${normalized.title}, description = ${normalized.description},
            deadline_at = ${normalized.deadlineAt ?? null}, urgency = ${normalized.urgency},
            updated_at = now(), version = version + 1
        WHERE id = ${current.id} AND version = ${input.expectedVersion}
        RETURNING version
      `;
      const versionValue = updated[0]?.version;
      if (versionValue === undefined) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const version = toSafeInteger(versionValue, "version");
      const eventId = await this.appendAdminEvent(tx, {
        requestId: current.id,
        eventType: "REQUEST_DETAILS_UPDATED",
        actorUserId: principal.userId,
        requestVersion: version,
        metadata: { changedFields, revision },
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.appendSystemMessage(
        tx,
        current.conversation_id,
        "SYSTEM",
        "REQUEST_DETAILS_UPDATED",
        current.student_user_id,
        { changedFields: changedFields.join(","), version },
      );
      await this.enqueue(tx, {
        eventType: "REQUEST_DETAILS_UPDATED",
        requestId: current.id,
        idempotencyKey: `request:${current.id}:details:v${version}`,
        payload: {
          schemaVersion: 1,
          requestId: current.id,
          eventId,
          changedFields: changedFields.join(","),
          version,
        },
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: "request.details_updated_by_admin",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: current.student_user_id,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: current.id,
        metadata: { changedFields, revision, version },
      });
      return this.readAdminRow(tx, principal.userId, current.id);
    });
    this.logger?.info("request_details_updated_by_admin", {
      requestId: result.id,
      version: result.version,
    });
    return toSummary(result);
  }

  public async transitionRequestStatus(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
    input: AdminRequestTransitionInput,
    context: RequestAuditContext = {},
  ): Promise<AdminRequestSummary> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.manage");
    assertExpectedVersion(input.expectedVersion);
    if (!isRequestStatus(input.toStatus)) {
      throw new RequestDomainError("INVALID_TRANSITION");
    }
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const current = await this.lockRequest(tx, principal.userId, requestIdentifier);
      const currentVersion = toSafeInteger(current.version, "version");
      if (currentVersion !== input.expectedVersion) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const fromStatus = toStatus(current.status);
      if (fromStatus === "DRAFT" || !canTransitionRequest(fromStatus, input.toStatus, "ADMIN")) {
        throw new RequestDomainError("INVALID_TRANSITION");
      }
      const updated = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests
        SET status = ${input.toStatus}, updated_at = now(), version = version + 1,
            cancelled_at = CASE WHEN ${input.toStatus} = 'CANCELLED' THEN now() ELSE cancelled_at END,
            completed_at = CASE WHEN ${input.toStatus} = 'COMPLETED' THEN now() ELSE completed_at END
        WHERE id = ${current.id} AND version = ${input.expectedVersion} AND status = ${fromStatus}
        RETURNING version
      `;
      if (updated[0] === undefined) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const version = toSafeInteger(updated[0].version, "version");
      const eventId = await this.appendAdminEvent(tx, {
        requestId: current.id,
        eventType: "REQUEST_STATUS_CHANGED",
        actorUserId: principal.userId,
        fromStatus,
        toStatus: input.toStatus,
        requestVersion: version,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.appendSystemMessage(
        tx,
        current.conversation_id,
        "SYSTEM",
        "REQUEST_STATUS_CHANGED",
        current.student_user_id,
        {
          fromStatus,
          toStatus: input.toStatus,
          version,
        },
      );
      await this.enqueue(tx, {
        eventType: "REQUEST_STATUS_CHANGED",
        requestId: current.id,
        idempotencyKey: `request:${current.id}:status:${input.toStatus}:v${version}`,
        payload: {
          schemaVersion: 1,
          requestId: current.id,
          eventId,
          fromStatus,
          toStatus: input.toStatus,
          version,
        },
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: "request.status_changed",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: current.student_user_id,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: current.id,
        metadata: { fromStatus, toStatus: input.toStatus, version },
      });
      return this.readAdminRow(tx, principal.userId, current.id);
    });
    this.logger?.info("request_status_changed", {
      requestId: result.id,
      status: result.status,
      version: result.version,
    });
    return toSummary(result);
  }

  public async assignRequest(
    principal: AuthenticatedPrincipal,
    requestIdentifier: string,
    input: AssignRequestInput,
    context: RequestAuditContext = {},
  ): Promise<AdminRequestSummary> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.requests.assign");
    assertExpectedVersion(input.expectedVersion);
    const adminUserId = input.adminUserId ?? null;
    if (adminUserId !== null && !isUuid(adminUserId)) {
      throw new RequestDomainError("ADMIN_ASSIGNEE_INVALID");
    }
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const current = await this.lockRequest(tx, principal.userId, requestIdentifier);
      if (toSafeInteger(current.version, "version") !== input.expectedVersion) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      if (adminUserId !== null) {
        const eligible = await tx<{ readonly id: string }[]>`
          SELECT users.id
          FROM users
          INNER JOIN user_roles ON user_roles.user_id = users.id AND user_roles.role_code = 'ADMIN'
          WHERE users.id = ${adminUserId} AND users.status = 'ACTIVE'
          LIMIT 1
        `;
        if (eligible[0] === undefined) {
          throw new RequestDomainError("ADMIN_ASSIGNEE_INVALID");
        }
      }
      const assignments = await tx<AssignmentRow[]>`
        SELECT id, assigned_admin_user_id
        FROM service_request_assignments
        WHERE request_id = ${current.id} AND unassigned_at IS NULL
        FOR UPDATE
      `;
      const existing = assignments[0];
      if (
        existing?.assigned_admin_user_id === adminUserId ||
        (existing === undefined && adminUserId === null)
      ) {
        return this.readAdminRow(tx, principal.userId, current.id);
      }
      if (existing !== undefined) {
        await tx`
          UPDATE service_request_assignments
          SET unassigned_at = now(), unassigned_by_user_id = ${principal.userId}
          WHERE id = ${existing.id} AND unassigned_at IS NULL
        `;
      }
      if (adminUserId !== null) {
        await tx`
          INSERT INTO service_request_assignments (
            request_id, assigned_admin_user_id, assigned_by_user_id
          ) VALUES (${current.id}, ${adminUserId}, ${principal.userId})
        `;
      }
      const updated = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests
        SET updated_at = now(), version = version + 1
        WHERE id = ${current.id} AND version = ${input.expectedVersion}
        RETURNING version
      `;
      if (updated[0] === undefined) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const version = toSafeInteger(updated[0].version, "version");
      const eventType = adminUserId === null ? "REQUEST_UNASSIGNED" : "REQUEST_ASSIGNED";
      const eventId = await this.appendAdminEvent(tx, {
        requestId: current.id,
        eventType,
        actorUserId: principal.userId,
        requestVersion: version,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.appendSystemMessage(
        tx,
        current.conversation_id,
        "ACTION",
        eventType,
        current.student_user_id,
        {
          assignedAdminUserId: adminUserId,
          version,
        },
      );
      await this.enqueue(tx, {
        eventType,
        requestId: current.id,
        idempotencyKey: `request:${current.id}:assignment:v${version}`,
        payload: {
          schemaVersion: 1,
          requestId: current.id,
          eventId,
          assignedAdminUserId: adminUserId,
          version,
        },
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: adminUserId === null ? "request.unassigned" : "request.assigned",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: current.student_user_id,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: current.id,
        metadata: { assignedAdminUserId: adminUserId, version },
      });
      return this.readAdminRow(tx, principal.userId, current.id);
    });
    this.logger?.info("request_assignment_changed", {
      requestId: result.id,
      assigned: result.assigned_admin_user_id !== null,
      version: result.version,
    });
    return toSummary(result);
  }

  private async lockRequest(
    database: DatabaseClient,
    adminUserId: string,
    requestIdentifier: string,
  ): Promise<AdminRequestRow> {
    const normalized = this.normalizedIdentifier(requestIdentifier);
    const rows = await database.unsafe<AdminRequestRow[]>(
      `SELECT ${adminRequestSelect},
              (
                SELECT count(*)::text FROM service_request_messages AS unread_messages
                WHERE unread_messages.conversation_id = conversations.id
                  AND unread_messages.sender_user_id IS DISTINCT FROM $2
                  AND NOT EXISTS (
                    SELECT 1 FROM service_request_message_receipts AS receipts
                    WHERE receipts.message_id = unread_messages.id
                      AND receipts.recipient_user_id = $2 AND receipts.status = 'READ'
                  )
              ) AS unread_message_count
       FROM service_requests AS requests
       INNER JOIN users AS students ON students.id = requests.student_user_id
       INNER JOIN services ON services.id = requests.service_id
       INNER JOIN service_request_conversations AS conversations ON conversations.request_id = requests.id
       ${assignmentJoin}
       WHERE requests.id::text = $1 OR requests.request_number = $1
       LIMIT 1
       FOR UPDATE OF requests`,
      [normalized, adminUserId],
    );
    if (rows[0] === undefined) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    return rows[0];
  }

  private async readAdminRow(
    database: DatabaseClient,
    adminUserId: string,
    requestIdentifier: string,
  ): Promise<AdminRequestRow> {
    const normalized = this.normalizedIdentifier(requestIdentifier);
    const rows = await database.unsafe<AdminRequestRow[]>(
      `SELECT ${adminRequestSelect},
              (
                SELECT count(*)::text FROM service_request_messages AS unread_messages
                WHERE unread_messages.conversation_id = conversations.id
                  AND unread_messages.sender_user_id IS DISTINCT FROM $2
                  AND NOT EXISTS (
                    SELECT 1 FROM service_request_message_receipts AS receipts
                    WHERE receipts.message_id = unread_messages.id
                      AND receipts.recipient_user_id = $2 AND receipts.status = 'READ'
                  )
              ) AS unread_message_count
       FROM service_requests AS requests
       INNER JOIN users AS students ON students.id = requests.student_user_id
       INNER JOIN services ON services.id = requests.service_id
       INNER JOIN service_request_conversations AS conversations ON conversations.request_id = requests.id
       ${assignmentJoin}
       WHERE requests.id::text = $1 OR requests.request_number = $1
       LIMIT 1`,
      [normalized, adminUserId],
    );
    if (rows[0] === undefined) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    return rows[0];
  }

  private normalizedIdentifier(value: string): string {
    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > 80) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    return normalized;
  }

  private async appendAdminEvent(
    database: DatabaseClient,
    input: {
      readonly requestId: string;
      readonly eventType: string;
      readonly actorUserId: string;
      readonly fromStatus?: RequestStatus;
      readonly toStatus?: RequestStatus;
      readonly requestVersion: number;
      readonly correlationId?: string;
      readonly metadata?: JsonObject;
    },
  ): Promise<string> {
    const rows = await database<{ readonly id: number | string }[]>`
      INSERT INTO service_request_events (
        request_id, event_type, actor_type, actor_user_id, from_status, to_status,
        request_version, metadata, correlation_id
      ) VALUES (
        ${input.requestId}, ${input.eventType}, 'ADMIN', ${input.actorUserId},
        ${input.fromStatus ?? null}, ${input.toStatus ?? null}, ${input.requestVersion},
        ${database.json(input.metadata ?? {})}, ${input.correlationId ?? null}
      )
      RETURNING id
    `;
    if (rows[0]?.id === undefined) {
      throw new Error("Administrative request event insert did not return an id.");
    }
    return String(rows[0].id);
  }

  private async appendSystemMessage(
    database: DatabaseClient,
    conversationId: string,
    contentType: "SYSTEM" | "ACTION",
    body: string,
    recipientUserId: string,
    metadata: Readonly<Record<string, string | number | null>>,
  ): Promise<void> {
    const rows = await database<{ readonly id: string }[]>`
      INSERT INTO service_request_messages (
        conversation_id, sender_type, sender_user_id, content_type, body, metadata
      ) VALUES (
        ${conversationId}, 'SYSTEM', NULL, ${contentType}, ${body}, ${database.json(metadata)}
      )
      RETURNING id
    `;
    if (rows[0]?.id === undefined) {
      throw new Error("System request message insert did not return an id.");
    }
    await database`
      INSERT INTO service_request_message_receipts (
        message_id, recipient_user_id, status
      ) VALUES (${rows[0].id}, ${recipientUserId}, 'SENT')
      ON CONFLICT (message_id, recipient_user_id) DO NOTHING
    `;
    await database`
      UPDATE service_request_conversations
      SET updated_at = now(), last_message_at = now()
      WHERE id = ${conversationId}
    `;
  }

  private async enqueue(
    database: DatabaseClient,
    input: {
      readonly eventType: string;
      readonly requestId: string;
      readonly idempotencyKey: string;
      readonly payload: Readonly<Record<string, string | number | null>>;
    },
  ): Promise<void> {
    await database`
      INSERT INTO outbox_events (
        event_type, aggregate_type, aggregate_id, idempotency_key, payload
      ) VALUES (
        ${input.eventType}, 'SERVICE_REQUEST', ${input.requestId}, ${input.idempotencyKey},
        ${database.json(input.payload)}
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
  }
}
