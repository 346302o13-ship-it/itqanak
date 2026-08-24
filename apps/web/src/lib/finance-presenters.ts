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
  if (status === "PAID") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "UNPAID") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}
