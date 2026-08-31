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
 * Per-student money table for the admin finance overview: who owes what,
 * broken down by currency, most-owing first. Each row opens that student's
 * dedicated payment view (`?student=<id>`).
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-separate border-spacing-y-2 text-sm">
        <thead>
          <tr className="text-start text-xs font-black text-[var(--itq-color-muted)]">
            <th className="px-3 py-1 text-start">{english ? "Student" : "الطالب"}</th>
            <th className="px-3 py-1 text-start">{english ? "Outstanding" : "غير مسدَّد"}</th>
            <th className="px-3 py-1 text-start">{english ? "Paid" : "مسدَّد"}</th>
            <th className="px-3 py-1 text-start">{english ? "Last activity" : "آخر حركة"}</th>
            <th className="px-3 py-1" />
          </tr>
        </thead>
        <tbody>
          {balances.map((balance) => {
            const owes = balance.lines.filter((line) => line.unpaidAmountMinor > 0);
            const paid = balance.lines.filter((line) => line.paidAmountMinor > 0);
            return (
              <tr
                className="bg-[var(--itq-color-surface)] shadow-[var(--itq-shadow-sm)]"
                key={balance.studentUserId}
              >
                <td className="rounded-s-2xl px-3 py-3 align-top font-black" dir="auto">
                  {balance.studentDisplayName}
                </td>
                <td className="px-3 py-3 align-top">
                  {owes.length === 0 ? (
                    <span className="text-xs font-black text-[var(--itq-color-success-700)]">
                      {english ? "Settled" : "لا مديونية"}
                    </span>
                  ) : (
                    <span className="grid gap-0.5 font-black text-[var(--itq-color-warning-900)]">
                      {owes.map((line) => (
                        <bdi dir="ltr" key={line.currency}>
                          {amount(line.unpaidAmountMinor, line.currency, line.minorUnit)}
                          <span className="ms-1 text-[10px] font-bold text-[var(--itq-color-muted)]">
                            ×{line.unpaidCount}
                          </span>
                        </bdi>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 align-top text-[var(--itq-color-muted)]">
                  {paid.length === 0 ? (
                    <span className="text-xs">—</span>
                  ) : (
                    <span className="grid gap-0.5">
                      {paid.map((line) => (
                        <bdi dir="ltr" key={line.currency}>
                          {amount(line.paidAmountMinor, line.currency, line.minorUnit)}
                        </bdi>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 align-top text-xs text-[var(--itq-color-muted)]">
                  <LocalDateTime locale={locale} value={balance.lastActivityAt.toISOString()} />
                </td>
                <td className="rounded-e-2xl px-3 py-3 align-top text-end">
                  <Link
                    className="inline-flex min-h-9 items-center rounded-xl bg-[var(--itq-color-brand-700)] px-3 text-xs font-black text-white no-underline"
                    href={`/${locale}/admin/finance?student=${encodeURIComponent(balance.studentUserId)}`}
                  >
                    {english ? "Manage" : "إدارة الدفعات"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
