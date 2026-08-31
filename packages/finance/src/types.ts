export const financeCurrencies = ["SAR", "AED", "KWD"] as const;
export type FinanceCurrency = (typeof financeCurrencies)[number];

export const financeDueStatuses = ["UNPAID", "PAID", "VOIDED"] as const;
export type FinanceDueStatus = (typeof financeDueStatuses)[number];

export const financePaymentMethods = ["BANK_TRANSFER", "CASH", "OTHER"] as const;
export type FinancePaymentMethod = (typeof financePaymentMethods)[number];

export interface FinanceDue {
  readonly id: string;
  readonly reference: string;
  readonly requestId: string;
  readonly requestNumber: string;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly amountMinor: number;
  readonly currency: FinanceCurrency;
  readonly minorUnit: 2 | 3;
  readonly status: FinanceDueStatus;
  readonly dueAt?: Date;
  readonly paidAt?: Date;
  readonly voidedAt?: Date;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AdminFinanceDue extends FinanceDue {
  readonly studentUserId: string;
  readonly studentDisplayName: string;
  readonly latestPaymentMethod?: FinancePaymentMethod;
  readonly latestPaymentReference?: string;
}

export interface FinanceCurrencyReport {
  readonly currency: FinanceCurrency;
  readonly minorUnit: 2 | 3;
  readonly unpaidCount: number;
  readonly unpaidAmountMinor: number;
  readonly paidCount: number;
  readonly paidAmountMinor: number;
  readonly voidedCount: number;
}

export interface FinanceReport {
  readonly totals: readonly FinanceCurrencyReport[];
}

export interface FinanceListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly status?: FinanceDueStatus;
  readonly currency?: FinanceCurrency;
  /** Restrict the list to one student's dues (the per-student finance view). */
  readonly studentUserId?: string;
}

/** Per-currency money owed / paid for one student, for the finance overview table. */
export interface StudentBalanceLine {
  readonly currency: FinanceCurrency;
  readonly minorUnit: 2 | 3;
  readonly unpaidCount: number;
  readonly unpaidAmountMinor: number;
  readonly paidCount: number;
  readonly paidAmountMinor: number;
}

export interface StudentFinanceBalance {
  readonly studentUserId: string;
  readonly studentDisplayName: string;
  readonly lines: readonly StudentBalanceLine[];
  readonly totalUnpaidCount: number;
  readonly lastActivityAt: Date;
}

export interface FinanceListResult<TDue extends FinanceDue = FinanceDue> {
  readonly items: readonly TDue[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface CreateFinanceDueInput {
  readonly requestNumber: string;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly descriptionAr?: string | null;
  readonly descriptionEn?: string | null;
  readonly amount: string;
  readonly currency: FinanceCurrency;
  readonly dueAt?: Date | string | null;
}

export interface RecordFinancePaymentInput {
  readonly expectedVersion: number;
  readonly method: FinancePaymentMethod;
  readonly reference?: string | null;
  readonly note?: string | null;
}

export interface ReverseFinancePaymentInput {
  readonly expectedVersion: number;
  readonly reason: string;
}

export interface VoidFinanceDueInput {
  readonly expectedVersion: number;
  readonly reason: string;
}

export const paymentReceiptReviewStatuses = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type PaymentReceiptReviewStatus = (typeof paymentReceiptReviewStatuses)[number];

export interface PaymentReceiptSubmission {
  readonly id: string;
  readonly dueId: string;
  readonly dueReference: string;
  readonly requestNumber: string;
  readonly studentUserId: string;
  readonly studentDisplayName: string;
  readonly attachmentId: string;
  readonly note?: string;
  readonly reviewStatus: PaymentReceiptReviewStatus;
  readonly submittedAt: Date;
  readonly reviewedAt?: Date;
  readonly reviewNote?: string;
  readonly amountMinor: number;
  readonly currency: FinanceCurrency;
  readonly minorUnit: 2 | 3;
}

export interface SubmitPaymentReceiptInput {
  readonly attachmentId: string;
  readonly note?: string | null;
  /** Receipt covers the whole outstanding invoice; accepting it settles every due. */
  readonly invoice?: boolean;
}

export interface ReviewPaymentReceiptInput {
  readonly decision: "ACCEPT" | "REJECT";
  readonly reviewNote?: string | null;
}

export const financeErrorCodes = [
  "INVALID_ID",
  "INVALID_REQUEST",
  "INVALID_AMOUNT",
  "INVALID_CURRENCY",
  "INVALID_TEXT",
  "INVALID_DUE_AT",
  "INVALID_PAYMENT_METHOD",
  "INVALID_REFERENCE",
  "INVALID_REASON",
  "INVALID_VERSION",
  "DUE_NOT_FOUND",
  "REQUEST_NOT_FOUND",
  "REQUEST_NOT_ELIGIBLE",
  "VERSION_CONFLICT",
  "INVALID_TRANSITION",
  "RECEIPT_NOT_FOUND",
  "RECEIPT_ALREADY_REVIEWED",
  "RECEIPT_INVALID_ATTACHMENT",
  "DUE_NOT_PAYABLE",
] as const;

export type FinanceErrorCode = (typeof financeErrorCodes)[number];

export class FinanceError extends Error {
  public constructor(public readonly code: FinanceErrorCode) {
    super(code);
    this.name = "FinanceError";
  }
}
