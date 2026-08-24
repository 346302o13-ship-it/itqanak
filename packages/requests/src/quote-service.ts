import {
  recordAuditEvent,
  requirePermission,
  requireRole,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import { canTransitionRequest, isRequestStatus, type RequestStatus } from "@itqanak/core";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

import { isUuid } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";
import type {
  CreateServiceQuoteInput,
  CreateServiceQuoteResult,
  RespondToServiceQuoteInput,
  RespondToServiceQuoteResult,
  ServiceQuote,
  ServiceQuoteCurrency,
  ServiceQuoteStatus,
  WithdrawServiceQuoteInput,
  WithdrawServiceQuoteResult,
} from "./types.js";
import { UnifiedConversationService } from "./unified-conversation-service.js";
import {
  normalizeQuoteResponseInput,
  normalizeQuoteWithdrawalInput,
  normalizeServiceQuoteInput,
} from "./unified-validation.js";

interface QuoteRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly request_id: string;
  readonly student_user_id: string;
  readonly created_by_user_id: string;
  readonly amount_minor: number | string;
  readonly currency: string;
  readonly minor_unit: number | string;
  readonly description_ar: string;
  readonly description_en: string;
  readonly expires_at: Date | string;
  readonly status: string;
  readonly version: number | string;
  readonly client_quote_id: string;
  readonly client_payload_fingerprint: string;
  readonly response_client_id: string | null;
  readonly response_payload_fingerprint: string | null;
  readonly responded_at: Date | string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface RequestForQuoteRow {
  readonly id: string;
  readonly request_number: string;
  readonly student_user_id: string;
  readonly status: string;
  readonly version: number | string;
  readonly conversation_id: string;
}

export interface ServiceQuoteServiceOptions {
  readonly database: DatabaseClient;
  readonly logger?: Logger;
  readonly conversations?: UnifiedConversationService;
}

const quoteSelect = `
  id, conversation_id, request_id, student_user_id, created_by_user_id,
  amount_minor, currency, minor_unit, description_ar, description_en,
  expires_at, status, version, client_quote_id, client_payload_fingerprint,
  response_client_id, response_payload_fingerprint, responded_at, created_at, updated_at
`;

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Service quote contains an invalid date.");
  return parsed;
}

function toSafeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Service quote contains an invalid ${field}.`);
  }
  return parsed;
}

function toQuote(row: QuoteRow): ServiceQuote {
  if (row.currency !== "SAR" && row.currency !== "AED" && row.currency !== "KWD") {
    throw new Error("Service quote contains an invalid currency.");
  }
  if (
    row.status !== "PENDING" &&
    row.status !== "ACCEPTED" &&
    row.status !== "REJECTED" &&
    row.status !== "EXPIRED" &&
    row.status !== "WITHDRAWN"
  ) {
    throw new Error("Service quote contains an invalid status.");
  }
  const minorUnit = toSafeInteger(row.minor_unit, "minor unit");
  if (minorUnit !== 2 && minorUnit !== 3) throw new Error("Invalid service quote minor unit.");
  return {
    id: row.id,
    conversationId: row.conversation_id,
    requestId: row.request_id,
    studentUserId: row.student_user_id,
    amountMinor: toSafeInteger(row.amount_minor, "amount"),
    currency: row.currency as ServiceQuoteCurrency,
    minorUnit,
    descriptionAr: row.description_ar,
    descriptionEn: row.description_en,
    expiresAt: toDate(row.expires_at),
    status: row.status as ServiceQuoteStatus,
    version: toSafeInteger(row.version, "version"),
    createdByUserId: row.created_by_user_id,
    ...(row.responded_at === null ? {} : { respondedAt: toDate(row.responded_at) }),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toRequestStatus(value: string): RequestStatus {
  if (!isRequestStatus(value)) throw new Error("Quote request contains an invalid status.");
  return value;
}

export class ServiceQuoteService {
  private readonly database: DatabaseClient;
  private readonly logger: Logger | undefined;
  private readonly conversations: UnifiedConversationService;

  public constructor(options: ServiceQuoteServiceOptions) {
    this.database = options.database;
    this.logger = options.logger;
    this.conversations =
      options.conversations ?? new UnifiedConversationService({ database: options.database });
  }

  public async getQuote(principal: AuthenticatedPrincipal, quoteId: string): Promise<ServiceQuote> {
    if (!isUuid(quoteId)) throw new RequestDomainError("QUOTE_NOT_FOUND");
    const admin =
      principal.roles.includes("ADMIN") && principal.permissions.includes("admin.quotes.manage");
    if (admin) requireRole(principal, "ADMIN");
    else requirePermission(requireRole(principal, "STUDENT"), "quotes.respond.own");
    const rows = await this.database.unsafe<QuoteRow[]>(
      `SELECT ${quoteSelect} FROM service_quotes
       WHERE id = $1 AND ($2::boolean OR student_user_id = $3) LIMIT 1`,
      [quoteId, admin, principal.userId],
    );
    if (rows[0] === undefined) throw new RequestDomainError("QUOTE_NOT_FOUND");
    return toQuote(rows[0]);
  }

  public async createQuote(
    principal: AuthenticatedPrincipal,
    input: CreateServiceQuoteInput,
    context: RequestAuditContext = {},
  ): Promise<CreateServiceQuoteResult> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.quotes.manage");
    const normalized = normalizeServiceQuoteInput(input);
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      // Serialize one administrator/idempotency key before taking domain-row
      // locks. This closes the race where two identical submissions both miss
      // the replay row and one later fails the unique constraint.
      await tx`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${principal.userId}:${normalized.clientQuoteId}`}, 0)
        )
      `;
      const replay = await tx<QuoteRow[]>`
        SELECT ${tx.unsafe(quoteSelect)} FROM service_quotes
        WHERE created_by_user_id = ${principal.userId}
          AND client_quote_id = ${normalized.clientQuoteId}
        LIMIT 1
      `;
      if (replay[0] !== undefined) {
        if (replay[0].client_payload_fingerprint !== normalized.fingerprint) {
          throw new RequestDomainError("IDEMPOTENCY_KEY_REUSED");
        }
        const messageId = await this.quoteActionMessageId(
          tx,
          replay[0].id,
          "SERVICE_QUOTE_CREATED",
        );
        return {
          quote: toQuote(replay[0]),
          message: await this.conversations.readMessage(tx, messageId),
          idempotentReplay: true,
        };
      }

      const requestRows = await tx<RequestForQuoteRow[]>`
        SELECT requests.id, requests.request_number, requests.student_user_id,
               requests.status, requests.version, conversations.id AS conversation_id
        FROM service_requests AS requests
        INNER JOIN support_conversations AS conversations
          ON conversations.student_user_id = requests.student_user_id
        WHERE requests.id = ${normalized.requestId}
        FOR UPDATE OF requests
      `;
      const request = requestRows[0];
      if (request === undefined) throw new RequestDomainError("REQUEST_NOT_FOUND");
      let requestVersion = toSafeInteger(request.version, "request version");
      if (requestVersion !== normalized.expectedRequestVersion) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }

      await tx`
        UPDATE service_quotes
        SET status = 'EXPIRED', version = version + 1, updated_at = now(),
            last_actor_type = 'SYSTEM', last_actor_user_id = NULL
        WHERE request_id = ${request.id} AND status = 'PENDING' AND expires_at <= now()
      `;
      const pending = await tx<{ readonly id: string }[]>`
        SELECT id FROM service_quotes
        WHERE request_id = ${request.id} AND status = 'PENDING'
        LIMIT 1 FOR UPDATE
      `;
      if (pending[0] !== undefined) throw new RequestDomainError("QUOTE_NOT_PENDING");

      let requestStatus = toRequestStatus(request.status);
      if (requestStatus === "SUBMITTED" || requestStatus === "WAITING_FOR_STUDENT") {
        requestVersion = await this.transitionRequest(
          tx,
          request,
          requestStatus,
          "UNDER_REVIEW",
          requestVersion,
          principal.userId,
          context.correlationId,
        );
        requestStatus = "UNDER_REVIEW";
      }
      if (requestStatus === "UNDER_REVIEW") {
        requestVersion = await this.transitionRequest(
          tx,
          request,
          requestStatus,
          "QUOTED",
          requestVersion,
          principal.userId,
          context.correlationId,
        );
        requestStatus = "QUOTED";
      }
      if (requestStatus !== "QUOTED") throw new RequestDomainError("INVALID_TRANSITION");

      const inserted = await tx<QuoteRow[]>`
        INSERT INTO service_quotes (
          conversation_id, request_id, student_user_id, created_by_user_id,
          amount_minor, currency, minor_unit, description_ar, description_en,
          expires_at, client_quote_id, client_payload_fingerprint,
          last_actor_type, last_actor_user_id
        ) VALUES (
          ${request.conversation_id}, ${request.id}, ${request.student_user_id},
          ${principal.userId}, ${normalized.amountMinor}, ${normalized.currency},
          ${normalized.minorUnit}, ${normalized.descriptionAr}, ${normalized.descriptionEn},
          ${normalized.expiresAt}, ${normalized.clientQuoteId}, ${normalized.fingerprint},
          'ADMIN', ${principal.userId}
        ) RETURNING ${tx.unsafe(quoteSelect)}
      `;
      const quote = inserted[0];
      if (quote === undefined) throw new Error("Service quote insert did not return a row.");
      const messageId = await this.insertActionMessage(tx, {
        conversationId: request.conversation_id,
        requestId: request.id,
        quoteId: quote.id,
        senderType: "ADMIN",
        senderUserId: principal.userId,
        body: "SERVICE_QUOTE_CREATED",
        metadata: { quoteId: quote.id, requestVersion },
      });
      await this.notify(tx, {
        recipientUserId: request.student_user_id,
        kind: "QUOTE_RECEIVED",
        conversationId: request.conversation_id,
        requestId: request.id,
        messageId,
        quoteId: quote.id,
        titleAr: "عرض سعر جديد",
        titleEn: "New quote",
        bodyAr: `تم إرسال عرض سعر للطلب ${request.request_number}.`,
        bodyEn: `A quote was sent for request ${request.request_number}.`,
        idempotencyKey: `quote:${quote.id}:created:recipient:${request.student_user_id}`,
      });
      await this.appendQuoteEvent(tx, {
        eventType: "SERVICE_QUOTE_CREATED",
        requestId: request.id,
        actorType: "ADMIN",
        actorUserId: principal.userId,
        requestVersion,
        quoteId: quote.id,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.enqueue(
        tx,
        "SERVICE_QUOTE_CREATED",
        quote.id,
        request.id,
        request.student_user_id,
      );
      await recordAuditEvent(tx, {
        ...context,
        eventType: "service_quote.created",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: request.student_user_id,
        sessionId: principal.sessionId,
        resourceType: "service_quote",
        resourceId: quote.id,
        metadata: { requestId: request.id, currency: normalized.currency, requestVersion },
      });
      return {
        quote: toQuote(quote),
        message: await this.conversations.readMessage(tx, messageId),
        idempotentReplay: false,
      };
    });
    this.logger?.info("service_quote_created", {
      quoteId: result.quote.id,
      requestId: result.quote.requestId,
      idempotentReplay: result.idempotentReplay,
    });
    return result;
  }

  public async respondToQuote(
    principal: AuthenticatedPrincipal,
    quoteId: string,
    input: RespondToServiceQuoteInput,
    context: RequestAuditContext = {},
  ): Promise<RespondToServiceQuoteResult> {
    requirePermission(requireRole(principal, "STUDENT"), "quotes.respond.own");
    if (!isUuid(quoteId)) throw new RequestDomainError("QUOTE_NOT_FOUND");
    const normalized = normalizeQuoteResponseInput(input);
    const transactionResult = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      // Discover the immutable request reference without a row lock, then use
      // the same request -> quote lock order as createQuote. Re-read the quote
      // under lock before making any decision.
      const quoteReferences = await tx<{ readonly request_id: string }[]>`
        SELECT request_id FROM service_quotes
        WHERE id = ${quoteId} AND student_user_id = ${principal.userId}
      `;
      const quoteReference = quoteReferences[0];
      if (quoteReference === undefined) throw new RequestDomainError("QUOTE_NOT_FOUND");

      const requestRows = await tx<RequestForQuoteRow[]>`
        SELECT requests.id, requests.request_number, requests.student_user_id,
               requests.status, requests.version, conversations.id AS conversation_id
        FROM service_requests AS requests
        INNER JOIN support_conversations AS conversations
          ON conversations.student_user_id = requests.student_user_id
        WHERE requests.id = ${quoteReference.request_id}
          AND requests.student_user_id = ${principal.userId}
        FOR UPDATE OF requests
      `;
      const request = requestRows[0];
      if (request === undefined) throw new RequestDomainError("REQUEST_NOT_FOUND");

      const quoteRows = await tx.unsafe<QuoteRow[]>(
        `SELECT ${quoteSelect} FROM service_quotes
         WHERE id = $1 AND student_user_id = $2 AND request_id = $3 FOR UPDATE`,
        [quoteId, principal.userId, request.id],
      );
      const quote = quoteRows[0];
      if (quote === undefined) throw new RequestDomainError("QUOTE_NOT_FOUND");

      if (quote.response_client_id === normalized.clientActionId) {
        if (quote.response_payload_fingerprint !== normalized.fingerprint) {
          throw new RequestDomainError("IDEMPOTENCY_KEY_REUSED");
        }
        const body =
          quote.status === "ACCEPTED" ? "SERVICE_QUOTE_ACCEPTED" : "SERVICE_QUOTE_REJECTED";
        const messageId = await this.quoteActionMessageId(tx, quote.id, body);
        return {
          kind: "success" as const,
          value: {
            quote: toQuote(quote),
            message: await this.conversations.readMessage(tx, messageId),
            idempotentReplay: true,
          },
        };
      }
      if (toSafeInteger(quote.version, "version") !== normalized.expectedVersion) {
        throw new RequestDomainError("QUOTE_VERSION_CONFLICT");
      }
      if (quote.status !== "PENDING") throw new RequestDomainError("QUOTE_NOT_PENDING");
      if (toDate(quote.expires_at).getTime() <= Date.now()) {
        await tx`
          UPDATE service_quotes
          SET status = 'EXPIRED', version = version + 1, updated_at = now(),
              last_actor_type = 'SYSTEM', last_actor_user_id = NULL
          WHERE id = ${quote.id} AND version = ${normalized.expectedVersion} AND status = 'PENDING'
        `;
        return { kind: "expired" as const };
      }

      const nextStatus = normalized.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
      const updatedRows = await tx<QuoteRow[]>`
        UPDATE service_quotes
        SET status = ${nextStatus}, version = version + 1, updated_at = now(),
            last_actor_type = 'STUDENT', last_actor_user_id = ${principal.userId},
            response_client_id = ${normalized.clientActionId},
            response_payload_fingerprint = ${normalized.fingerprint}, responded_at = now()
        WHERE id = ${quote.id} AND version = ${normalized.expectedVersion} AND status = 'PENDING'
        RETURNING ${tx.unsafe(quoteSelect)}
      `;
      const updated = updatedRows[0];
      if (updated === undefined) throw new RequestDomainError("QUOTE_VERSION_CONFLICT");
      let requestVersion = toSafeInteger(request.version, "request version");
      const requestStatus = toRequestStatus(request.status);
      if (requestStatus !== "QUOTED") throw new RequestDomainError("INVALID_TRANSITION");
      requestVersion = await this.transitionRequest(
        tx,
        request,
        requestStatus,
        normalized.decision === "ACCEPT" ? "ACCEPTED" : "UNDER_REVIEW",
        requestVersion,
        principal.userId,
        context.correlationId,
        "STUDENT",
      );
      const financeDueId =
        normalized.decision === "ACCEPT"
          ? await this.createFinanceDue(tx, updated, request.request_number)
          : undefined;
      const actionBody =
        normalized.decision === "ACCEPT" ? "SERVICE_QUOTE_ACCEPTED" : "SERVICE_QUOTE_REJECTED";
      const messageId = await this.insertActionMessage(tx, {
        conversationId: quote.conversation_id,
        requestId: quote.request_id,
        quoteId: quote.id,
        senderType: "STUDENT",
        senderUserId: principal.userId,
        body: actionBody,
        metadata: { quoteId: quote.id, requestVersion },
      });
      const admins = await tx<{ readonly id: string }[]>`
        SELECT users.id FROM users
        INNER JOIN user_roles ON user_roles.user_id = users.id
        WHERE users.status = 'ACTIVE' AND user_roles.role_code = 'ADMIN'
      `;
      for (const admin of admins) {
        await this.notify(tx, {
          recipientUserId: admin.id,
          kind: normalized.decision === "ACCEPT" ? "QUOTE_ACCEPTED" : "QUOTE_REJECTED",
          conversationId: quote.conversation_id,
          requestId: quote.request_id,
          messageId,
          quoteId: quote.id,
          titleAr: normalized.decision === "ACCEPT" ? "تم قبول عرض السعر" : "تم رفض عرض السعر",
          titleEn: normalized.decision === "ACCEPT" ? "Quote accepted" : "Quote rejected",
          bodyAr: `رد الطالب على عرض الطلب ${request.request_number}.`,
          bodyEn: `The student responded to quote for ${request.request_number}.`,
          idempotencyKey: `quote:${quote.id}:${nextStatus}:recipient:${admin.id}`,
        });
      }
      await this.appendQuoteEvent(tx, {
        eventType: actionBody,
        requestId: quote.request_id,
        actorType: "STUDENT",
        actorUserId: principal.userId,
        requestVersion,
        quoteId: quote.id,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.enqueue(tx, actionBody, quote.id, quote.request_id, quote.student_user_id);
      await recordAuditEvent(tx, {
        ...context,
        eventType:
          normalized.decision === "ACCEPT" ? "service_quote.accepted" : "service_quote.rejected",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        resourceType: "service_quote",
        resourceId: quote.id,
        metadata: {
          requestId: quote.request_id,
          quoteVersion: updated.version,
          ...(financeDueId === undefined ? {} : { financeDueId }),
        },
      });
      return {
        kind: "success" as const,
        value: {
          quote: toQuote(updated),
          message: await this.conversations.readMessage(tx, messageId),
          idempotentReplay: false,
        },
      };
    });
    if (transactionResult.kind === "expired") throw new RequestDomainError("QUOTE_EXPIRED");
    this.logger?.info("service_quote_responded", {
      quoteId: transactionResult.value.quote.id,
      status: transactionResult.value.quote.status,
      idempotentReplay: transactionResult.value.idempotentReplay,
    });
    return transactionResult.value;
  }

  public async withdrawQuote(
    principal: AuthenticatedPrincipal,
    quoteId: string,
    input: WithdrawServiceQuoteInput,
    context: RequestAuditContext = {},
  ): Promise<WithdrawServiceQuoteResult> {
    requirePermission(requireRole(principal, "ADMIN"), "admin.quotes.manage");
    if (!isUuid(quoteId)) throw new RequestDomainError("QUOTE_NOT_FOUND");
    const normalized = normalizeQuoteWithdrawalInput(input);
    const transactionResult = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      // The message metadata is the durable idempotency record because the
      // immutable quote schema deliberately keeps response keys student-only.
      // Serialize each administrator/action key so concurrent withdrawals
      // cannot create two records or reuse one key for different quotes.
      await tx`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${principal.userId}:withdraw:${normalized.clientActionId}`}, 0)
        )
      `;
      // Resolve the immutable request reference first, then preserve the
      // request -> quote lock order shared by quote creation and response.
      // Restricting the reference to the creator makes withdrawal an owned
      // administrator action even if another administrator can read the quote.
      const quoteReferences = await tx<
        { readonly request_id: string; readonly created_by_user_id: string }[]
      >`
        SELECT request_id, created_by_user_id FROM service_quotes
        WHERE id = ${quoteId} AND created_by_user_id = ${principal.userId}
      `;
      const quoteReference = quoteReferences[0];
      if (quoteReference === undefined) throw new RequestDomainError("QUOTE_NOT_FOUND");

      const requestRows = await tx<RequestForQuoteRow[]>`
        SELECT requests.id, requests.request_number, requests.student_user_id,
               requests.status, requests.version, conversations.id AS conversation_id
        FROM service_requests AS requests
        INNER JOIN support_conversations AS conversations
          ON conversations.student_user_id = requests.student_user_id
        WHERE requests.id = ${quoteReference.request_id}
        FOR UPDATE OF requests
      `;
      const request = requestRows[0];
      if (request === undefined) throw new RequestDomainError("REQUEST_NOT_FOUND");

      const quoteRows = await tx.unsafe<QuoteRow[]>(
        `SELECT ${quoteSelect} FROM service_quotes
         WHERE id = $1 AND request_id = $2 AND created_by_user_id = $3 FOR UPDATE`,
        [quoteId, request.id, principal.userId],
      );
      const quote = quoteRows[0];
      if (quote === undefined) throw new RequestDomainError("QUOTE_NOT_FOUND");

      const replayRows = await tx<
        {
          readonly id: string;
          readonly quote_id: string;
          readonly action_fingerprint: string | null;
        }[]
      >`
        SELECT id, quote_id, metadata->>'actionFingerprint' AS action_fingerprint
        FROM support_messages
        WHERE body = 'SERVICE_QUOTE_WITHDRAWN'
          AND metadata->>'clientActionId' = ${normalized.clientActionId}
          AND metadata->>'actorUserId' = ${principal.userId}
        ORDER BY sent_at DESC, id DESC
        LIMIT 1
      `;
      const replay = replayRows[0];
      if (replay !== undefined) {
        if (replay.quote_id !== quote.id || replay.action_fingerprint !== normalized.fingerprint) {
          throw new RequestDomainError("IDEMPOTENCY_KEY_REUSED");
        }
        return {
          kind: "success" as const,
          value: {
            quote: toQuote(quote),
            message: await this.conversations.readMessage(tx, replay.id),
            idempotentReplay: true,
          },
        };
      }

      if (toSafeInteger(quote.version, "version") !== normalized.expectedVersion) {
        throw new RequestDomainError("QUOTE_VERSION_CONFLICT");
      }
      if (toSafeInteger(request.version, "request version") !== normalized.expectedRequestVersion) {
        throw new RequestDomainError("VERSION_CONFLICT");
      }
      if (quote.status !== "PENDING") throw new RequestDomainError("QUOTE_NOT_PENDING");
      if (toDate(quote.expires_at).getTime() <= Date.now()) {
        await tx`
          UPDATE service_quotes
          SET status = 'EXPIRED', version = version + 1, updated_at = now(),
              last_actor_type = 'SYSTEM', last_actor_user_id = NULL
          WHERE id = ${quote.id} AND version = ${normalized.expectedVersion} AND status = 'PENDING'
        `;
        return { kind: "expired" as const };
      }
      const requestStatus = toRequestStatus(request.status);
      if (requestStatus !== "QUOTED") throw new RequestDomainError("INVALID_TRANSITION");

      const updatedRows = await tx<QuoteRow[]>`
        UPDATE service_quotes
        SET status = 'WITHDRAWN', version = version + 1, updated_at = now(),
            last_actor_type = 'ADMIN', last_actor_user_id = ${principal.userId}
        WHERE id = ${quote.id} AND version = ${normalized.expectedVersion} AND status = 'PENDING'
        RETURNING ${tx.unsafe(quoteSelect)}
      `;
      const updated = updatedRows[0];
      if (updated === undefined) throw new RequestDomainError("QUOTE_VERSION_CONFLICT");
      const requestVersion = await this.transitionRequest(
        tx,
        request,
        requestStatus,
        "UNDER_REVIEW",
        normalized.expectedRequestVersion,
        principal.userId,
        context.correlationId,
      );
      const messageId = await this.insertActionMessage(tx, {
        conversationId: quote.conversation_id,
        requestId: quote.request_id,
        quoteId: quote.id,
        senderType: "ADMIN",
        senderUserId: principal.userId,
        body: "SERVICE_QUOTE_WITHDRAWN",
        metadata: {
          quoteId: quote.id,
          requestVersion,
          clientActionId: normalized.clientActionId,
          actionFingerprint: normalized.fingerprint,
          actorUserId: principal.userId,
        },
      });
      await this.notify(tx, {
        recipientUserId: quote.student_user_id,
        kind: "REQUEST_UPDATED",
        conversationId: quote.conversation_id,
        requestId: quote.request_id,
        messageId,
        quoteId: quote.id,
        titleAr: "تم سحب عرض السعر",
        titleEn: "Quote withdrawn",
        bodyAr: `سحبت الإدارة عرض السعر للطلب ${request.request_number}.`,
        bodyEn: `The team withdrew the quote for request ${request.request_number}.`,
        idempotencyKey: `quote:${quote.id}:WITHDRAWN:recipient:${quote.student_user_id}`,
      });
      await this.appendQuoteEvent(tx, {
        eventType: "SERVICE_QUOTE_WITHDRAWN",
        requestId: quote.request_id,
        actorType: "ADMIN",
        actorUserId: principal.userId,
        requestVersion,
        quoteId: quote.id,
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      });
      await this.enqueue(
        tx,
        "SERVICE_QUOTE_WITHDRAWN",
        quote.id,
        quote.request_id,
        quote.student_user_id,
      );
      await recordAuditEvent(tx, {
        ...context,
        eventType: "service_quote.withdrawn",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: quote.student_user_id,
        sessionId: principal.sessionId,
        resourceType: "service_quote",
        resourceId: quote.id,
        metadata: { requestId: quote.request_id, quoteVersion: updated.version, requestVersion },
      });
      return {
        kind: "success" as const,
        value: {
          quote: toQuote(updated),
          message: await this.conversations.readMessage(tx, messageId),
          idempotentReplay: false,
        },
      };
    });
    if (transactionResult.kind === "expired") throw new RequestDomainError("QUOTE_EXPIRED");
    this.logger?.info("service_quote_withdrawn", {
      quoteId: transactionResult.value.quote.id,
      requestId: transactionResult.value.quote.requestId,
      idempotentReplay: transactionResult.value.idempotentReplay,
    });
    return transactionResult.value;
  }

  private async transitionRequest(
    database: DatabaseClient,
    request: RequestForQuoteRow,
    fromStatus: RequestStatus,
    toStatus: RequestStatus,
    expectedVersion: number,
    actorUserId: string,
    correlationId?: string,
    actorType: "ADMIN" | "STUDENT" = "ADMIN",
  ): Promise<number> {
    if (!canTransitionRequest(fromStatus, toStatus, actorType)) {
      throw new RequestDomainError("INVALID_TRANSITION");
    }
    const rows = await database<{ readonly version: number | string }[]>`
      UPDATE service_requests
      SET status = ${toStatus}, version = version + 1, updated_at = now()
      WHERE id = ${request.id} AND version = ${expectedVersion} AND status = ${fromStatus}
      RETURNING version
    `;
    if (rows[0] === undefined) throw new RequestDomainError("VERSION_CONFLICT");
    const version = toSafeInteger(rows[0].version, "request version");
    await database`
      INSERT INTO service_request_events (
        request_id, event_type, actor_type, actor_user_id, from_status, to_status,
        request_version, metadata, correlation_id
      ) VALUES (
        ${request.id}, 'REQUEST_STATUS_CHANGED', ${actorType}, ${actorUserId},
        ${fromStatus}, ${toStatus}, ${version}, '{}'::jsonb, ${correlationId ?? null}
      )
    `;
    return version;
  }

  private async insertActionMessage(
    database: DatabaseClient,
    input: {
      readonly conversationId: string;
      readonly requestId: string;
      readonly quoteId: string;
      readonly senderType: "ADMIN" | "STUDENT";
      readonly senderUserId: string;
      readonly body: string;
      readonly metadata: Readonly<Record<string, string | number>>;
    },
  ): Promise<string> {
    const rows = await database<{ readonly id: string }[]>`
      INSERT INTO support_messages (
        conversation_id, sender_type, sender_user_id, content_type, body,
        metadata, request_id, quote_id
      ) VALUES (
        ${input.conversationId}, ${input.senderType}, ${input.senderUserId}, 'ACTION',
        ${input.body}, ${database.json(input.metadata)}, ${input.requestId}, ${input.quoteId}
      ) RETURNING id
    `;
    if (rows[0] === undefined) throw new Error("Quote action message was not inserted.");
    return rows[0].id;
  }

  private async createFinanceDue(
    database: DatabaseClient,
    quote: QuoteRow,
    requestNumber: string,
  ): Promise<string> {
    const existing = await database<{ readonly due_id: string }[]>`
      SELECT due_id FROM service_quote_finance_dues WHERE quote_id = ${quote.id} LIMIT 1
    `;
    if (existing[0] !== undefined) return existing[0].due_id;
    const rows = await database<{ readonly id: string }[]>`
      INSERT INTO finance_dues (
        request_id, student_user_id, title_ar, title_en, description_ar, description_en,
        amount_minor, currency, minor_unit, created_by_user_id, updated_by_user_id
      ) VALUES (
        ${quote.request_id}, ${quote.student_user_id},
        ${`عرض سعر الطلب ${requestNumber}`}, ${`Quote for request ${requestNumber}`},
        ${quote.description_ar}, ${quote.description_en}, ${quote.amount_minor},
        ${quote.currency}, ${quote.minor_unit}, ${quote.created_by_user_id},
        ${quote.created_by_user_id}
      ) RETURNING id
    `;
    const dueId = rows[0]?.id;
    if (dueId === undefined) throw new Error("Accepted quote finance due was not created.");
    await database`
      INSERT INTO finance_ledger_entries (
        due_id, due_version, entry_type, amount_minor, currency, minor_unit, actor_user_id
      ) VALUES (
        ${dueId}, 1, 'DUE_CREATED', ${quote.amount_minor}, ${quote.currency},
        ${quote.minor_unit}, ${quote.created_by_user_id}
      )
    `;
    await database`
      INSERT INTO service_quote_finance_dues (quote_id, due_id)
      VALUES (${quote.id}, ${dueId})
    `;
    await database`
      INSERT INTO outbox_events (
        event_type, aggregate_type, aggregate_id, idempotency_key, payload
      ) VALUES (
        'FINANCE_DUE_CREATED', 'FINANCE_DUE', ${dueId},
        ${`service-quote:${quote.id}:finance-due`},
        ${database.json({
          schemaVersion: 1,
          dueId,
          quoteId: quote.id,
          requestId: quote.request_id,
          studentUserId: quote.student_user_id,
        })}
      ) ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return dueId;
  }

  private async notify(
    database: DatabaseClient,
    input: {
      readonly recipientUserId: string;
      readonly kind: "REQUEST_UPDATED" | "QUOTE_RECEIVED" | "QUOTE_ACCEPTED" | "QUOTE_REJECTED";
      readonly conversationId: string;
      readonly requestId: string;
      readonly messageId: string;
      readonly quoteId: string;
      readonly titleAr: string;
      readonly titleEn: string;
      readonly bodyAr: string;
      readonly bodyEn: string;
      readonly idempotencyKey: string;
    },
  ): Promise<void> {
    await database`
      INSERT INTO support_message_receipts (message_id, recipient_user_id, status)
      VALUES (${input.messageId}, ${input.recipientUserId}, 'SENT')
      ON CONFLICT (message_id, recipient_user_id) DO NOTHING
    `;
    await database`
      INSERT INTO user_notifications (
        recipient_user_id, kind, conversation_id, request_id, message_id, quote_id,
        title_ar, title_en, body_ar, body_en, action_href, idempotency_key
      ) VALUES (
        ${input.recipientUserId}, ${input.kind}, ${input.conversationId}, ${input.requestId},
        ${input.messageId}, ${input.quoteId}, ${input.titleAr}, ${input.titleEn},
        ${input.bodyAr}, ${input.bodyEn},
        ${`/conversation?conversation=${input.conversationId}&request=${input.requestId}`},
        ${input.idempotencyKey}
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
  }

  private async appendQuoteEvent(
    database: DatabaseClient,
    input: {
      readonly eventType: string;
      readonly requestId: string;
      readonly actorType: "ADMIN" | "STUDENT";
      readonly actorUserId: string;
      readonly requestVersion: number;
      readonly quoteId: string;
      readonly correlationId?: string;
    },
  ): Promise<void> {
    await database`
      INSERT INTO service_request_events (
        request_id, event_type, actor_type, actor_user_id, request_version,
        metadata, correlation_id
      ) VALUES (
        ${input.requestId}, ${input.eventType}, ${input.actorType}, ${input.actorUserId},
        ${input.requestVersion}, ${database.json({ quoteId: input.quoteId })},
        ${input.correlationId ?? null}
      )
    `;
  }

  private async enqueue(
    database: DatabaseClient,
    eventType: string,
    quoteId: string,
    requestId: string,
    studentUserId: string,
  ): Promise<void> {
    await database`
      INSERT INTO outbox_events (
        event_type, aggregate_type, aggregate_id, idempotency_key, payload
      ) VALUES (
        ${eventType}, 'SERVICE_QUOTE', ${quoteId}, ${`service-quote:${quoteId}:${eventType}`},
        ${database.json({ schemaVersion: 1, quoteId, requestId, studentUserId })}
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
  }

  private async quoteActionMessageId(
    database: DatabaseClient,
    quoteId: string,
    body: string,
  ): Promise<string> {
    const rows = await database<{ readonly id: string }[]>`
      SELECT id FROM support_messages
      WHERE quote_id = ${quoteId} AND body = ${body}
      ORDER BY sent_at DESC, id DESC LIMIT 1
    `;
    if (rows[0] === undefined) throw new Error("Quote action message was not found.");
    return rows[0].id;
  }
}
