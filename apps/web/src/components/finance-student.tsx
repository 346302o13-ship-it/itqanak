import Link from "next/link";

import {
  financeCurrencies,
  financeDueStatuses,
  type FinanceListInput,
  type FinanceListResult,
  type FinanceReport,
} from "@itqanak/finance";

import { formatFinanceAmount } from "@/lib/finance-presenters";

import { FinanceReportCards, FinanceStatusChip } from "./finance-widgets";
import { LocalDateTime } from "./local-date-time";
import { StudentShell } from "./student-shell";

interface FinanceStudentProps {
  readonly displayName: string;
  readonly csrfToken: string | undefined;
  readonly dues: FinanceListResult;
  readonly report: FinanceReport;
  readonly filters: FinanceListInput;
  readonly locale: "ar" | "en";
}

const controlClassName =
  "mt-2 min-h-12 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-sm shadow-sm outline-none focus:border-[var(--itq-color-brand-500)]";

function pageHref(locale: "ar" | "en", filters: FinanceListInput, page: number): string {
  const query = new URLSearchParams();
  if (filters.search !== undefined && filters.search.length > 0) query.set("q", filters.search);
  if (filters.status !== undefined) query.set("status", filters.status);
  if (filters.currency !== undefined) query.set("currency", filters.currency);
  query.set("page", String(page));
  return `/${locale}/student/finance?${query.toString()}`;
}

export function FinanceStudent({
  displayName,
  csrfToken,
  dues,
  report,
  filters,
  locale,
}: FinanceStudentProps) {
  const english = locale === "en";
  return (
    <StudentShell csrfToken={csrfToken} displayName={displayName} locale={locale}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-[var(--itq-color-brand-strong)]">
            {english ? "Private account ledger" : "سجل حسابك الخاص"}
          </p>
          <h1 className="mt-1 text-3xl font-black">
            {english ? "Payments & dues" : "المدفوعات والمستحقات"}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--itq-color-muted)]">
            {english
              ? "Only confirmed records linked to your requests appear here. Payment status is updated manually by authorized support staff."
              : "تظهر هنا السجلات المرتبطة بطلباتك فقط. يحدّث فريق الدعم المخوّل حالة الدفع يدويًا بعد التحقق."}
          </p>
        </div>
        <span className="rounded-full bg-[var(--itq-color-success-50)] px-4 py-2 text-xs font-black text-[var(--itq-color-success-800)]">
          {english ? "No card data stored" : "لا تُحفظ بيانات بطاقات"}
        </span>
      </div>

      <div className="mt-7">
        <FinanceReportCards locale={locale} report={report} />
      </div>

      <form
        className="mt-7 grid gap-4 rounded-2xl bg-[var(--itq-color-brand-50)] p-5 md:grid-cols-[minmax(0,1fr)_11rem_9rem_auto]"
        method="get"
      >
        <label className="text-xs font-black">
          {english ? "Search" : "البحث"}
          <input
            className={controlClassName}
            defaultValue={filters.search ?? ""}
            maxLength={100}
            name="q"
            placeholder={english ? "Request or due reference" : "مرجع الطلب أو المستحق"}
            type="search"
          />
        </label>
        <label className="text-xs font-black">
          {english ? "Status" : "الحالة"}
          <select className={controlClassName} defaultValue={filters.status ?? ""} name="status">
            <option value="">{english ? "All statuses" : "كل الحالات"}</option>
            {financeDueStatuses.map((status) => (
              <option key={status} value={status}>
                {status === "UNPAID"
                  ? english
                    ? "Unpaid"
                    : "غير مدفوع"
                  : status === "PAID"
                    ? english
                      ? "Paid"
                      : "مدفوع"
                    : english
                      ? "Voided"
                      : "ملغى"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-black">
          {english ? "Currency" : "العملة"}
          <select
            className={controlClassName}
            defaultValue={filters.currency ?? ""}
            name="currency"
          >
            <option value="">{english ? "All" : "الكل"}</option>
            {financeCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-12 self-end rounded-xl bg-[var(--itq-color-brand-700)] px-5 text-sm font-black text-white"
          type="submit"
        >
          {english ? "Apply" : "تطبيق"}
        </button>
      </form>

      {dues.items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--itq-color-border)] p-8 text-center">
          <p className="font-black">
            {english ? "No matching financial records" : "لا توجد سجلات مالية مطابقة"}
          </p>
          <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
            {english
              ? "Public service pages never show pricing."
              : "صفحات الخدمات العامة لا تعرض الأسعار."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {dues.items.map((due) => {
            const title = english ? due.titleEn : due.titleAr;
            const description = english ? due.descriptionEn : due.descriptionAr;
            return (
              <li className="rounded-2xl border border-[var(--itq-color-border)] p-5" key={due.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black" dir="auto">
                        {title}
                      </h2>
                      <FinanceStatusChip locale={locale} status={due.status} />
                    </div>
                    <p className="mt-2 text-xs font-bold text-[var(--itq-color-muted)]">
                      <bdi dir="ltr">{due.reference}</bdi> ·{" "}
                      <bdi dir="ltr">{due.requestNumber}</bdi>
                    </p>
                  </div>
                  <strong
                    className="text-xl font-black text-[var(--itq-color-brand-strong)]"
                    dir="ltr"
                  >
                    {formatFinanceAmount(due.amountMinor, due.currency, due.minorUnit, locale)}
                  </strong>
                </div>
                {description === undefined ? null : (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7" dir="auto">
                    {description}
                  </p>
                )}
                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--itq-color-muted)]">
                  <div>
                    <dt className="inline font-bold">{english ? "Created: " : "أُنشئ: "}</dt>
                    <dd className="inline">
                      <LocalDateTime locale={locale} value={due.createdAt.toISOString()} />
                    </dd>
                  </div>
                  {due.dueAt === undefined ? null : (
                    <div>
                      <dt className="inline font-bold">{english ? "Due: " : "الاستحقاق: "}</dt>
                      <dd className="inline">
                        <LocalDateTime locale={locale} value={due.dueAt.toISOString()} />
                      </dd>
                    </div>
                  )}
                  {due.paidAt === undefined ? null : (
                    <div>
                      <dt className="inline font-bold">{english ? "Paid: " : "دُفع: "}</dt>
                      <dd className="inline">
                        <LocalDateTime locale={locale} value={due.paidAt.toISOString()} />
                      </dd>
                    </div>
                  )}
                </dl>
                <Link
                  className="mt-4 inline-flex text-sm font-black text-[var(--itq-color-brand-strong)] underline"
                  href={`/${locale}/student/requests/${encodeURIComponent(due.requestNumber)}`}
                >
                  {english ? "Open linked request" : "فتح الطلب المرتبط"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <nav
        aria-label={english ? "Finance pages" : "صفحات السجل المالي"}
        className="mt-7 flex items-center justify-between gap-4"
      >
        {dues.page > 1 ? (
          <Link
            className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 text-sm font-black"
            href={pageHref(locale, filters, dues.page - 1)}
          >
            {english ? "Previous" : "السابق"}
          </Link>
        ) : (
          <span />
        )}
        <span className="text-xs font-bold text-[var(--itq-color-muted)]">
          {english
            ? `Page ${dues.page} of ${dues.pageCount}`
            : `الصفحة ${dues.page} من ${dues.pageCount}`}
        </span>
        {dues.page < dues.pageCount ? (
          <Link
            className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 text-sm font-black"
            href={pageHref(locale, filters, dues.page + 1)}
          >
            {english ? "Next" : "التالي"}
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </StudentShell>
  );
}
