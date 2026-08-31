import Link from "next/link";

import type { FinanceDueStatus, FinanceReport, StudentFinanceBalance } from "@itqanak/finance";

import { LocalDateTime } from "./local-date-time";
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

/**
 * Per-student money overview for the admin finance page: one clean row per
 * student — what they still owe (bold, per currency) and what they've paid —
 * most-owing first. Each row opens that student's dedicated payment view.
 */
export function StudentBalanceTable({
  balances,
  locale,
}: Readonly<{ balances: readonly StudentFinanceBalance[]; locale: "ar" | "en" }>) {
  const english = locale === "en";
  if (balances.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--itq-color-border)] p-8 text-center font-bold text-[var(--itq-color-muted)]">
        {english ? "No student has any dues yet." : "لا يوجد طلاب لديهم مستحقات بعد."}
      </p>
    );
  }
  const amount = (minor: number, currency: string, unit: 2 | 3) =>
    formatFinanceAmount(minor, currency as never, unit, locale);
  return (
    <ul className="grid gap-2.5">
      {balances.map((balance) => {
        const owes = balance.lines.filter((line) => line.unpaidAmountMinor > 0);
        const paid = balance.lines.filter((line) => line.paidAmountMinor > 0);
        return (
          <li
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3.5 shadow-[var(--itq-shadow-sm)] sm:p-4"
            key={balance.studentUserId}
          >
            <div className="min-w-40 flex-1">
              <p className="font-black" dir="auto">
                {balance.studentDisplayName}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--itq-color-muted)]">
                {english ? "Last activity " : "آخر حركة "}
                <LocalDateTime locale={locale} value={balance.lastActivityAt.toISOString()} />
              </p>
            </div>

            <div className="text-end">
              <p className="text-[10px] font-bold text-[var(--itq-color-muted)]">
                {english ? "Outstanding" : "غير مسدَّد"}
              </p>
              {owes.length === 0 ? (
                <p className="text-sm font-black text-[var(--itq-color-success-700)]">
                  {english ? "Settled" : "لا مديونية"}
                </p>
              ) : (
                <div className="grid gap-0.5">
                  {owes.map((line) => (
                    <bdi
                      className="text-sm font-black text-[var(--itq-color-warning-900)]"
                      dir="ltr"
                      key={line.currency}
                    >
                      {amount(line.unpaidAmountMinor, line.currency, line.minorUnit)}
                      <span className="ms-1 text-[10px] font-bold text-[var(--itq-color-muted)]">
                        ×{line.unpaidCount}
                      </span>
                    </bdi>
                  ))}
                </div>
              )}
            </div>

            {paid.length > 0 ? (
              <div className="hidden text-end sm:block">
                <p className="text-[10px] font-bold text-[var(--itq-color-muted)]">
                  {english ? "Paid" : "مسدَّد"}
                </p>
                <div className="grid gap-0.5">
                  {paid.map((line) => (
                    <bdi
                      className="text-sm font-bold text-[var(--itq-color-muted)]"
                      dir="ltr"
                      key={line.currency}
                    >
                      {amount(line.paidAmountMinor, line.currency, line.minorUnit)}
                    </bdi>
                  ))}
                </div>
              </div>
            ) : null}

            <Link
              className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-[var(--itq-color-brand-700)] px-3.5 text-xs font-black text-white no-underline"
              href={`/${locale}/admin/finance?student=${encodeURIComponent(balance.studentUserId)}`}
            >
              {english ? "Manage" : "إدارة الدفعات"}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function FinanceReportCards({
  report,
  locale,
}: Readonly<{ report: FinanceReport; locale: "ar" | "en" }>) {
  const english = locale === "en";
  if (report.totals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 text-sm font-bold text-[var(--itq-color-muted)]">
        {english ? "No financial totals yet." : "لا توجد إجماليات مالية حتى الآن."}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {report.totals.map((total) => (
        <article
          className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)]"
          key={total.currency}
        >
          <div className="flex items-center justify-between gap-3">
            <strong className="text-lg font-black" dir="ltr">
              {total.currency}
            </strong>
            <span className="rounded-full bg-[var(--itq-color-brand-50)] px-3 py-1 text-xs font-black text-[var(--itq-color-brand-strong)]">
              {english ? `${total.unpaidCount} unpaid` : `${total.unpaidCount} غير مدفوع`}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-[var(--itq-color-warning-50)] p-3">
              <dt className="text-xs font-bold text-[var(--itq-color-warning-800)]">
                {english ? "Outstanding" : "المستحق"}
              </dt>
              <dd className="mt-1 font-black text-[var(--itq-color-warning-950)]" dir="ltr">
                {formatFinanceAmount(
                  total.unpaidAmountMinor,
                  total.currency,
                  total.minorUnit,
                  locale,
                )}
              </dd>
            </div>
            <div className="rounded-xl bg-[var(--itq-color-success-50)] p-3">
              <dt className="text-xs font-bold text-[var(--itq-color-success-800)]">
                {english ? "Confirmed paid" : "المؤكد دفعه"}
              </dt>
              <dd className="mt-1 font-black text-[var(--itq-color-success-900)]" dir="ltr">
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
