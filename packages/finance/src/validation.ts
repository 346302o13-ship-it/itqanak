import {
  FinanceError,
  financeCurrencies,
  financeDueStatuses,
  financePaymentMethods,
  type CreateFinanceDueInput,
  type FinanceCurrency,
  type FinanceDueStatus,
  type FinancePaymentMethod,
} from "./types.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const requestNumberPattern = /^ITQ-[0-9]{4}-[0-9]{6,}$/u;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export function minorUnitForCurrency(currency: FinanceCurrency): 2 | 3 {
  return currency === "KWD" ? 3 : 2;
}

export function assertFinanceCurrency(value: string): FinanceCurrency {
  if (!(financeCurrencies as readonly string[]).includes(value)) {
    throw new FinanceError("INVALID_CURRENCY");
  }
  return value as FinanceCurrency;
}

export function assertFinanceDueStatus(value: string): FinanceDueStatus {
  if (!(financeDueStatuses as readonly string[]).includes(value)) {
    throw new FinanceError("INVALID_TRANSITION");
  }
  return value as FinanceDueStatus;
}

export function assertFinancePaymentMethod(value: string): FinancePaymentMethod {
  if (!(financePaymentMethods as readonly string[]).includes(value)) {
    throw new FinanceError("INVALID_PAYMENT_METHOD");
  }
  return value as FinancePaymentMethod;
}

export function assertFinanceDueId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new FinanceError("INVALID_ID");
  return normalized;
}

/** True for a well-formed UUID; used for optional id filters. */
export function isFinanceUuid(value: string): boolean {
  return uuidPattern.test(value.trim().toLowerCase());
}

export function assertFinanceVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new FinanceError("INVALID_VERSION");
  return value;
}

export function normalizeFinanceRequestNumber(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!requestNumberPattern.test(normalized)) throw new FinanceError("INVALID_REQUEST");
  return normalized;
}

export function amountToMinorUnits(value: string, currency: FinanceCurrency): number {
  const normalized = value.trim();
  const match = /^(0|[1-9][0-9]{0,9})(?:\.([0-9]{1,3}))?$/u.exec(normalized);
  if (match === null) throw new FinanceError("INVALID_AMOUNT");
  const whole = match[1];
  const fraction = match[2] ?? "";
  const minorUnit = minorUnitForCurrency(currency);
  if (whole === undefined || fraction.length > minorUnit) throw new FinanceError("INVALID_AMOUNT");
  const multiplier = 10 ** minorUnit;
  const amount = Number(whole) * multiplier + Number(fraction.padEnd(minorUnit, "0"));
  const maximumMinorAmount = 1_000_000 * multiplier;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximumMinorAmount) {
    throw new FinanceError("INVALID_AMOUNT");
  }
  return amount;
}

function normalizeRequiredText(value: string, maximum: number): string {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length < 2 || normalized.length > maximum) {
    throw new FinanceError("INVALID_TEXT");
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined, maximum: number): string | null {
  const normalized = value?.replace(/\r\n?/gu, "\n").trim() ?? "";
  if (normalized.length === 0) return null;
  if (normalized.length < 2 || normalized.length > maximum) {
    throw new FinanceError("INVALID_TEXT");
  }
  return normalized;
}

function normalizeOptionalDueAt(value: Date | string | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const explicitZone =
    value instanceof Date || /T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(value.trim());
  if (!explicitZone || Number.isNaN(parsed.getTime())) throw new FinanceError("INVALID_DUE_AT");
  const earliest = Date.UTC(2000, 0, 1);
  const latest = Date.now() + 10 * 366 * 24 * 60 * 60 * 1_000;
  if (parsed.getTime() < earliest || parsed.getTime() > latest) {
    throw new FinanceError("INVALID_DUE_AT");
  }
  return parsed;
}

export function normalizePaymentReference(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (normalized.length === 0) return null;
  if (normalized.length < 2 || normalized.length > 120 || hasControlCharacter(normalized)) {
    throw new FinanceError("INVALID_REFERENCE");
  }
  return normalized;
}

export function normalizePaymentNote(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\r\n?/gu, "\n").trim() ?? "";
  if (normalized.length === 0) return null;
  if (normalized.length < 2 || normalized.length > 500 || normalized.includes("\u0000")) {
    throw new FinanceError("INVALID_TEXT");
  }
  return normalized;
}

export function normalizeFinanceReason(value: string): string {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length < 2 || normalized.length > 500 || normalized.includes("\u0000")) {
    throw new FinanceError("INVALID_REASON");
  }
  return normalized;
}

export function normalizeCreateFinanceDue(input: CreateFinanceDueInput) {
  const currency = assertFinanceCurrency(input.currency);
  const descriptionAr = normalizeOptionalText(input.descriptionAr, 2000);
  const descriptionEn = normalizeOptionalText(input.descriptionEn, 2000);
  if ((descriptionAr === null) !== (descriptionEn === null)) {
    throw new FinanceError("INVALID_TEXT");
  }
  return {
    requestNumber: normalizeFinanceRequestNumber(input.requestNumber),
    titleAr: normalizeRequiredText(input.titleAr, 160),
    titleEn: normalizeRequiredText(input.titleEn, 160),
    descriptionAr,
    descriptionEn,
    amountMinor: amountToMinorUnits(input.amount, currency),
    currency,
    minorUnit: minorUnitForCurrency(currency),
    dueAt: normalizeOptionalDueAt(input.dueAt),
  } as const;
}
