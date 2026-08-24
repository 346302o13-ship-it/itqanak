import {
  recordAuditEvent,
  requirePermission,
  requireRole,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";

import {
  FinanceError,
  type AdminFinanceDue,
  type CreateFinanceDueInput,
  type FinanceCurrency,
  type FinanceCurrencyReport,
  type FinanceDue,
  type FinanceDueStatus,
  type FinanceListInput,
  type FinanceListResult,
  type FinancePaymentMethod,
  type FinanceReport,
  type RecordFinancePaymentInput,
  type ReverseFinancePaymentInput,
  type VoidFinanceDueInput,
} from "./types.js";
import {
  assertFinanceCurrency,
  assertFinanceDueId,
  assertFinanceDueStatus,
  assertFinancePaymentMethod,
  assertFinanceVersion,
  normalizeCreateFinanceDue,
  normalizeFinanceReason,
  normalizePaymentNote,
  normalizePaymentReference,
} from "./validation.js";

interface FinanceDueRow {
  readonly id: string;
  readonly reference: string;
  readonly request_id: string;
  readonly request_number: string;
  readonly student_user_id: string;
  readonly student_display_name: string | null;
  readonly title_ar: string;
  readonly title_en: string;
  readonly description_ar: string | null;
  readonly description_en: string | null;
  readonly amount_minor: number | string;
  readonly currency: string;
  readonly minor_unit: number | string;
  readonly status: string;
  readonly due_at: Date | string | null;
  readonly paid_at: Date | string | null;
  readonly voided_at: Date | string | null;
  readonly version: number | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly latest_payment_method: string | null;
  readonly latest_payment_reference: string | null;
}

interface CountRow {
  readonly count: number | string;
}

interface FinanceReportRow {
  readonly currency: string;
  readonly minor_unit: number | string;
  readonly unpaid_count: number | string;
  readonly unpaid_amount_minor: number | string;
  readonly paid_count: number | string;
  readonly paid_amount_minor: number | string;
  readonly voided_count: number | string;
}

interface RequestOwnerRow {
  readonly id: string;
  readonly student_user_id: string;
  readonly student_display_name: string;
  readonly status: string;
}

interface PaymentEntryRow {
  readonly id: string;
}

export interface FinanceServiceOptions {
  readonly database: DatabaseClient;
}

const dueBaseSelect = `
  dues.id, dues.reference, dues.request_id, requests.request_number,
  dues.student_user_id, dues.title_ar, dues.title_en, dues.description_ar, dues.description_en,
  dues.amount_minor, dues.currency, dues.minor_unit, dues.status, dues.due_at,
  dues.paid_at, dues.voided_at, dues.version, dues.created_at, dues.updated_at
`;

const studentDueSelect = `
  ${dueBaseSelect}, NULL::text AS student_display_name,
  NULL::text AS latest_payment_method, NULL::text AS latest_payment_reference
`;

const adminDueSelect = `
  ${dueBaseSelect}, students.display_name AS student_display_name,
  latest_payment.payment_method AS latest_payment_method,
  latest_payment.payment_reference AS latest_payment_reference
`;

const dueJoins = `
  INNER JOIN service_requests AS requests ON requests.id = dues.request_id
  INNER JOIN users AS students ON students.id = dues.student_user_id
  LEFT JOIN LATERAL (
    SELECT entries.payment_method, entries.payment_reference
    FROM finance_ledger_entries AS entries
    WHERE entries.due_id = dues.id AND entries.entry_type = 'PAYMENT_RECORDED'
      AND NOT EXISTS (
        SELECT 1 FROM finance_ledger_entries AS reversals
        WHERE reversals.related_entry_id = entries.id
          AND reversals.entry_type = 'PAYMENT_REVERSED'
      )
    ORDER BY entries.created_at DESC, entries.id DESC
    LIMIT 1
  ) AS latest_payment ON TRUE
`;

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Finance row contains an invalid timestamp.");
  return parsed;
}

function optionalDate(value: Date | string | null): Date | undefined {
  return value === null ? undefined : toDate(value);
}

function toSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Finance row contains an invalid ${field}.`);
  }
  return parsed;
}

function toSignedSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Finance row contains an invalid ${field}.`);
  return parsed;
}

function toMinorUnit(value: number | string): 2 | 3 {
  const parsed = toSafeInteger(value, "minor_unit");
  if (parsed !== 2 && parsed !== 3) throw new Error("Finance row has an unsupported minor unit.");
  return parsed;
}

function toCurrency(value: string): FinanceCurrency {
  try {
    return assertFinanceCurrency(value.trim());
  } catch {
    throw new Error("Finance row has an unsupported currency.");
  }
}

function toStatus(value: string): FinanceDueStatus {
  try {
    return assertFinanceDueStatus(value);
  } catch {
    throw new Error("Finance row has an unsupported status.");
  }
}

function optionalPaymentMethod(value: string | null): FinancePaymentMethod | undefined {
  if (value === null) return undefined;
  try {
    return assertFinancePaymentMethod(value);
  } catch {
    throw new Error("Finance row has an unsupported payment method.");
  }
}

function toFinanceDue(row: FinanceDueRow): FinanceDue {
  const dueAt = optionalDate(row.due_at);
  const paidAt = optionalDate(row.paid_at);
  const voidedAt = optionalDate(row.voided_at);
  return {
    id: row.id,
    reference: row.reference,
    requestId: row.request_id,
    requestNumber: row.request_number,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    ...(row.description_ar === null ? {} : { descriptionAr: row.description_ar }),
    ...(row.description_en === null ? {} : { descriptionEn: row.description_en }),
    amountMinor: toSafeInteger(row.amount_minor, "amount_minor"),
    currency: toCurrency(row.currency),
    minorUnit: toMinorUnit(row.minor_unit),
    status: toStatus(row.status),
    ...(dueAt === undefined ? {} : { dueAt }),
    ...(paidAt === undefined ? {} : { paidAt }),
    ...(voidedAt === undefined ? {} : { voidedAt }),
    version: toSafeInteger(row.version, "version"),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toAdminFinanceDue(row: FinanceDueRow): AdminFinanceDue {
  const paymentMethod = optionalPaymentMethod(row.latest_payment_method);
  if (row.student_display_name === null) {
    throw new Error("Administrative finance row is missing the student display name.");
  }
  return {
    ...toFinanceDue(row),
    studentUserId: row.student_user_id,
    studentDisplayName: row.student_display_name,
    ...(paymentMethod === undefined ? {} : { latestPaymentMethod: paymentMethod }),
    ...(row.latest_payment_reference === null
      ? {}
      : { latestPaymentReference: row.latest_payment_reference }),
  };
}

function normalizedList(input: FinanceListInput, maximumPageSize: number) {
  const page = Number.isSafeInteger(input.page) && (input.page ?? 0) >= 1 ? input.page! : 1;
  const requestedPageSize =
    Number.isSafeInteger(input.pageSize) && (input.pageSize ?? 0) >= 1 ? input.pageSize! : 20;
  const pageSize = Math.min(requestedPageSize, maximumPageSize);
  const search = input.search?.trim().slice(0, 100) ?? "";
  const searchPattern = search.length === 0 ? null : `%${search.replace(/[\\%_]/gu, "\\$&")}%`;
  const status = input.status === undefined ? null : assertFinanceDueStatus(input.status);
  const currency = input.currency === undefined ? null : assertFinanceCurrency(input.currency);
  return { page, pageSize, offset: (page - 1) * pageSize, searchPattern, status, currency };
}

function toReport(rows: readonly FinanceReportRow[]): FinanceReport {
  return {
    totals: rows.map(
      (row): FinanceCurrencyReport => ({
        currency: toCurrency(row.currency),
        minorUnit: toMinorUnit(row.minor_unit),
        unpaidCount: toSafeInteger(row.unpaid_count, "unpaid_count"),
        unpaidAmountMinor: toSignedSafeInteger(row.unpaid_amount_minor, "unpaid_amount_minor"),
        paidCount: toSafeInteger(row.paid_count, "paid_count"),
        paidAmountMinor: toSignedSafeInteger(row.paid_amount_minor, "paid_amount_minor"),
        voidedCount: toSafeInteger(row.voided_count, "voided_count"),
      }),
    ),
  };
}

function requireAdminFinancePermission(
  principal: AuthenticatedPrincipal,
  permission: "admin.finance.read" | "admin.finance.manage" | "admin.finance.reports.read",
): AuthenticatedPrincipal {
  return requirePermission(requireRole(principal, "ADMIN"), permission);
}

export class FinanceService {
  private readonly database: DatabaseClient;

  public constructor(options: FinanceServiceOptions) {
    this.database = options.database;
  }

  public async listStudentDues(
    principal: AuthenticatedPrincipal,
    input: FinanceListInput = {},
  ): Promise<FinanceListResult> {
    requirePermission(principal, "finance.read.own");
    const normalized = normalizedList(input, 50);
    const predicate = `
      dues.student_user_id = $1
      AND ($2::text IS NULL OR dues.reference ILIKE $2 ESCAPE E'\\\\'
        OR requests.request_number ILIKE $2 ESCAPE E'\\\\'
        OR dues.title_ar ILIKE $2 ESCAPE E'\\\\'
        OR dues.title_en ILIKE $2 ESCAPE E'\\\\')
      AND ($3::text IS NULL OR dues.status = $3)
      AND ($4::text IS NULL OR dues.currency = $4)
    `;
    const parameters = [
      principal.userId,
      normalized.searchPattern,
      normalized.status,
      normalized.currency,
    ];
    const [counts, rows] = await Promise.all([
      this.database.unsafe<CountRow[]>(
        `SELECT count(*)::text AS count
         FROM finance_dues AS dues
         INNER JOIN service_requests AS requests ON requests.id = dues.request_id
         WHERE ${predicate}`,
        parameters,
      ),
      this.database.unsafe<FinanceDueRow[]>(
        `SELECT ${studentDueSelect}
         FROM finance_dues AS dues
         INNER JOIN service_requests AS requests ON requests.id = dues.request_id
         WHERE ${predicate}
         ORDER BY dues.created_at DESC, dues.id DESC
         LIMIT $5 OFFSET $6`,
        [...parameters, normalized.pageSize, normalized.offset],
      ),
    ]);
    const total = toSafeInteger(counts[0]?.count ?? "0", "count");
    return {
      items: rows.map(toFinanceDue),
      page: normalized.page,
      pageSize: normalized.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / normalized.pageSize)),
    };
  }

  public async getStudentReport(principal: AuthenticatedPrincipal): Promise<FinanceReport> {
    requirePermission(principal, "finance.read.own");
    const rows = await this.database<FinanceReportRow[]>`
      SELECT currency, minor_unit,
        count(*) FILTER (WHERE status = 'UNPAID')::text AS unpaid_count,
        coalesce(sum(amount_minor) FILTER (WHERE status = 'UNPAID'), 0)::text AS unpaid_amount_minor,
        count(*) FILTER (WHERE status = 'PAID')::text AS paid_count,
        coalesce(sum(amount_minor) FILTER (WHERE status = 'PAID'), 0)::text AS paid_amount_minor,
        count(*) FILTER (WHERE status = 'VOIDED')::text AS voided_count
      FROM finance_dues
      WHERE student_user_id = ${principal.userId}
      GROUP BY currency, minor_unit
      ORDER BY currency ASC
    `;
    return toReport(rows);
  }

  public async listAdminDues(
    principal: AuthenticatedPrincipal,
    input: FinanceListInput = {},
  ): Promise<FinanceListResult<AdminFinanceDue>> {
    requireAdminFinancePermission(principal, "admin.finance.read");
    const normalized = normalizedList(input, 100);
    const predicate = `
      ($1::text IS NULL OR dues.reference ILIKE $1 ESCAPE E'\\\\'
        OR requests.request_number ILIKE $1 ESCAPE E'\\\\'
        OR students.display_name ILIKE $1 ESCAPE E'\\\\'
        OR dues.title_ar ILIKE $1 ESCAPE E'\\\\'
        OR dues.title_en ILIKE $1 ESCAPE E'\\\\')
      AND ($2::text IS NULL OR dues.status = $2)
      AND ($3::text IS NULL OR dues.currency = $3)
    `;
    const parameters = [normalized.searchPattern, normalized.status, normalized.currency];
    const [counts, rows] = await Promise.all([
      this.database.unsafe<CountRow[]>(
        `SELECT count(*)::text AS count
         FROM finance_dues AS dues
         INNER JOIN service_requests AS requests ON requests.id = dues.request_id
         INNER JOIN users AS students ON students.id = dues.student_user_id
         WHERE ${predicate}`,
        parameters,
      ),
      this.database.unsafe<FinanceDueRow[]>(
        `SELECT ${adminDueSelect}
         FROM finance_dues AS dues
         ${dueJoins}
         WHERE ${predicate}
         ORDER BY dues.created_at DESC, dues.id DESC
         LIMIT $4 OFFSET $5`,
        [...parameters, normalized.pageSize, normalized.offset],
      ),
    ]);
    const total = toSafeInteger(counts[0]?.count ?? "0", "count");
    return {
      items: rows.map(toAdminFinanceDue),
      page: normalized.page,
      pageSize: normalized.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / normalized.pageSize)),
    };
  }

  public async getAdminReport(
    principal: AuthenticatedPrincipal,
    context: RequestAuditContext = {},
  ): Promise<FinanceReport> {
    requireAdminFinancePermission(principal, "admin.finance.reports.read");
    const rows = await this.database<FinanceReportRow[]>`
      SELECT currency, minor_unit,
        count(*) FILTER (WHERE status = 'UNPAID')::text AS unpaid_count,
        coalesce(sum(amount_minor) FILTER (WHERE status = 'UNPAID'), 0)::text AS unpaid_amount_minor,
        count(*) FILTER (WHERE status = 'PAID')::text AS paid_count,
        coalesce(sum(amount_minor) FILTER (WHERE status = 'PAID'), 0)::text AS paid_amount_minor,
        count(*) FILTER (WHERE status = 'VOIDED')::text AS voided_count
      FROM finance_dues
      GROUP BY currency, minor_unit
      ORDER BY currency ASC
    `;
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "finance.report_read",
      outcome: "SUCCESS",
      actorUserId: principal.userId,
      sessionId: principal.sessionId,
      metadata: { currencyCount: rows.length },
    });
    return toReport(rows);
  }

  public async createDue(
    principal: AuthenticatedPrincipal,
    input: CreateFinanceDueInput,
    context: RequestAuditContext = {},
  ): Promise<AdminFinanceDue> {
    requireAdminFinancePermission(principal, "admin.finance.manage");
    const fields = normalizeCreateFinanceDue(input);
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const requests = await tx<RequestOwnerRow[]>`
        SELECT requests.id, requests.student_user_id, students.display_name AS student_display_name,
               requests.status
        FROM service_requests AS requests
        INNER JOIN users AS students ON students.id = requests.student_user_id
        WHERE requests.request_number = ${fields.requestNumber}
        FOR SHARE OF requests, students
      `;
      const request = requests[0];
      if (request === undefined) throw new FinanceError("REQUEST_NOT_FOUND");
      if (request.status === "DRAFT") throw new FinanceError("REQUEST_NOT_ELIGIBLE");
      const rows = await tx<FinanceDueRow[]>`
        INSERT INTO finance_dues (
          request_id, student_user_id, title_ar, title_en, description_ar, description_en,
          amount_minor, currency, minor_unit, due_at, created_by_user_id, updated_by_user_id
        ) VALUES (
          ${request.id}, ${request.student_user_id}, ${fields.titleAr}, ${fields.titleEn},
          ${fields.descriptionAr}, ${fields.descriptionEn}, ${fields.amountMinor},
          ${fields.currency}, ${fields.minorUnit}, ${fields.dueAt},
          ${principal.userId}, ${principal.userId}
        )
        RETURNING id, reference, request_id, ${fields.requestNumber}::text AS request_number,
          student_user_id, ${request.student_display_name}::text AS student_display_name,
          title_ar, title_en, description_ar, description_en, amount_minor, currency,
          minor_unit, status, due_at, paid_at, voided_at, version, created_at, updated_at,
          NULL::text AS latest_payment_method, NULL::text AS latest_payment_reference
      `;
      const row = rows[0];
      if (row === undefined) throw new Error("Finance due insert did not return a row.");
      await tx`
        INSERT INTO finance_ledger_entries (
          due_id, due_version, entry_type, amount_minor, currency, minor_unit, actor_user_id
        ) VALUES (
          ${row.id}, 1, 'DUE_CREATED', ${fields.amountMinor}, ${fields.currency},
          ${fields.minorUnit}, ${principal.userId}
        )
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "finance.due_created",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: request.student_user_id,
        sessionId: principal.sessionId,
        resourceType: "finance_due",
        resourceId: row.id,
        metadata: {
          requestId: request.id,
          amountMinor: fields.amountMinor,
          currency: fields.currency,
          minorUnit: fields.minorUnit,
          version: 1,
        },
      });
      return toAdminFinanceDue(row);
    });
  }

  public async recordPayment(
    principal: AuthenticatedPrincipal,
    dueIdInput: string,
    input: RecordFinancePaymentInput,
    context: RequestAuditContext = {},
  ): Promise<AdminFinanceDue> {
    requireAdminFinancePermission(principal, "admin.finance.manage");
    const dueId = assertFinanceDueId(dueIdInput);
    const expectedVersion = assertFinanceVersion(input.expectedVersion);
    const method = assertFinancePaymentMethod(input.method);
    const reference = normalizePaymentReference(input.reference);
    const note = normalizePaymentNote(input.note);
    if (reference === null) {
      throw new FinanceError("INVALID_REFERENCE");
    }
    return this.changeDue(principal, dueId, expectedVersion, "PAYMENT_RECORDED", context, {
      method,
      reference,
      note,
    });
  }

  public async reversePayment(
    principal: AuthenticatedPrincipal,
    dueIdInput: string,
    input: ReverseFinancePaymentInput,
    context: RequestAuditContext = {},
  ): Promise<AdminFinanceDue> {
    requireAdminFinancePermission(principal, "admin.finance.manage");
    const dueId = assertFinanceDueId(dueIdInput);
    const expectedVersion = assertFinanceVersion(input.expectedVersion);
    const reason = normalizeFinanceReason(input.reason);
    return this.changeDue(principal, dueId, expectedVersion, "PAYMENT_REVERSED", context, {
      note: reason,
    });
  }

  public async voidDue(
    principal: AuthenticatedPrincipal,
    dueIdInput: string,
    input: VoidFinanceDueInput,
    context: RequestAuditContext = {},
  ): Promise<AdminFinanceDue> {
    requireAdminFinancePermission(principal, "admin.finance.manage");
    const dueId = assertFinanceDueId(dueIdInput);
    const expectedVersion = assertFinanceVersion(input.expectedVersion);
    const reason = normalizeFinanceReason(input.reason);
    return this.changeDue(principal, dueId, expectedVersion, "DUE_VOIDED", context, {
      note: reason,
    });
  }

  private async changeDue(
    principal: AuthenticatedPrincipal,
    dueId: string,
    expectedVersion: number,
    entryType: "PAYMENT_RECORDED" | "PAYMENT_REVERSED" | "DUE_VOIDED",
    context: RequestAuditContext,
    details: {
      readonly method?: FinancePaymentMethod;
      readonly reference?: string | null;
      readonly note?: string | null;
    },
  ): Promise<AdminFinanceDue> {
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx.unsafe<FinanceDueRow[]>(
        `SELECT ${adminDueSelect}
         FROM finance_dues AS dues
         ${dueJoins}
         WHERE dues.id = $1
         FOR UPDATE OF dues`,
        [dueId],
      );
      const row = rows[0];
      if (row === undefined) throw new FinanceError("DUE_NOT_FOUND");
      const current = toAdminFinanceDue(row);
      if (current.version !== expectedVersion) throw new FinanceError("VERSION_CONFLICT");
      const expectedStatus = entryType === "PAYMENT_REVERSED" ? "PAID" : "UNPAID";
      if (current.status !== expectedStatus) throw new FinanceError("INVALID_TRANSITION");
      const nextVersion = current.version + 1;
      let relatedEntryId: string | null = null;
      if (entryType === "PAYMENT_REVERSED") {
        const payments = await tx<PaymentEntryRow[]>`
          SELECT payments.id
          FROM finance_ledger_entries AS payments
          WHERE payments.due_id = ${current.id}
            AND payments.entry_type = 'PAYMENT_RECORDED'
            AND NOT EXISTS (
              SELECT 1 FROM finance_ledger_entries AS reversals
              WHERE reversals.related_entry_id = payments.id
                AND reversals.entry_type = 'PAYMENT_REVERSED'
            )
          ORDER BY payments.created_at DESC, payments.id DESC
          LIMIT 1
          FOR SHARE OF payments
        `;
        relatedEntryId = payments[0]?.id ?? null;
        if (relatedEntryId === null) throw new FinanceError("INVALID_TRANSITION");
      }
      const ledgerAmount =
        entryType === "PAYMENT_REVERSED"
          ? -current.amountMinor
          : entryType === "DUE_VOIDED"
            ? 0
            : current.amountMinor;
      await tx`
        INSERT INTO finance_ledger_entries (
          due_id, due_version, entry_type, amount_minor, currency, minor_unit,
          payment_method, payment_reference, related_entry_id, note, actor_user_id
        ) VALUES (
          ${current.id}, ${nextVersion}, ${entryType}, ${ledgerAmount}, ${current.currency},
          ${current.minorUnit}, ${details.method ?? null}, ${details.reference ?? null},
          ${relatedEntryId}, ${details.note ?? null}, ${principal.userId}
        )
      `;
      const nextStatus =
        entryType === "PAYMENT_RECORDED"
          ? "PAID"
          : entryType === "DUE_VOIDED"
            ? "VOIDED"
            : "UNPAID";
      const updated = await tx<{ readonly id: string }[]>`
        UPDATE finance_dues
        SET status = ${nextStatus}, updated_by_user_id = ${principal.userId},
            paid_at = CASE WHEN ${nextStatus} = 'PAID' THEN clock_timestamp() ELSE NULL END,
            paid_by_user_id = CASE WHEN ${nextStatus} = 'PAID' THEN ${principal.userId}::uuid ELSE NULL END,
            voided_at = CASE WHEN ${nextStatus} = 'VOIDED' THEN clock_timestamp() ELSE NULL END,
            voided_by_user_id = CASE WHEN ${nextStatus} = 'VOIDED' THEN ${principal.userId}::uuid ELSE NULL END,
            updated_at = clock_timestamp(), version = version + 1
        WHERE id = ${current.id} AND version = ${expectedVersion} AND status = ${expectedStatus}
        RETURNING id
      `;
      if (updated[0] === undefined) throw new FinanceError("VERSION_CONFLICT");
      await recordAuditEvent(tx, {
        ...context,
        eventType:
          entryType === "PAYMENT_RECORDED"
            ? "finance.payment_recorded"
            : entryType === "PAYMENT_REVERSED"
              ? "finance.payment_reversed"
              : "finance.due_voided",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: current.studentUserId,
        sessionId: principal.sessionId,
        resourceType: "finance_due",
        resourceId: current.id,
        metadata: {
          fromStatus: current.status,
          toStatus: nextStatus,
          amountMinor: current.amountMinor,
          currency: current.currency,
          minorUnit: current.minorUnit,
          version: nextVersion,
        },
      });
      const refreshed = await tx.unsafe<FinanceDueRow[]>(
        `SELECT ${adminDueSelect}
         FROM finance_dues AS dues
         ${dueJoins}
         WHERE dues.id = $1
         LIMIT 1`,
        [current.id],
      );
      const result = refreshed[0];
      if (result === undefined) throw new Error("Updated finance due could not be reloaded.");
      return toAdminFinanceDue(result);
    });
  }
}
