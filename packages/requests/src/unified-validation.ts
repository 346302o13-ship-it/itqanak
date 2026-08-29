import { createHash } from "node:crypto";

import {
  serviceQuoteCurrencies,
  unifiedHumanContentTypes,
  type CreateServiceQuoteInput,
  type RespondToServiceQuoteInput,
  type SendUnifiedMessageInput,
  type ServiceQuoteCurrency,
  type UnifiedHumanContentType,
  type WithdrawServiceQuoteInput,
} from "./types.js";
import { isUuid } from "./chat-validation.js";
import { RequestDomainError } from "./errors.js";

export interface NormalizedUnifiedMessageInput {
  readonly contentType: UnifiedHumanContentType;
  readonly body?: string;
  readonly requestId?: string;
  readonly attachmentId?: string;
  readonly replyToMessageId?: string;
  readonly clientMessageId: string;
  readonly fingerprint: string;
}

export interface NormalizedServiceQuoteInput {
  readonly requestId: string;
  readonly expectedRequestVersion: number;
  readonly amountMinor: number;
  readonly currency: ServiceQuoteCurrency;
  readonly minorUnit: 2 | 3;
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly expiresAt: Date;
  readonly clientQuoteId: string;
  readonly fingerprint: string;
}

export interface NormalizedQuoteResponseInput {
  readonly expectedVersion: number;
  readonly decision: "ACCEPT" | "REJECT";
  readonly clientActionId: string;
  readonly fingerprint: string;
}

export interface NormalizedQuoteWithdrawalInput {
  readonly expectedVersion: number;
  readonly expectedRequestVersion: number;
  readonly clientActionId: string;
  readonly fingerprint: string;
}

function normalizedBody(value: string | null | undefined, required: boolean): string | undefined {
  const body = value?.replace(/\r\n?/gu, "\n").trim();
  if (body === undefined || body.length === 0) {
    if (required) throw new RequestDomainError("INVALID_MESSAGE");
    return undefined;
  }
  if (body.length > 10_000 || body.includes("\0")) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  return body;
}

/**
 * Normalize the replacement text for an in-place message edit. Same shape rules
 * as a sent text body: CRLF folded, trimmed, non-empty, bounded, NUL-free.
 */
export function normalizeUnifiedEditBody(value: string | null | undefined): string {
  const body = value?.replace(/\r\n?/gu, "\n").trim();
  if (body === undefined || body.length === 0 || body.length > 10_000 || body.includes("\0")) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  return body;
}

function fingerprint(parts: Readonly<Record<string, string | number | null>>): string {
  return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
}

function positiveVersion(value: number, code: "INVALID_QUOTE" | "QUOTE_VERSION_CONFLICT"): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RequestDomainError(code);
  return value;
}

function normalizedDescription(value: string): string {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length < 2 || normalized.length > 2_000 || normalized.includes("\0")) {
    throw new RequestDomainError("INVALID_QUOTE");
  }
  return normalized;
}

export function normalizeUnifiedMessageInput(
  input: SendUnifiedMessageInput,
  generatedClientMessageId: string,
): NormalizedUnifiedMessageInput {
  if (!(unifiedHumanContentTypes as readonly string[]).includes(input.contentType)) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  const contentType = input.contentType;
  const requestId = input.requestId?.trim() || undefined;
  const attachmentId = input.attachmentId?.trim() || undefined;
  const replyToMessageId = input.replyToMessageId?.trim() || undefined;
  const clientMessageId = input.clientMessageId?.trim() || generatedClientMessageId;
  if (!isUuid(clientMessageId)) throw new RequestDomainError("INVALID_MESSAGE");
  if (requestId !== undefined && !isUuid(requestId)) {
    throw new RequestDomainError("REQUEST_NOT_FOUND");
  }
  if (attachmentId !== undefined && !isUuid(attachmentId)) {
    throw new RequestDomainError("INVALID_MESSAGE_ATTACHMENT");
  }
  if (replyToMessageId !== undefined && !isUuid(replyToMessageId)) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  const isText = contentType === "TEXT";
  if ((isText && attachmentId !== undefined) || (!isText && attachmentId === undefined)) {
    throw new RequestDomainError(isText ? "INVALID_MESSAGE" : "MESSAGE_ATTACHMENT_REQUIRED");
  }
  const body = normalizedBody(input.body, isText);
  const resultFingerprint = fingerprint({
    contentType,
    body: body ?? null,
    requestId: requestId ?? null,
    attachmentId: attachmentId ?? null,
    replyToMessageId: replyToMessageId ?? null,
  });
  return {
    contentType,
    ...(body === undefined ? {} : { body }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(attachmentId === undefined ? {} : { attachmentId }),
    ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
    clientMessageId,
    fingerprint: resultFingerprint,
  };
}

export function normalizeServiceQuoteInput(
  input: CreateServiceQuoteInput,
  now: Date = new Date(),
): NormalizedServiceQuoteInput {
  const requestId = input.requestId.trim();
  const clientQuoteId = input.clientQuoteId.trim();
  if (!isUuid(requestId) || !isUuid(clientQuoteId)) {
    throw new RequestDomainError("INVALID_QUOTE");
  }
  const expectedRequestVersion = positiveVersion(input.expectedRequestVersion, "INVALID_QUOTE");
  if (!(serviceQuoteCurrencies as readonly string[]).includes(input.currency)) {
    throw new RequestDomainError("INVALID_QUOTE");
  }
  const currency = input.currency;
  const maximum = currency === "KWD" ? 1_000_000_000 : 100_000_000;
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 1 ||
    input.amountMinor > maximum
  ) {
    throw new RequestDomainError("INVALID_QUOTE");
  }
  const descriptionAr = normalizedDescription(input.descriptionAr);
  const descriptionEn = normalizedDescription(input.descriptionEn);
  const expiresAt = input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
  const minimumExpiry = now.getTime() + 60_000;
  const maximumExpiry = now.getTime() + 180 * 86_400_000;
  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() < minimumExpiry ||
    expiresAt.getTime() > maximumExpiry
  ) {
    throw new RequestDomainError("INVALID_QUOTE");
  }
  const minorUnit = currency === "KWD" ? 3 : 2;
  const resultFingerprint = fingerprint({
    requestId,
    expectedRequestVersion,
    amountMinor: input.amountMinor,
    currency,
    descriptionAr,
    descriptionEn,
    expiresAt: expiresAt.toISOString(),
  });
  return {
    requestId,
    expectedRequestVersion,
    amountMinor: input.amountMinor,
    currency,
    minorUnit,
    descriptionAr,
    descriptionEn,
    expiresAt,
    clientQuoteId,
    fingerprint: resultFingerprint,
  };
}

export function normalizeQuoteResponseInput(
  input: RespondToServiceQuoteInput,
): NormalizedQuoteResponseInput {
  const clientActionId = input.clientActionId.trim();
  if (!isUuid(clientActionId) || (input.decision !== "ACCEPT" && input.decision !== "REJECT")) {
    throw new RequestDomainError("INVALID_QUOTE");
  }
  const expectedVersion = positiveVersion(input.expectedVersion, "QUOTE_VERSION_CONFLICT");
  return {
    expectedVersion,
    decision: input.decision,
    clientActionId,
    fingerprint: fingerprint({ decision: input.decision, expectedVersion }),
  };
}

export function normalizeQuoteWithdrawalInput(
  input: WithdrawServiceQuoteInput,
): NormalizedQuoteWithdrawalInput {
  const clientActionId = input.clientActionId.trim();
  if (!isUuid(clientActionId)) throw new RequestDomainError("INVALID_QUOTE");
  const expectedVersion = positiveVersion(input.expectedVersion, "QUOTE_VERSION_CONFLICT");
  const expectedRequestVersion = positiveVersion(
    input.expectedRequestVersion,
    "QUOTE_VERSION_CONFLICT",
  );
  return {
    expectedVersion,
    expectedRequestVersion,
    clientActionId,
    fingerprint: fingerprint({ expectedVersion, expectedRequestVersion }),
  };
}
