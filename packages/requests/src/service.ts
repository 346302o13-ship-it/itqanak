import {
  canTransitionRequest,
  isRequestStatus,
  type JsonObject,
  type RequestStatus,
} from "@itqanak/core";
import type { AppConfig } from "@itqanak/config";
import {
  recordAuditEvent,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

import { RequestDomainError } from "./errors.js";
import type {
  AttachmentScanStatus,
  AttachmentStorageStatus,
  AcademicLevel,
  CancelRequestInput,
  CreatedDraftResult,
  DraftRequestInput,
  NormalizedRequestFields,
  RequestAttachmentSummary,
  RequestEventSummary,
  RequestLanguageCode,
  RequestListInput,
  RequestListResult,
  RequestUrgency,
  ServiceRequestDetail,
  ServiceRequestSummary,
  StudentDashboard,
  StudentRequestTransitionInput,
  SubmitRequestInput,
  UpdateDraftRequestInput,
} from "./types.js";
import {
  assertRequestSubmission,
  normalizeDraftRequestInput,
  requestSubmissionFingerprint,
} from "./validation.js";

interface RequestRow {
  readonly id: string;
  readonly request_number: string;
  readonly student_user_id: string;
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
  readonly submission_key: string;
  readonly submission_fingerprint: string;
  readonly academic_integrity_version: string | null;
  readonly academic_integrity_accepted_at: Date | string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly submitted_at: Date | string | null;
  readonly cancelled_at: Date | string | null;
  readonly completed_at: Date | string | null;
  readonly version: number | string;
}

interface ServiceRow {
  readonly id: string;
  readonly slug: string;
  readonly name_ar: string;
  readonly active: boolean;
  readonly category_active: boolean;
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

interface CountRow {
  readonly count: number | string;
}

interface DashboardCountRow {
  readonly active_count: number | string;
  readonly waiting_count: number | string;
  readonly completed_count: number | string;
}

export interface RequestServiceOptions {
  readonly database: DatabaseClient;
  readonly config: AppConfig;
  readonly logger?: Logger;
}

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Request row contains an invalid timestamp.");
  }
  return parsed;
}

function optionalDate(value: Date | string | null): Date | undefined {
  return value === null ? undefined : toDate(value);
}

function toSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Request row contains an invalid ${field}.`);
  }
  return parsed;
}

function toRequestStatus(value: string): RequestStatus {
  if (!isRequestStatus(value)) {
    throw new Error("Request row contains an unsupported status.");
  }
  return value;
}

function optionalRequestStatus(value: string | null): RequestStatus | undefined {
  return value === null ? undefined : toRequestStatus(value);
}

function toUrgency(value: string): RequestUrgency {
  if (value !== "NORMAL" && value !== "URGENT") {
    throw new Error("Request row contains an unsupported urgency.");
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
    value !== "es" &&
    value !== "de" &&
    value !== "tr"
  ) {
    throw new Error("Request row contains an unsupported language.");
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
    throw new Error("Request row contains an unsupported academic level.");
  }
  return value;
}

function toSummary(row: RequestRow): ServiceRequestSummary {
  return {
    id: row.id,
    requestNumber: row.request_number,
    serviceId: row.service_id,
    serviceSlug: row.service_slug,
    serviceNameAr: row.service_name_ar,
    status: toRequestStatus(row.status),
    title: row.title,
    ...(row.deadline_at === null ? {} : { deadlineAt: toDate(row.deadline_at) }),
    urgency: toUrgency(row.urgency),
    version: toSafeInteger(row.version, "version"),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function fieldsFromRow(row: RequestRow): NormalizedRequestFields {
  const languageCode = toLanguage(row.language_code);
  const academicLevel = toAcademicLevel(row.academic_level);
  return {
    title: row.title,
    description: row.description,
    ...(row.deadline_at === null ? {} : { deadlineAt: toDate(row.deadline_at) }),
    urgency: toUrgency(row.urgency),
    ...(row.budget_amount === null ? {} : { budgetAmount: String(row.budget_amount) }),
    ...(row.budget_currency === null ? {} : { budgetCurrency: row.budget_currency }),
    ...(languageCode === undefined ? {} : { languageCode }),
    ...(academicLevel === undefined ? {} : { academicLevel }),
    ...(row.institution_name === null ? {} : { institutionName: row.institution_name }),
    privacyRequested: row.privacy_requested,
  };
}

function toEvent(row: RequestEventRow): RequestEventSummary {
  const fromStatus = optionalRequestStatus(row.from_status);
  const toStatus = optionalRequestStatus(row.to_status);
  return {
    id: String(row.id),
    eventType: row.event_type,
    ...(fromStatus === undefined ? {} : { fromStatus }),
    ...(toStatus === undefined ? {} : { toStatus }),
    requestVersion: toSafeInteger(row.request_version, "request_version"),
    createdAt: toDate(row.created_at),
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
    throw new Error("Attachment row contains an unsupported storage status.");
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
    throw new Error("Attachment row contains an unsupported scan status.");
  }
  return value;
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

const requestSelect = `
  requests.id, requests.request_number, requests.student_user_id, requests.service_id,
  services.slug AS service_slug, services.name_ar AS service_name_ar,
  requests.status, requests.title, requests.description, requests.deadline_at,
  requests.urgency, requests.budget_amount, requests.budget_currency,
  requests.language_code, requests.academic_level, requests.institution_name,
  requests.privacy_requested, requests.submission_key, requests.submission_fingerprint,
  requests.academic_integrity_version, requests.academic_integrity_accepted_at,
  requests.created_at, requests.updated_at, requests.submitted_at,
  requests.cancelled_at, requests.completed_at, requests.version
`;

export class RequestService {
  private readonly database: DatabaseClient;
  private readonly config: AppConfig;
  private readonly logger: Logger | undefined;

  public constructor(options: RequestServiceOptions) {
    this.database = options.database;
    this.config = options.config;
    this.logger = options.logger;
  }

  public async createDraft(
    principal: AuthenticatedPrincipal,
    input: DraftRequestInput,
    context: RequestAuditContext = {},
  ): Promise<CreatedDraftResult> {
    requirePermission(principal, "requests.create");
    const normalized = normalizeDraftRequestInput(input);
    const fingerprint = requestSubmissionFingerprint(normalized.serviceId, normalized);

    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const services = await tx<ServiceRow[]>`
        SELECT services.id, services.slug, services.name_ar, services.active,
               categories.active AS category_active
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
          submission_fingerprint
        ) VALUES (
          ${principal.userId}, ${service.id}, 'SERVICE', 'DRAFT', ${normalized.title},
          ${normalized.description}, ${normalized.deadlineAt ?? null}, ${normalized.urgency},
          ${normalized.budgetAmount ?? null}, ${normalized.budgetCurrency ?? null},
          ${normalized.languageCode ?? null}, ${normalized.academicLevel ?? null},
          ${normalized.institutionName ?? null}, ${normalized.privacyRequested},
          ${normalized.submissionKey}, ${fingerprint}
        )
        ON CONFLICT (student_user_id, submission_key) DO NOTHING
        RETURNING id
      `;

      if (inserted[0] === undefined) {
        const replayRows = await tx.unsafe<RequestRow[]>(
          `SELECT ${requestSelect}
           FROM service_requests AS requests
           INNER JOIN services ON services.id = requests.service_id
           WHERE requests.student_user_id = $1 AND requests.submission_key = $2
           LIMIT 1`,
          [principal.userId, normalized.submissionKey],
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

      const createdRows = await tx.unsafe<RequestRow[]>(
        `SELECT ${requestSelect}
         FROM service_requests AS requests
         INNER JOIN services ON services.id = requests.service_id
         WHERE requests.id = $1 AND requests.student_user_id = $2
         LIMIT 1`,
        [inserted[0].id, principal.userId],
      );
      const created = createdRows[0];
      if (created === undefined) {
        throw new Error("Created request could not be read back.");
      }
      const eventId = await this.appendEvent(tx, {
        requestId: created.id,
        eventType: "REQUEST_CREATED",
        actorUserId: principal.userId,
        requestVersion: 1,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.enqueue(tx, {
        eventType: "REQUEST_CREATED",
        requestId: created.id,
        idempotencyKey: `request:${created.id}:created:v1`,
        payload: { schemaVersion: 1, requestId: created.id, eventId },
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: "request.created",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: created.id,
      });
      return { request: toSummary(created), idempotentReplay: false };
    });
    if (!result.idempotentReplay) {
      this.logger?.info("request_created", { requestId: result.request.id, version: 1 });
    }
    return result;
  }

  public async updateDraft(
    principal: AuthenticatedPrincipal,
    requestNumber: string,
    input: UpdateDraftRequestInput,
    context: RequestAuditContext = {},
  ): Promise<ServiceRequestSummary> {
    requirePermission(principal, "requests.update.own");
    assertExpectedVersion(input.expectedVersion);
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const current = await this.lockOwnedRequest(tx, principal.userId, requestNumber);
      if (toSafeInteger(current.version, "version") !== input.expectedVersion) {
        this.logger?.warn("request_version_conflict", { requestId: current.id });
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      if (current.status !== "DRAFT") {
        throw new RequestDomainError("INVALID_TRANSITION");
      }
      const normalized = normalizeDraftRequestInput({
        ...fieldsFromRow(current),
        ...input,
        serviceId: current.service_id,
        submissionKey: current.submission_key,
      });
      const updatedRows = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests
        SET title = ${normalized.title}, description = ${normalized.description},
            deadline_at = ${normalized.deadlineAt ?? null}, urgency = ${normalized.urgency},
            budget_amount = ${normalized.budgetAmount ?? null},
            budget_currency = ${normalized.budgetCurrency ?? null},
            language_code = ${normalized.languageCode ?? null},
            academic_level = ${normalized.academicLevel ?? null},
            institution_name = ${normalized.institutionName ?? null},
            privacy_requested = ${normalized.privacyRequested},
            updated_at = now(), version = version + 1
        WHERE id = ${current.id} AND version = ${input.expectedVersion}
        RETURNING version
      `;
      const updatedVersion = updatedRows[0]?.version;
      if (updatedVersion === undefined) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const version = toSafeInteger(updatedVersion, "version");
      await this.appendEvent(tx, {
        requestId: current.id,
        eventType: "REQUEST_UPDATED",
        actorUserId: principal.userId,
        requestVersion: version,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: "request.updated",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: current.id,
        metadata: { version },
      });
      return this.readOwnedSummary(tx, principal.userId, current.id);
    });
    this.logger?.info("request_updated", { requestId: result.id, version: result.version });
    return result;
  }

  public async submit(
    principal: AuthenticatedPrincipal,
    requestNumber: string,
    input: SubmitRequestInput,
    context: RequestAuditContext = {},
  ): Promise<ServiceRequestSummary> {
    requirePermission(principal, "requests.update.own");
    assertExpectedVersion(input.expectedVersion);
    const integrityVersion = this.academicIntegrityVersion();
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const current = await this.lockOwnedRequest(tx, principal.userId, requestNumber);
      if (toSafeInteger(current.version, "version") !== input.expectedVersion) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      if (current.status !== "DRAFT") {
        throw new RequestDomainError(
          current.status === "SUBMITTED" ? "REQUEST_ALREADY_SUBMITTED" : "INVALID_TRANSITION",
        );
      }
      if (!canTransitionRequest("DRAFT", "SUBMITTED", "STUDENT")) {
        throw new RequestDomainError("INVALID_TRANSITION");
      }
      assertRequestSubmission(
        fieldsFromRow(current),
        input.acceptedAcademicIntegrity,
        input.academicIntegrityVersion,
        integrityVersion,
      );
      const serviceRows = await tx<ServiceRow[]>`
        SELECT services.id, services.slug, services.name_ar, services.active,
               categories.active AS category_active
        FROM services
        INNER JOIN service_categories AS categories ON categories.id = services.category_id
        WHERE services.id = ${current.service_id}
        FOR SHARE OF services, categories
      `;
      if (serviceRows[0]?.active !== true || serviceRows[0].category_active !== true) {
        throw new RequestDomainError("SERVICE_INACTIVE");
      }
      const forbiddenAttachments = await tx<CountRow[]>`
        SELECT count(*)::text AS count
        FROM service_request_attachments
        WHERE request_id = ${current.id} AND deleted_at IS NULL
          AND (
            storage_status <> 'STORED'
            OR scan_status IN ('INFECTED', 'SCAN_ERROR', 'REJECTED')
          )
      `;
      if (Number(forbiddenAttachments[0]?.count ?? "0") > 0) {
        throw new RequestDomainError("ATTACHMENT_NOT_READY");
      }
      const updated = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests
        SET status = 'SUBMITTED', submitted_at = now(), updated_at = now(),
            academic_integrity_version = ${integrityVersion},
            academic_integrity_accepted_at = now(), version = version + 1
        WHERE id = ${current.id} AND version = ${input.expectedVersion} AND status = 'DRAFT'
        RETURNING version
      `;
      if (updated[0] === undefined) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const version = toSafeInteger(updated[0].version, "version");
      const eventId = await this.appendEvent(tx, {
        requestId: current.id,
        eventType: "REQUEST_SUBMITTED",
        actorUserId: principal.userId,
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
        requestVersion: version,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.enqueue(tx, {
        eventType: "REQUEST_SUBMITTED",
        requestId: current.id,
        idempotencyKey: `request:${current.id}:submitted:v${version}`,
        payload: { schemaVersion: 1, requestId: current.id, eventId, version },
      });
      await this.enqueue(tx, {
        eventType: "REQUEST_NEEDS_REVIEW",
        requestId: current.id,
        idempotencyKey: `request:${current.id}:needs-review:v${version}`,
        payload: { schemaVersion: 1, requestId: current.id, version },
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: "request.submitted",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: current.id,
        metadata: { version },
      });
      return this.readOwnedSummary(tx, principal.userId, current.id);
    });
    this.logger?.info("request_submitted", { requestId: result.id, version: result.version });
    return result;
  }

  public async cancel(
    principal: AuthenticatedPrincipal,
    requestNumber: string,
    input: CancelRequestInput,
    context: RequestAuditContext = {},
  ): Promise<ServiceRequestSummary> {
    requirePermission(principal, "requests.cancel.own");
    assertExpectedVersion(input.expectedVersion);
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const current = await this.lockOwnedRequest(tx, principal.userId, requestNumber);
      if (toSafeInteger(current.version, "version") !== input.expectedVersion) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const fromStatus = toRequestStatus(current.status);
      if (!canTransitionRequest(fromStatus, "CANCELLED", "STUDENT")) {
        this.logger?.warn("request_transition_denied", { requestId: current.id });
        throw new RequestDomainError("INVALID_TRANSITION");
      }
      const updated = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests
        SET status = 'CANCELLED', cancelled_at = now(), updated_at = now(), version = version + 1
        WHERE id = ${current.id} AND version = ${input.expectedVersion} AND status = ${fromStatus}
        RETURNING version
      `;
      if (updated[0] === undefined) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const version = toSafeInteger(updated[0].version, "version");
      const eventId = await this.appendEvent(tx, {
        requestId: current.id,
        eventType: "REQUEST_CANCELLED",
        actorUserId: principal.userId,
        fromStatus,
        toStatus: "CANCELLED",
        requestVersion: version,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.enqueue(tx, {
        eventType: "REQUEST_CANCELLED",
        requestId: current.id,
        idempotencyKey: `request:${current.id}:cancelled:v${version}`,
        payload: { schemaVersion: 1, requestId: current.id, eventId, version },
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: "request.cancelled",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: current.id,
        metadata: { version },
      });
      return this.readOwnedSummary(tx, principal.userId, current.id);
    });
    this.logger?.info("request_cancelled", { requestId: result.id, version: result.version });
    return result;
  }

  public async transitionStudentRequest(
    principal: AuthenticatedPrincipal,
    requestNumber: string,
    input: StudentRequestTransitionInput,
    context: RequestAuditContext = {},
  ): Promise<ServiceRequestSummary> {
    requirePermission(principal, "requests.update.own");
    assertExpectedVersion(input.expectedVersion);
    const allowedStudentActions: readonly RequestStatus[] = [
      "SUBMITTED",
      "ACCEPTED",
      "REVISION_REQUESTED",
      "COMPLETED",
    ];
    if (!allowedStudentActions.includes(input.toStatus)) {
      throw new RequestDomainError("INVALID_TRANSITION");
    }
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const current = await this.lockOwnedRequest(tx, principal.userId, requestNumber);
      if (toSafeInteger(current.version, "version") !== input.expectedVersion) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const fromStatus = toRequestStatus(current.status);
      if (!canTransitionRequest(fromStatus, input.toStatus, "STUDENT")) {
        throw new RequestDomainError("INVALID_TRANSITION");
      }
      const updated = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests
        SET status = ${input.toStatus}, updated_at = now(), version = version + 1,
            completed_at = CASE WHEN ${input.toStatus} = 'COMPLETED' THEN now() ELSE completed_at END
        WHERE id = ${current.id} AND version = ${input.expectedVersion} AND status = ${fromStatus}
        RETURNING version
      `;
      if (updated[0] === undefined) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      const version = toSafeInteger(updated[0].version, "version");
      const eventId = await this.appendEvent(tx, {
        requestId: current.id,
        eventType: "REQUEST_STATUS_CHANGED",
        actorUserId: principal.userId,
        fromStatus,
        toStatus: input.toStatus,
        requestVersion: version,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      const conversationRows = await tx<{ readonly id: string }[]>`
        SELECT id FROM service_request_conversations WHERE request_id = ${current.id} LIMIT 1
      `;
      if (conversationRows[0] !== undefined) {
        await tx`
          INSERT INTO service_request_messages (
            conversation_id, sender_type, sender_user_id, content_type, body, metadata
          ) VALUES (
            ${conversationRows[0].id}, 'SYSTEM', NULL, 'ACTION', 'STUDENT_ACTION_COMPLETED',
            ${tx.json({ fromStatus, toStatus: input.toStatus, version })}
          )
        `;
        await tx`
          UPDATE service_request_conversations
          SET updated_at = now(), last_message_at = now()
          WHERE id = ${conversationRows[0].id}
        `;
      }
      await this.enqueue(tx, {
        eventType: "REQUEST_STATUS_CHANGED",
        requestId: current.id,
        idempotencyKey: `request:${current.id}:student-status:${input.toStatus}:v${version}`,
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
        eventType: "request.student_status_changed",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "service_request",
        resourceId: current.id,
        metadata: { fromStatus, toStatus: input.toStatus, version },
      });
      return this.readOwnedSummary(tx, principal.userId, current.id);
    });
    this.logger?.info("request_student_status_changed", {
      requestId: result.id,
      status: result.status,
      version: result.version,
    });
    return result;
  }

  public async listStudentRequests(
    principal: AuthenticatedPrincipal,
    input: RequestListInput = {},
  ): Promise<RequestListResult> {
    requirePermission(principal, "requests.read.own");
    const page = Number.isSafeInteger(input.page) && (input.page ?? 0) >= 1 ? input.page! : 1;
    const requestedPageSize =
      Number.isSafeInteger(input.pageSize) && (input.pageSize ?? 0) >= 1 ? input.pageSize! : 20;
    const pageSize = Math.min(requestedPageSize, 50);
    const search = input.search?.trim().slice(0, 100);
    const searchPattern =
      search === undefined || search.length === 0 ? null : `%${escapeLike(search)}%`;
    const status = input.status ?? null;
    const serviceId = input.serviceId ?? null;
    const offset = (page - 1) * pageSize;
    const orderBy =
      input.sort === "oldest"
        ? "requests.created_at ASC, requests.id ASC"
        : input.sort === "deadline"
          ? "requests.deadline_at ASC NULLS LAST, requests.created_at DESC, requests.id DESC"
          : "requests.created_at DESC, requests.id DESC";
    const predicate = `
      requests.student_user_id = $1
      AND requests.archived_at IS NULL
      AND ($2::text IS NULL OR requests.request_number ILIKE $2 ESCAPE E'\\\\'
           OR requests.title ILIKE $2 ESCAPE E'\\\\')
      AND ($3::text IS NULL OR requests.status = $3)
      AND ($4::uuid IS NULL OR requests.service_id = $4)
    `;
    const parameters = [principal.userId, searchPattern, status, serviceId];
    const [countRows, rows] = await Promise.all([
      this.database.unsafe<CountRow[]>(
        `SELECT count(*)::text AS count FROM service_requests AS requests WHERE ${predicate}`,
        parameters,
      ),
      this.database.unsafe<RequestRow[]>(
        `SELECT ${requestSelect}
         FROM service_requests AS requests
         INNER JOIN services ON services.id = requests.service_id
         WHERE ${predicate}
         ORDER BY ${orderBy}
         LIMIT $5 OFFSET $6`,
        [...parameters, pageSize, offset],
      ),
    ]);
    const total = toSafeInteger(countRows[0]?.count ?? "0", "count");
    return {
      items: rows.map(toSummary),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  public async getStudentDashboard(principal: AuthenticatedPrincipal): Promise<StudentDashboard> {
    requirePermission(principal, "requests.read.own");
    const [counts, recent] = await Promise.all([
      this.database<DashboardCountRow[]>`
        SELECT
          count(*) FILTER (
            WHERE status NOT IN ('DRAFT', 'COMPLETED', 'CANCELLED', 'REJECTED')
          )::text AS active_count,
          count(*) FILTER (WHERE status = 'WAITING_FOR_STUDENT')::text AS waiting_count,
          count(*) FILTER (WHERE status = 'COMPLETED')::text AS completed_count
        FROM service_requests
        WHERE student_user_id = ${principal.userId} AND archived_at IS NULL
      `,
      this.database.unsafe<RequestRow[]>(
        `SELECT ${requestSelect}
         FROM service_requests AS requests
         INNER JOIN services ON services.id = requests.service_id
         WHERE requests.student_user_id = $1 AND requests.archived_at IS NULL
         ORDER BY requests.created_at DESC, requests.id DESC
         LIMIT 5`,
        [principal.userId],
      ),
    ]);
    const row = counts[0];
    return {
      activeCount: toSafeInteger(row?.active_count ?? "0", "active_count"),
      waitingForStudentCount: toSafeInteger(row?.waiting_count ?? "0", "waiting_count"),
      completedCount: toSafeInteger(row?.completed_count ?? "0", "completed_count"),
      recent: recent.map(toSummary),
    };
  }

  public async getStudentRequest(
    principal: AuthenticatedPrincipal,
    identifier: string,
  ): Promise<ServiceRequestDetail> {
    requirePermission(principal, "requests.read.own");
    const normalized = identifier.trim();
    if (normalized.length === 0 || normalized.length > 80) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    const rows = await this.database.unsafe<RequestRow[]>(
      `SELECT ${requestSelect}
       FROM service_requests AS requests
       INNER JOIN services ON services.id = requests.service_id
       WHERE requests.student_user_id = $1
         AND (requests.request_number = $2 OR requests.id::text = $2)
       LIMIT 1`,
      [principal.userId, normalized],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    const languageCode = toLanguage(row.language_code);
    const academicLevel = toAcademicLevel(row.academic_level);
    const submittedAt = optionalDate(row.submitted_at);
    const cancelledAt = optionalDate(row.cancelled_at);
    const completedAt = optionalDate(row.completed_at);
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
      ...(row.academic_integrity_version === null
        ? {}
        : { academicIntegrityVersion: row.academic_integrity_version }),
      events: events.map(toEvent),
      attachments: attachments.map(toAttachment),
    };
  }

  private async lockOwnedRequest(
    database: DatabaseClient,
    userId: string,
    requestNumber: string,
  ): Promise<RequestRow> {
    const normalized = requestNumber.trim();
    if (!/^ITQ-[0-9]{4}-[0-9]{6,}$/u.test(normalized)) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    const rows = await database.unsafe<RequestRow[]>(
      `SELECT ${requestSelect}
       FROM service_requests AS requests
       INNER JOIN services ON services.id = requests.service_id
       WHERE requests.student_user_id = $1 AND requests.request_number = $2
       FOR UPDATE OF requests`,
      [userId, normalized],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    return row;
  }

  private async readOwnedSummary(
    database: DatabaseClient,
    userId: string,
    requestId: string,
  ): Promise<ServiceRequestSummary> {
    const rows = await database.unsafe<RequestRow[]>(
      `SELECT ${requestSelect}
       FROM service_requests AS requests
       INNER JOIN services ON services.id = requests.service_id
       WHERE requests.student_user_id = $1 AND requests.id = $2
       LIMIT 1`,
      [userId, requestId],
    );
    if (rows[0] === undefined) {
      throw new RequestDomainError("REQUEST_NOT_FOUND");
    }
    return toSummary(rows[0]);
  }

  private async appendEvent(
    database: DatabaseClient,
    input: {
      readonly requestId: string;
      readonly eventType: string;
      readonly actorUserId: string;
      readonly fromStatus?: RequestStatus;
      readonly toStatus?: RequestStatus;
      readonly requestVersion: number;
      readonly correlationId?: string;
    },
  ): Promise<string> {
    const rows = await database<{ readonly id: number | string }[]>`
      INSERT INTO service_request_events (
        request_id, event_type, actor_type, actor_user_id, from_status, to_status,
        request_version, metadata, correlation_id
      ) VALUES (
        ${input.requestId}, ${input.eventType}, 'STUDENT', ${input.actorUserId},
        ${input.fromStatus ?? null}, ${input.toStatus ?? null}, ${input.requestVersion},
        '{}'::jsonb, ${input.correlationId ?? null}
      )
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error("Request event insert did not return an id.");
    }
    return String(id);
  }

  private async enqueue(
    database: DatabaseClient,
    input: {
      readonly eventType: string;
      readonly requestId: string;
      readonly idempotencyKey: string;
      readonly payload: JsonObject;
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

  private academicIntegrityVersion(): string {
    const value = this.config.academicIntegrityVersion;
    if (value.trim().length === 0) {
      throw new RequestDomainError("ACADEMIC_INTEGRITY_VERSION_MISMATCH");
    }
    return value;
  }
}
