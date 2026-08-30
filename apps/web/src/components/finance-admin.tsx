import Link from "next/link";

import {
  financeCurrencies,
  financeDueStatuses,
  financePaymentMethods,
  type AdminFinanceDue,
  type FinanceListInput,
  type FinanceListResult,
  type FinanceReport,
  type PaymentReceiptSubmission,
} from "@itqanak/finance";

import { financePaymentMethodLabel, formatFinanceAmount } from "@/lib/finance-presenters";

import { AdminShell } from "./admin-shell";
import { CsrfInput } from "./auth-shell";
import { FilterDisclosure } from "./filter-disclosure";
import { FinanceFlash } from "./finance-flash";
import { FinanceReportCards, FinanceStatusChip } from "./finance-widgets";
import { LocalDateTime } from "./local-date-time";
import { SubmitButton } from "./submit-button";

interface FinanceAdminProps {
  readonly displayName: string;
  readonly csrfToken: string | undefined;
  readonly dues: FinanceListResult<AdminFinanceDue>;
  readonly report?: FinanceReport;
  readonly filters: FinanceListInput;
  readonly canManage: boolean;
  readonly locale: "ar" | "en";
  readonly notice?: string;
  readonly pendingReceipts?: readonly PaymentReceiptSubmission[];
}

const controlClassName =
  "mt-2 min-h-12 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-sm shadow-sm outline-none focus:border-[var(--itq-color-brand-500)]";

function pageHref(locale: "ar" | "en", filters: FinanceListInput, page: number): string {
  const query = new URLSearchParams();
  if (filters.search !== undefined && filters.search.length > 0) query.set("q", filters.search);
  if (filters.status !== undefined) query.set("status", filters.status);
  if (filters.currency !== undefined) query.set("currency", filters.currency);
  query.set("page", String(page));
  return `/${locale}/admin/finance?${query.toString()}`;
}

export function FinanceAdmin({
  displayName,
  csrfToken,
  dues,
  report,
  filters,
  canManage,
  locale,
  notice,
  pendingReceipts,
}: FinanceAdminProps) {
  const english = locale === "en";
  const numberFormat = new Intl.NumberFormat(english ? "en-US" : "ar-SA");
  const receipts = pendingReceipts ?? [];
  return (
    <AdminShell csrfToken={csrfToken} displayName={displayName} locale={locale}>
      <FinanceFlash locale={locale} {...(notice === undefined ? {} : { notice })} />

      <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-[var(--itq-color-brand-strong)]">
              {english ? "Internal financial ledger" : "السجل المالي الداخلي"}
            </p>
            <h1 className="mt-1 text-3xl font-black">
              {english ? "Payments & dues" : "المدفوعات والمستحقات"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--itq-color-muted)]">
              {english
                ? "Create request-linked dues and manually confirm a payment. No external payment gateway or card data is used."
                : "أنشئ مستحقات مرتبطة بطلب فعلي وأكّد الدفع يدويًا. لا توجد بوابة دفع خارجية ولا تُحفظ بيانات بطاقات."}
            </p>
          </div>
          <span className="rounded-full bg-[var(--itq-color-brand-50)] px-4 py-2 text-sm font-black text-[var(--itq-color-brand-strong)]">
            {numberFormat.format(dues.total)} {english ? "records" : "سجل"}
          </span>
        </div>

        {report === undefined ? null : (
          <div className="mt-7">
            <FinanceReportCards locale={locale} report={report} />
          </div>
        )}
      </section>

      {canManage ? (
        <details className="mt-6 rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-[var(--itq-shadow-sm)]">
          <summary className="cursor-pointer list-none p-5 text-lg font-black sm:p-7">
            {english ? "+ Create a request-linked due" : "+ إنشاء مستحق مرتبط بطلب"}
          </summary>
          <form
            action="/api/admin/finance"
            className="grid gap-5 border-t border-[var(--itq-color-border)] p-5 sm:grid-cols-2 sm:p-7"
            method="post"
          >
            <CsrfInput token={csrfToken} />
            <input name="locale" type="hidden" value={locale} />
            <label className="text-sm font-black">
              {english ? "Request number" : "رقم الطلب"}
              <input
                className={controlClassName}
                dir="ltr"
                name="requestNumber"
                pattern="ITQ-[0-9]{4}-[0-9]{6,}"
                placeholder="ITQ-2026-000001"
                required
              />
            </label>
            <label className="text-sm font-black">
              {english ? "Amount" : "المبلغ"}
              <span className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
                <input
                  className="min-h-12 rounded-xl border border-[var(--itq-color-border)] px-3 text-sm"
                  dir="ltr"
                  inputMode="decimal"
                  name="amount"
                  pattern="[0-9]+([.][0-9]{1,3})?"
                  placeholder="0.00"
                  required
                />
                <select
                  className="rounded-xl border border-[var(--itq-color-border)] px-3 text-sm"
                  name="currency"
                  required
                >
                  {financeCurrencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="text-sm font-black">
              {english ? "Arabic title" : "العنوان بالعربية"}
              <input className={controlClassName} maxLength={160} name="titleAr" required />
            </label>
            <label className="text-sm font-black">
              {english ? "English title" : "العنوان بالإنجليزية"}
              <input
                className={controlClassName}
                dir="ltr"
                maxLength={160}
                name="titleEn"
                required
              />
            </label>
            <label className="text-sm font-black">
              {english ? "Arabic description (optional)" : "الوصف بالعربية (اختياري)"}
              <textarea
                className={controlClassName}
                maxLength={2000}
                name="descriptionAr"
                rows={3}
              />
            </label>
            <label className="text-sm font-black">
              {english ? "English description (optional)" : "الوصف بالإنجليزية (اختياري)"}
              <textarea
                className={controlClassName}
                dir="ltr"
                maxLength={2000}
                name="descriptionEn"
                rows={3}
              />
            </label>
            <label className="text-sm font-black">
              {english
                ? "Due date (optional, Saudi time)"
                : "تاريخ الاستحقاق (اختياري، بتوقيت السعودية)"}
              <input className={controlClassName} dir="ltr" name="dueAt" type="datetime-local" />
            </label>
            <div className="flex items-end">
              <SubmitButton
                className="w-full"
                pendingLabel={english ? "Creating…" : "جارٍ الإنشاء…"}
              >
                {english ? "Create due" : "إنشاء المستحق"}
              </SubmitButton>
            </div>
          </form>
        </details>
      ) : null}

      {canManage && receipts.length > 0 ? (
        <section className="mt-6 rounded-[1.75rem] border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black text-[var(--itq-color-warning-900)]">
              {english ? "Payment receipts awaiting review" : "إيصالات دفع بانتظار المراجعة"}
            </h2>
            <span className="rounded-full bg-[var(--itq-color-warning-200)] px-3 py-1 text-xs font-black text-[var(--itq-color-warning-900)]">
              {numberFormat.format(receipts.length)}
            </span>
          </div>
          <ul className="mt-5 grid gap-4">
            {receipts.map((receipt) => (
              <li
                className="grid gap-4 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4 sm:grid-cols-[10rem_minmax(0,1fr)]"
                key={receipt.id}
              >
                <a
                  className="block overflow-hidden rounded-xl border border-[var(--itq-color-border)]"
                  href={`/api/admin/finance/receipts/${encodeURIComponent(receipt.id)}/image`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <img
                    alt={english ? "Payment receipt" : "إيصال الدفع"}
                    className="h-40 w-full bg-[var(--itq-color-surface-soft)] object-contain"
                    src={`/api/admin/finance/receipts/${encodeURIComponent(receipt.id)}/image`}
                  />
                </a>
                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-black">{receipt.studentDisplayName}</p>
                    <p className="mt-1 text-xs text-[var(--itq-color-muted)]">
                      <bdi dir="ltr">{receipt.dueReference}</bdi> ·{" "}
                      <Link
                        className="font-black underline"
                        href={`/${locale}/admin/requests/${encodeURIComponent(receipt.requestNumber)}`}
                      >
                        <bdi dir="ltr">{receipt.requestNumber}</bdi>
                      </Link>
                    </p>
                    <p
                      className="mt-2 text-lg font-black text-[var(--itq-color-brand-strong)]"
                      dir="ltr"
                    >
                      {formatFinanceAmount(
                        receipt.amountMinor,
                        receipt.currency,
                        receipt.minorUnit,
                        locale,
                      )}
                    </p>
                    <p className="mt-1 text-xs text-[var(--itq-color-muted)]">
                      {english ? "Submitted: " : "أُرسل: "}
                      <LocalDateTime locale={locale} value={receipt.submittedAt.toISOString()} />
                    </p>
                    {receipt.note === undefined ? null : (
                      <p
                        className="mt-2 whitespace-pre-wrap rounded-lg bg-[var(--itq-color-surface-soft)] p-2 text-xs"
                        dir="auto"
                      >
                        {receipt.note}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <form
                      action={`/api/admin/finance/receipts/${encodeURIComponent(receipt.id)}/review`}
                      className="grid gap-2 rounded-xl bg-[var(--itq-color-success-50)] p-3"
                      method="post"
                    >
                      <CsrfInput token={csrfToken} />
                      <input name="locale" type="hidden" value={locale} />
                      <input name="decision" type="hidden" value="ACCEPT" />
                      <SubmitButton pendingLabel={english ? "Confirming…" : "جارٍ التأكيد…"}>
                        {english ? "Accept — mark paid" : "قبول — تعليم كمدفوع"}
                      </SubmitButton>
                    </form>
                    <form
                      action={`/api/admin/finance/receipts/${encodeURIComponent(receipt.id)}/review`}
                      className="grid gap-2 rounded-xl bg-[var(--itq-color-surface-soft)] p-3"
                      method="post"
                    >
                      <CsrfInput token={csrfToken} />
                      <input name="locale" type="hidden" value={locale} />
                      <input name="decision" type="hidden" value="REJECT" />
                      <input
                        className="min-h-10 rounded-lg border border-[var(--itq-color-border)] px-2 text-xs"
                        maxLength={1000}
                        name="reviewNote"
                        placeholder={english ? "Reason (optional)" : "السبب (اختياري)"}
                      />
                      <SubmitButton
                        className="bg-[var(--itq-color-ink-soft)]"
                        pendingLabel={english ? "Rejecting…" : "جارٍ الرفض…"}
                      >
                        {english ? "Reject" : "رفض"}
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-7">
        <FilterDisclosure
          activeCount={
            [filters.search && filters.search.length > 0, filters.status, filters.currency].filter(
              Boolean,
            ).length
          }
          className=""
          label={english ? "Filters" : "الفلاتر"}
        >
          <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem_9rem_auto]" method="get">
            <label className="text-xs font-black">
              {english ? "Search" : "البحث"}
              <input
                className={controlClassName}
                defaultValue={filters.search ?? ""}
                maxLength={100}
                name="q"
                placeholder={
                  english ? "Student, request or due reference" : "الطالب أو الطلب أو مرجع المستحق"
                }
                type="search"
              />
            </label>
            <label className="text-xs font-black">
              {english ? "Status" : "الحالة"}
              <select
                className={controlClassName}
                defaultValue={filters.status ?? ""}
                name="status"
              >
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
        </FilterDisclosure>

        {dues.items.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-[var(--itq-color-border)] p-8 text-center font-bold text-[var(--itq-color-muted)]">
            {english ? "No matching financial records." : "لا توجد سجلات مالية مطابقة."}
          </p>
        ) : (
          <ul className="mt-6 grid gap-4">
            {dues.items.map((due) => {
              const title = english ? due.titleEn : due.titleAr;
              const description = english ? due.descriptionEn : due.descriptionAr;
              return (
                <li
                  className="rounded-2xl border border-[var(--itq-color-border)] p-5"
                  key={due.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-black" dir="auto">
                          {title}
                        </h2>
                        <FinanceStatusChip locale={locale} status={due.status} />
                      </div>
                      <p className="mt-2 text-sm font-bold">{due.studentDisplayName}</p>
                      <p className="mt-1 text-xs text-[var(--itq-color-muted)]">
                        <bdi dir="ltr">{due.reference}</bdi> ·{" "}
                        <Link
                          className="font-black underline"
                          href={`/${locale}/admin/requests/${encodeURIComponent(due.requestNumber)}`}
                        >
                          <bdi dir="ltr">{due.requestNumber}</bdi>
                        </Link>
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
                    {due.latestPaymentMethod === undefined ? null : (
                      <div>
                        <dt className="inline font-bold">{english ? "Method: " : "الوسيلة: "}</dt>
                        <dd className="inline">
                          {financePaymentMethodLabel(due.latestPaymentMethod, locale)}
                        </dd>
                      </div>
                    )}
                    {due.latestPaymentReference === undefined ? null : (
                      <div>
                        <dt className="inline font-bold">{english ? "Reference: " : "المرجع: "}</dt>
                        <dd className="inline" dir="ltr">
                          {due.latestPaymentReference}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {!canManage || due.status === "VOIDED" ? null : (
                    <div className="mt-5 grid gap-3 border-t border-[var(--itq-color-border)] pt-5 lg:grid-cols-2">
                      {due.status === "UNPAID" ? (
                        <form
                          action={`/api/admin/finance/${encodeURIComponent(due.id)}`}
                          className="grid gap-3 rounded-2xl bg-[var(--itq-color-success-50)] p-4 sm:grid-cols-2"
                          method="post"
                        >
                          <CsrfInput token={csrfToken} />
                          <input name="locale" type="hidden" value={locale} />
                          <input name="action" type="hidden" value="record-payment" />
                          <input name="expectedVersion" type="hidden" value={due.version} />
                          <label className="text-xs font-black">
                            {english ? "Payment method" : "وسيلة الدفع"}
                            <select className={controlClassName} name="method" required>
                              {financePaymentMethods.map((method) => (
                                <option key={method} value={method}>
                                  {financePaymentMethodLabel(method, locale)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs font-black">
                            {english ? "Verification reference" : "مرجع التحقق"}
                            <input
                              className={controlClassName}
                              dir="ltr"
                              maxLength={120}
                              minLength={2}
                              name="reference"
                              required
                            />
                          </label>
                          <label className="text-xs font-black sm:col-span-2">
                            {english ? "Internal note (optional)" : "ملاحظة داخلية (اختيارية)"}
                            <textarea
                              className={controlClassName}
                              maxLength={500}
                              name="note"
                              rows={2}
                            />
                          </label>
                          <SubmitButton
                            className="sm:col-span-2"
                            pendingLabel={english ? "Confirming…" : "جارٍ التأكيد…"}
                          >
                            {english ? "Confirm full payment" : "تأكيد دفع المبلغ كاملًا"}
                          </SubmitButton>
                        </form>
                      ) : (
                        <form
                          action={`/api/admin/finance/${encodeURIComponent(due.id)}`}
                          className="grid gap-3 rounded-2xl bg-[var(--itq-color-warning-50)] p-4"
                          method="post"
                        >
                          <CsrfInput token={csrfToken} />
                          <input name="locale" type="hidden" value={locale} />
                          <input name="action" type="hidden" value="reverse-payment" />
                          <input name="expectedVersion" type="hidden" value={due.version} />
                          <label className="text-xs font-black">
                            {english ? "Reason for reversal" : "سبب عكس الدفع"}
                            <textarea
                              className={controlClassName}
                              maxLength={500}
                              minLength={2}
                              name="reason"
                              required
                              rows={2}
                            />
                          </label>
                          <SubmitButton
                            className="bg-[var(--itq-color-warning-700)]"
                            pendingLabel={english ? "Reversing…" : "جارٍ العكس…"}
                          >
                            {english ? "Reverse payment confirmation" : "عكس تأكيد الدفع"}
                          </SubmitButton>
                        </form>
                      )}
                      {due.status === "UNPAID" ? (
                        <form
                          action={`/api/admin/finance/${encodeURIComponent(due.id)}`}
                          className="grid gap-3 rounded-2xl bg-[var(--itq-color-surface-soft)] p-4"
                          method="post"
                        >
                          <CsrfInput token={csrfToken} />
                          <input name="locale" type="hidden" value={locale} />
                          <input name="action" type="hidden" value="void-due" />
                          <input name="expectedVersion" type="hidden" value={due.version} />
                          <label className="text-xs font-black">
                            {english ? "Reason for voiding" : "سبب إلغاء المستحق"}
                            <textarea
                              className={controlClassName}
                              maxLength={500}
                              minLength={2}
                              name="reason"
                              required
                              rows={2}
                            />
                          </label>
                          <SubmitButton
                            className="bg-[var(--itq-color-ink-soft)]"
                            pendingLabel={english ? "Voiding…" : "جارٍ الإلغاء…"}
                          >
                            {english ? "Void due" : "إلغاء المستحق"}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  )}
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
      </section>
    </AdminShell>
  );
}
