import { createHash } from "node:crypto";

import { normalizeSubmissionKey, type SubmissionKey } from "./request-identifiers.js";

export const requestKinds = ["SERVICE", "CONVERSATION"] as const;
export type RequestKind = (typeof requestKinds)[number];

export const creatableRequestKinds = ["SERVICE"] as const;
export type CreatableRequestKind = (typeof creatableRequestKinds)[number];

export const requestUrgencies = ["NORMAL", "URGENT"] as const;
export type RequestUrgency = (typeof requestUrgencies)[number];

export const requestLanguageCodes = ["ar", "en", "fr", "de", "es", "tr"] as const;
export type RequestLanguageCode = (typeof requestLanguageCodes)[number];

export const requestAcademicLevels = [
  "SECONDARY",
  "DIPLOMA",
  "BACHELOR",
  "MASTER",
  "DOCTORATE",
  "PROFESSIONAL",
  "OTHER",
] as const;
export type RequestAcademicLevel = (typeof requestAcademicLevels)[number];

export const requestBudgetCurrencies = ["SAR", "AED", "USD", "EUR", "GBP"] as const;
export type RequestBudgetCurrency = (typeof requestBudgetCurrencies)[number];

export const editableDraftRequestFields = [
  "serviceId",
  "title",
  "description",
  "deadlineAt",
  "urgency",
  "budgetAmount",
  "budgetCurrency",
  "languageCode",
  "academicLevel",
  "institutionName",
  "privacyRequested",
  "academicIntegrityAccepted",
  "academicIntegrityVersion",
] as const;

/** Phase 3 fails closed after submission; cancellation has its own transition. */
export const editableSubmittedRequestFields = [] as const;

export type DraftRequestField = (typeof editableDraftRequestFields)[number];

export type RequestValidationIssueCode =
  | "REQUIRED"
  | "INVALID_FORMAT"
  | "NOT_ALLOWED"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "OUT_OF_RANGE"
  | "POLICY_REQUIRED"
  | "POLICY_VERSION_MISMATCH";

export interface RequestValidationIssue {
  readonly field: string;
  readonly code: RequestValidationIssueCode;
}

export class RequestValidationError extends Error {
  public constructor(public readonly issues: readonly RequestValidationIssue[]) {
    super("Service request validation failed.");
    this.name = "RequestValidationError";
  }
}

export interface RequestValidationOptions {
  readonly now?: Date;
  readonly maxDeadlineDays?: number;
}

export interface RequestSubmissionValidationOptions extends RequestValidationOptions {
  readonly expectedAcademicIntegrityVersion: string;
}

export interface ValidatedBudget {
  readonly amount: string | null;
  readonly currency: RequestBudgetCurrency | null;
}

export interface ValidatedDraftRequestInput {
  readonly serviceId: string;
  readonly submissionKey: SubmissionKey;
  readonly requestKind: CreatableRequestKind;
  readonly title: string;
  readonly description: string;
  readonly deadlineAt: Date | null;
  readonly urgency: RequestUrgency;
  readonly budgetAmount: string | null;
  readonly budgetCurrency: RequestBudgetCurrency | null;
  readonly languageCode: RequestLanguageCode | null;
  readonly academicLevel: RequestAcademicLevel | null;
  readonly institutionName: string | null;
  readonly privacyRequested: boolean;
  readonly academicIntegrityAccepted: boolean;
  readonly academicIntegrityVersion: string | null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const decimalPattern = /^(?<integer>[0-9]{1,9})(?:\.(?<fraction>[0-9]{1,2}))?$/u;
const maxBudgetCents = 100_000_000n;
const millisecondsPerDay = 86_400_000;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(field: string, code: RequestValidationIssueCode): RequestValidationError {
  return new RequestValidationError([{ field, code }]);
}

function normalizeUuid(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw issue(field, "REQUIRED");
  }
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) {
    throw issue(field, "INVALID_FORMAT");
  }
  return normalized;
}

function normalizeDraftText(
  value: unknown,
  field: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw issue(field, "INVALID_FORMAT");
  }
  const normalized = value.trim();
  if (normalized.length > 0 && normalized.length < minimumLength) {
    throw issue(field, "TOO_SHORT");
  }
  if (normalized.length > maximumLength) {
    throw issue(field, "TOO_LONG");
  }
  return normalized;
}

function normalizeNullableText(
  value: unknown,
  field: string,
  minimumLength: number,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw issue(field, "INVALID_FORMAT");
  }
  const normalized = value.trim();
  if (normalized.length < minimumLength) {
    throw issue(field, "TOO_SHORT");
  }
  if (normalized.length > maximumLength) {
    throw issue(field, "TOO_LONG");
  }
  return normalized;
}

function normalizeBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  throw issue(field, "INVALID_FORMAT");
}

function normalizeAllowlistedValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  options: {
    readonly optional: boolean;
    readonly uppercase?: boolean;
    readonly lowercase?: boolean;
  },
): T | null {
  if (value === undefined || value === null || value === "") {
    if (options.optional) {
      return null;
    }
    throw issue(field, "REQUIRED");
  }
  if (typeof value !== "string") {
    throw issue(field, "INVALID_FORMAT");
  }
  const trimmed = value.trim();
  const normalized = options.uppercase
    ? trimmed.toUpperCase()
    : options.lowercase
      ? trimmed.toLowerCase()
      : trimmed;
  if (!(allowed as readonly string[]).includes(normalized)) {
    throw issue(field, "NOT_ALLOWED");
  }
  return normalized as T;
}

function resolveNow(value: Date | undefined): Date {
  const now = value === undefined ? new Date() : new Date(value.getTime());
  if (Number.isNaN(now.getTime())) {
    throw new TypeError("Validation clock must be a valid date.");
  }
  return now;
}

export function assertDeadline(
  value: unknown,
  options: RequestValidationOptions = {},
): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string" && !/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(value.trim())) {
    throw issue("deadlineAt", "INVALID_FORMAT");
  }
  const deadline = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(deadline.getTime())) {
    throw issue("deadlineAt", "INVALID_FORMAT");
  }

  const now = resolveNow(options.now);
  const maxDeadlineDays = options.maxDeadlineDays ?? 730;
  if (!Number.isInteger(maxDeadlineDays) || maxDeadlineDays < 1 || maxDeadlineDays > 3650) {
    throw new TypeError("Maximum deadline days must be an integer between 1 and 3650.");
  }
  if (deadline.getTime() <= now.getTime()) {
    throw issue("deadlineAt", "OUT_OF_RANGE");
  }
  if (deadline.getTime() > now.getTime() + maxDeadlineDays * millisecondsPerDay) {
    throw issue("deadlineAt", "OUT_OF_RANGE");
  }
  return deadline;
}

function budgetInputToText(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw issue("budgetAmount", "OUT_OF_RANGE");
    }
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 1e-7) {
      throw issue("budgetAmount", "INVALID_FORMAT");
    }
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
  }
  return value.trim();
}

export function assertBudget(amount: unknown, currency: unknown): ValidatedBudget {
  const amountAbsent = amount === undefined || amount === null || amount === "";
  const currencyAbsent = currency === undefined || currency === null || currency === "";
  if (amountAbsent && currencyAbsent) {
    return { amount: null, currency: null };
  }
  if (
    amountAbsent ||
    currencyAbsent ||
    (typeof amount !== "string" && typeof amount !== "number")
  ) {
    throw issue(amountAbsent ? "budgetAmount" : "budgetCurrency", "REQUIRED");
  }

  const match = decimalPattern.exec(budgetInputToText(amount));
  if (match === null) {
    throw issue("budgetAmount", "INVALID_FORMAT");
  }
  const integer = match.groups?.integer;
  const fraction = match.groups?.fraction ?? "";
  if (integer === undefined) {
    throw issue("budgetAmount", "INVALID_FORMAT");
  }
  const cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > maxBudgetCents) {
    throw issue("budgetAmount", "OUT_OF_RANGE");
  }

  const normalizedCurrency = normalizeAllowlistedValue(
    currency,
    "budgetCurrency",
    requestBudgetCurrencies,
    { optional: false, uppercase: true },
  );
  if (normalizedCurrency === null) {
    throw issue("budgetCurrency", "REQUIRED");
  }
  return {
    amount: `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`,
    currency: normalizedCurrency,
  };
}

export function validateDraftRequestInput(
  value: unknown,
  options: RequestValidationOptions = {},
): ValidatedDraftRequestInput {
  if (!isRecord(value)) {
    throw issue("request", "INVALID_FORMAT");
  }

  const serviceId = normalizeUuid(value.serviceId, "serviceId");
  if (typeof value.submissionKey !== "string") {
    throw issue("submissionKey", "REQUIRED");
  }
  let submissionKey: SubmissionKey;
  try {
    submissionKey = normalizeSubmissionKey(value.submissionKey);
  } catch {
    throw issue("submissionKey", "INVALID_FORMAT");
  }

  const requestKind = normalizeAllowlistedValue(
    value.requestKind ?? "SERVICE",
    "requestKind",
    creatableRequestKinds,
    { optional: false, uppercase: true },
  );
  const urgency = normalizeAllowlistedValue(
    value.urgency ?? "NORMAL",
    "urgency",
    requestUrgencies,
    { optional: false, uppercase: true },
  );
  if (requestKind === null || urgency === null) {
    throw issue("request", "INVALID_FORMAT");
  }

  const budget = assertBudget(value.budgetAmount, value.budgetCurrency);
  const academicIntegrityAccepted = normalizeBoolean(
    value.academicIntegrityAccepted,
    "academicIntegrityAccepted",
    false,
  );
  const academicIntegrityVersion = normalizeNullableText(
    value.academicIntegrityVersion,
    "academicIntegrityVersion",
    1,
    64,
  );
  if (academicIntegrityAccepted !== (academicIntegrityVersion !== null)) {
    throw issue(
      academicIntegrityAccepted ? "academicIntegrityVersion" : "academicIntegrityAccepted",
      academicIntegrityAccepted ? "REQUIRED" : "INVALID_FORMAT",
    );
  }

  return {
    serviceId,
    submissionKey,
    requestKind,
    title: normalizeDraftText(value.title, "title", 3, 160),
    description: normalizeDraftText(value.description, "description", 10, 10000),
    deadlineAt: assertDeadline(value.deadlineAt, options),
    urgency,
    budgetAmount: budget.amount,
    budgetCurrency: budget.currency,
    languageCode: normalizeAllowlistedValue(
      value.languageCode,
      "languageCode",
      requestLanguageCodes,
      { optional: true, lowercase: true },
    ),
    academicLevel: normalizeAllowlistedValue(
      value.academicLevel,
      "academicLevel",
      requestAcademicLevels,
      { optional: true, uppercase: true },
    ),
    institutionName: normalizeNullableText(value.institutionName, "institutionName", 2, 200),
    privacyRequested: normalizeBoolean(value.privacyRequested, "privacyRequested", false),
    academicIntegrityAccepted,
    academicIntegrityVersion,
  };
}

export function validateSubmittableRequest(
  value: unknown,
  options: RequestSubmissionValidationOptions,
): ValidatedDraftRequestInput {
  const validated = validateDraftRequestInput(value, options);
  const issues: RequestValidationIssue[] = [];
  if (validated.title.length < 3) {
    issues.push({ field: "title", code: "REQUIRED" });
  }
  if (validated.description.length < 10) {
    issues.push({ field: "description", code: "REQUIRED" });
  }
  if (!validated.academicIntegrityAccepted || validated.academicIntegrityVersion === null) {
    issues.push({ field: "academicIntegrityAccepted", code: "POLICY_REQUIRED" });
  } else if (validated.academicIntegrityVersion !== options.expectedAcademicIntegrityVersion) {
    issues.push({ field: "academicIntegrityVersion", code: "POLICY_VERSION_MISMATCH" });
  }
  if (issues.length > 0) {
    throw new RequestValidationError(issues);
  }
  return validated;
}

export function createRequestSubmissionFingerprint(input: ValidatedDraftRequestInput): string {
  const canonicalPayload = JSON.stringify([
    "itqanak-request-v1",
    input.serviceId,
    input.requestKind,
    input.title,
    input.description,
    input.deadlineAt?.toISOString() ?? null,
    input.urgency,
    input.budgetAmount,
    input.budgetCurrency,
    input.languageCode,
    input.academicLevel,
    input.institutionName,
    input.privacyRequested,
    input.academicIntegrityAccepted,
    input.academicIntegrityVersion,
  ]);
  return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
}
