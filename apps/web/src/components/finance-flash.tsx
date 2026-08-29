const notices = {
  ar: {
    created: "تم إنشاء المستحق وتسجيله في السجل المالي.",
    "record-payment": "تم تأكيد الدفع وتحديث الحالة إلى مدفوع.",
    "reverse-payment": "تم عكس تأكيد الدفع وإعادة الحالة إلى غير مدفوع.",
    "void-due": "تم إلغاء المستحق مع الاحتفاظ بسجله.",
    conflict: "تغير السجل في جلسة أخرى. حدّث الصفحة وحاول مجددًا.",
    not_found: "السجل المالي أو الطلب غير موجود.",
    forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
    csrf: "انتهت صلاحية نموذج الأمان. حدّث الصفحة.",
    invalid: "راجع رقم الطلب والمبلغ والنصوص والسبب.",
    failed: "تعذر تنفيذ العملية المالية.",
  },
  en: {
    created: "The due was created and added to the financial ledger.",
    "record-payment": "Payment was confirmed and the status is now paid.",
    "reverse-payment": "The payment confirmation was reversed and the due is unpaid again.",
    "void-due": "The due was voided while its audit history was retained.",
    conflict: "This record changed in another session. Refresh and try again.",
    not_found: "The financial record or request was not found.",
    forbidden: "You do not have permission for this action.",
    csrf: "The security form expired. Refresh the page.",
    invalid: "Review the request number, amount, translated copy and reason.",
    failed: "The financial operation could not be completed.",
  },
} as const;

export function FinanceFlash({
  notice,
  locale,
}: Readonly<{ notice?: string; locale: "ar" | "en" }>) {
  if (notice === undefined || !(notice in notices[locale])) return null;
  const success = ["created", "record-payment", "reverse-payment", "void-due"].includes(notice);
  return (
    <p
      aria-live="polite"
      className={`mb-5 rounded-2xl border p-4 text-sm font-bold ${
        success
          ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]"
          : "border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-950)]"
      }`}
    >
      {notices[locale][notice as keyof (typeof notices)[typeof locale]]}
    </p>
  );
}
