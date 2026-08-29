import type { FinanceCurrency, FinanceDueStatus, FinancePaymentMethod } from "@itqanak/finance";

export function formatFinanceAmount(
  amountMinor: number,
  currency: FinanceCurrency,
  minorUnit: 2 | 3,
  locale: "ar" | "en",
): string {
  const language = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency,
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  }).format(amountMinor / 10 ** minorUnit);
}

export function financeStatusLabel(status: FinanceDueStatus, locale: "ar" | "en"): string {
  const labels = {
    ar: { UNPAID: "غير مدفوع", PAID: "مدفوع", VOIDED: "ملغى" },
    en: { UNPAID: "Unpaid", PAID: "Paid", VOIDED: "Voided" },
  } as const;
  return labels[locale][status];
}

export function financePaymentMethodLabel(
  method: FinancePaymentMethod,
  locale: "ar" | "en",
): string {
  const labels = {
    ar: { BANK_TRANSFER: "تحويل بنكي", CASH: "نقدي", OTHER: "وسيلة أخرى" },
    en: { BANK_TRANSFER: "Bank transfer", CASH: "Cash", OTHER: "Other" },
  } as const;
  return labels[locale][method];
}

export function financeStatusClassName(status: FinanceDueStatus): string {
  if (status === "PAID")
    return "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-800)] ring-[var(--itq-color-success-200)]";
  if (status === "UNPAID")
    return "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-900)] ring-[var(--itq-color-warning-200)]";
  return "bg-[var(--itq-color-surface-soft)] text-[var(--itq-color-ink-soft)] ring-[var(--itq-color-border)]";
}
