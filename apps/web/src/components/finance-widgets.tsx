import type { FinanceDueStatus, FinanceReport } from "@itqanak/finance";

import {
  financeStatusClassName,
  financeStatusLabel,
  formatFinanceAmount,
} from "@/lib/finance-presenters";

export function FinanceStatusChip({
  status,
  locale,
}: Readonly<{ status: FinanceDueStatus; locale: "ar" | "en" }>) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ring-1 ring-inset ${financeStatusClassName(status)}`}
    >
      {financeStatusLabel(status, locale)}
    </span>
  );
}

export function FinanceReportCards({
  report,
  locale,
}: Readonly<{ report: FinanceReport; locale: "ar" | "en" }>) {
  const english = locale === "en";
  if (report.totals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--itq-color-border)] bg-white p-5 text-sm font-bold text-[var(--itq-color-muted)]">
        {english ? "No financial totals yet." : "لا توجد إجماليات مالية حتى الآن."}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {report.totals.map((total) => (
        <article
          className="rounded-2xl border border-[var(--itq-color-border)] bg-white p-5 shadow-[var(--itq-shadow-sm)]"
          key={total.currency}
        >
          <div className="flex items-center justify-between gap-3">
            <strong className="text-lg font-black" dir="ltr">
              {total.currency}
            </strong>
            <span className="rounded-full bg-[var(--itq-color-brand-50)] px-3 py-1 text-xs font-black text-[var(--itq-color-brand-800)]">
              {english ? `${total.unpaidCount} unpaid` : `${total.unpaidCount} غير مدفوع`}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-amber-50 p-3">
              <dt className="text-xs font-bold text-amber-900/70">
                {english ? "Outstanding" : "المستحق"}
              </dt>
              <dd className="mt-1 font-black text-amber-950" dir="ltr">
                {formatFinanceAmount(
                  total.unpaidAmountMinor,
                  total.currency,
                  total.minorUnit,
                  locale,
                )}
              </dd>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <dt className="text-xs font-bold text-emerald-900/70">
                {english ? "Confirmed paid" : "المؤكد دفعه"}
              </dt>
              <dd className="mt-1 font-black text-emerald-950" dir="ltr">
                {formatFinanceAmount(
                  total.paidAmountMinor,
                  total.currency,
                  total.minorUnit,
                  locale,
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs font-semibold text-[var(--itq-color-muted)]">
            {english
              ? `${total.paidCount} paid · ${total.voidedCount} voided`
              : `${total.paidCount} مدفوع · ${total.voidedCount} ملغى`}
          </p>
        </article>
      ))}
    </div>
  );
}
