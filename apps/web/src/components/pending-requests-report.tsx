import Link from "next/link";
import type { JSX } from "react";

import type { StalePendingRequestReport } from "@itqanak/requests";

import { requestStatusLabel } from "@/lib/request-presenters";

import { CsrfInput } from "./auth-shell";
import { LocalDateTime } from "./local-date-time";
import { RequestStatusChip } from "./request-status-chip";
import { ShieldCheckIcon } from "./icons";

type StaleStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "QUOTED";

interface PendingRequestsReportProps {
  readonly locale: "ar" | "en";
  readonly report: StalePendingRequestReport;
  readonly activeStatus: StaleStatus | undefined;
  readonly activeMinDays: number | undefined;
  readonly archivedView: boolean;
  readonly csrfToken: string | undefined;
  readonly notice: string | undefined;
  readonly noticeCount: number | undefined;
  readonly skippedCount: number | undefined;
}

const STATUS_KEYS: readonly StaleStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED"];
const DAY_STEPS = [7, 30, 60, 90] as const;

const copy = {
  ar: {
    title: "الطلبات المعلّقة غير المنتهية",
    intro:
      "طلبات بقيت في حالة غير نهائية دون تحديث: مسودة أكثر من ٧ أيام، أو مُرسَل/قيد المراجعة/مُسعّر أكثر من ٣٠ يومًا. حدّد ما تريد إخفاءه ثم اضغط «أرشفة» — الأرشفة قابلة للاستعادة ولا تحذف شيئًا.",
    introArchived:
      "الطلبات المؤرشفة مخفية من صندوق الطلبات ولوحة الطالب. كل بياناتها محفوظة ويمكن استعادتها في أي وقت.",
    note: "الطلبات المكتملة والملغاة والمالية لا تظهر هنا ولا تُؤرشَف أبدًا — معلومات محفوظة دائمًا.",
    statTotal: "الإجمالي",
    statDraft: "مسودات",
    statSubmitted: "مُرسَل",
    statReview: "قيد المراجعة",
    statQuoted: "مُسعّر",
    filterStatus: "الحالة",
    filterDays: "التعليق منذ",
    all: "الكل",
    clear: "مسح الفلاتر",
    viewPending: "المعلّقة",
    viewArchived: "المؤرشفة",
    colSelect: "",
    colNumber: "رقم الطلب",
    colStudent: "الطالب",
    colStatus: "الحالة",
    colTitle: "العنوان",
    colService: "الخدمة",
    colCreated: "أُنشئ",
    colIdle: "معلّق منذ",
    colReason: "السبب",
    colArchived: "أُرشِف",
    colActions: "",
    protectedShort: "محمي",
    protected: "سجل مالي — محمي، لا يُؤرشَف",
    daysUnit: (n: number) => `${n} يومًا`,
    empty: "لا توجد طلبات معلّقة مطابقة.",
    emptyArchived: "لا توجد طلبات مؤرشفة.",
    prev: "السابق",
    next: "التالي",
    pageInfo: (p: number, count: number) => `صفحة ${p} من ${count}`,
    reasonLabel: "سبب الأرشفة (اختياري)",
    reasonPlaceholder: "مثال: مسودة قديمة بلا نشاط",
    archiveButton: "أرشفة الطلبات المحدّدة",
    restore: "استعادة",
    by: "بواسطة",
    noticeArchived: (n: number) => `تمت أرشفة ${n} طلبًا.`,
    noticeSkipped: (n: number) => ` (تم تخطي ${n} — محمي أو غير مؤهّل)`,
    noticeRestored: "تمت استعادة الطلب.",
  },
  en: {
    title: "Stale pending requests",
    intro:
      "Requests left non-terminal without an update: draft over 7 days, or submitted / under review / quoted over 30 days. Select the ones to hide, then Archive — archiving is reversible and deletes nothing.",
    introArchived:
      "Archived requests are hidden from the request inbox and the student dashboard. All their data is kept and can be restored anytime.",
    note: "Completed, cancelled and finance data never appear here and are never archived — kept permanently.",
    statTotal: "Total",
    statDraft: "Drafts",
    statSubmitted: "Submitted",
    statReview: "Under review",
    statQuoted: "Quoted",
    filterStatus: "Status",
    filterDays: "Idle for",
    all: "All",
    clear: "Clear filters",
    viewPending: "Pending",
    viewArchived: "Archived",
    colSelect: "",
    colNumber: "Request",
    colStudent: "Student",
    colStatus: "Status",
    colTitle: "Title",
    colService: "Service",
    colCreated: "Created",
    colIdle: "Idle for",
    colReason: "Reason",
    colArchived: "Archived",
    colActions: "",
    protectedShort: "protected",
    protected: "Financial record — protected, not archived",
    daysUnit: (n: number) => `${n}d`,
    empty: "No matching pending requests.",
    emptyArchived: "No archived requests.",
    prev: "Previous",
    next: "Next",
    pageInfo: (p: number, count: number) => `Page ${p} of ${count}`,
    reasonLabel: "Archive reason (optional)",
    reasonPlaceholder: "e.g. old draft, no activity",
    archiveButton: "Archive selected requests",
    restore: "Restore",
    by: "by",
    noticeArchived: (n: number) => `Archived ${n} request(s).`,
    noticeSkipped: (n: number) => ` (${n} skipped — protected or not eligible)`,
    noticeRestored: "Request restored.",
  },
} as const;

function buildHref(
  base: string,
  params: {
    status?: StaleStatus | undefined;
    minDays?: number | undefined;
    page?: number;
    view?: "archived" | undefined;
  },
): string {
  const search = new URLSearchParams();
  if (params.view !== undefined) search.set("view", params.view);
  if (params.status !== undefined) search.set("status", params.status);
  if (params.minDays !== undefined) search.set("minDays", String(params.minDays));
  if (params.page !== undefined && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query.length === 0 ? base : `${base}?${query}`;
}

export function PendingRequestsReport({
  activeMinDays,
  activeStatus,
  archivedView,
  csrfToken,
  locale,
  notice,
  noticeCount,
  report,
  skippedCount,
}: PendingRequestsReportProps): JSX.Element {
  const text = copy[locale];
  const base = `/${locale}/admin/requests/pending`;
  const viewParam = archivedView ? ("archived" as const) : undefined;
  const { stats } = report;
  const chipBase =
    "inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-black transition";
  const chipOn =
    "border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]";
  const chipOff =
    "border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] text-[var(--itq-color-ink-soft)] hover:border-[var(--itq-color-brand-200)]";

  const statCards: readonly { label: string; value: number; tone: string }[] = [
    {
      label: text.statTotal,
      value: stats.total,
      tone: "bg-[var(--itq-color-surface-soft)] text-[var(--itq-color-ink)]",
    },
    {
      label: text.statDraft,
      value: stats.draft,
      tone: "bg-[var(--itq-color-info-50)] text-[var(--itq-color-info-800)]",
    },
    {
      label: text.statSubmitted,
      value: stats.submitted,
      tone: "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-800)]",
    },
    {
      label: text.statReview,
      value: stats.underReview,
      tone: "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-800)]",
    },
    {
      label: text.statQuoted,
      value: stats.quoted,
      tone: "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]",
    },
  ];

  const noticeText =
    notice === "archived"
      ? `${text.noticeArchived(noticeCount ?? 0)}${
          skippedCount !== undefined && skippedCount > 0 ? text.noticeSkipped(skippedCount) : ""
        }`
      : notice === "restored"
        ? text.noticeRestored
        : undefined;

  const columnCount = archivedView ? 8 : 9;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--itq-color-border)] pb-6">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">{text.title}</h1>
          <p className="mt-2 max-w-3xl leading-7 text-[var(--itq-color-muted)]">
            {archivedView ? text.introArchived : text.intro}
          </p>
          <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-[var(--itq-color-success-50)] px-3 py-2 text-xs font-bold leading-6 text-[var(--itq-color-success-900)]">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--itq-color-success-700)]" />
            {text.note}
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-xl border border-[var(--itq-color-border)] text-xs font-black">
          <Link
            className={`px-4 py-2 ${
              archivedView
                ? "text-[var(--itq-color-ink-soft)] hover:bg-[var(--itq-color-surface-soft)]"
                : "bg-[var(--itq-color-brand-700)] text-white"
            }`}
            href={base}
          >
            {text.viewPending}
          </Link>
          <Link
            className={`border-s border-[var(--itq-color-border)] px-4 py-2 ${
              archivedView
                ? "bg-[var(--itq-color-brand-700)] text-white"
                : "text-[var(--itq-color-ink-soft)] hover:bg-[var(--itq-color-surface-soft)]"
            }`}
            href={buildHref(base, { view: "archived" })}
          >
            {text.viewArchived}
          </Link>
        </div>
      </div>

      {noticeText !== undefined ? (
        <p className="mt-5 rounded-xl border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] px-4 py-3 text-sm font-black text-[var(--itq-color-brand-strong)]">
          {noticeText}
        </p>
      ) : null}

      <dl className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((card) => (
          <div
            className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4"
            key={card.label}
          >
            <dd className={`inline-flex rounded-lg px-2 py-1 text-2xl font-black ${card.tone}`}>
              {card.value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}
            </dd>
            <dt className="mt-2 text-xs font-bold text-[var(--itq-color-muted)]">{card.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-[var(--itq-color-muted)]">
            {text.filterStatus}:
          </span>
          <Link
            className={`${chipBase} ${activeStatus === undefined ? chipOn : chipOff}`}
            href={buildHref(base, { minDays: activeMinDays, view: viewParam })}
          >
            {text.all}
          </Link>
          {STATUS_KEYS.map((status) => (
            <Link
              className={`${chipBase} ${activeStatus === status ? chipOn : chipOff}`}
              href={buildHref(base, { status, minDays: activeMinDays, view: viewParam })}
              key={status}
            >
              {requestStatusLabel(status, locale)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-[var(--itq-color-muted)]">
            {text.filterDays}:
          </span>
          {DAY_STEPS.map((days) => (
            <Link
              className={`${chipBase} ${activeMinDays === days ? chipOn : chipOff}`}
              href={buildHref(base, { status: activeStatus, minDays: days, view: viewParam })}
              key={days}
            >
              ≥ {text.daysUnit(days)}
            </Link>
          ))}
        </div>
        {activeStatus !== undefined || activeMinDays !== undefined ? (
          <Link
            className="text-xs font-black text-[var(--itq-color-brand-strong)] underline-offset-4 hover:underline"
            href={buildHref(base, { view: viewParam })}
          >
            {text.clear}
          </Link>
        ) : null}
      </div>

      <form action="/api/admin/requests/pending/archive" className="mt-5" method="post">
        <input name="locale" type="hidden" value={locale} />
        <CsrfInput token={csrfToken} />

        <div className="overflow-x-auto rounded-2xl border border-[var(--itq-color-border)]">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--itq-color-surface-soft)] text-start text-xs font-black text-[var(--itq-color-muted)]">
                {archivedView ? null : <th className="w-10 px-3 py-3" />}
                <th className="px-4 py-3 text-start">{text.colNumber}</th>
                <th className="px-4 py-3 text-start">{text.colStudent}</th>
                <th className="px-4 py-3 text-start">{text.colStatus}</th>
                <th className="px-4 py-3 text-start">{text.colTitle}</th>
                <th className="px-4 py-3 text-start">{text.colService}</th>
                {archivedView ? (
                  <>
                    <th className="px-4 py-3 text-start">{text.colArchived}</th>
                    <th className="px-4 py-3 text-start">{text.colReason}</th>
                    <th className="px-4 py-3 text-start" />
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-start">{text.colCreated}</th>
                    <th className="px-4 py-3 text-start">{text.colIdle}</th>
                    <th className="px-4 py-3 text-start">{text.colReason}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {report.items.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-[var(--itq-color-muted)]"
                    colSpan={columnCount}
                  >
                    {archivedView ? text.emptyArchived : text.empty}
                  </td>
                </tr>
              ) : (
                report.items.map((item) => (
                  <tr className="border-t border-[var(--itq-color-border)] align-top" key={item.id}>
                    {archivedView ? null : (
                      <td className="px-3 py-3">
                        <input
                          aria-label={item.requestNumber}
                          className="size-4 accent-[var(--itq-color-brand-700)]"
                          disabled={item.hasFinancialRecord}
                          name="requestIds"
                          type="checkbox"
                          value={item.id}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link
                        className="font-black text-[var(--itq-color-brand-strong)]"
                        href={`/${locale}/admin/support?q=${encodeURIComponent(item.requestNumber)}`}
                      >
                        <bdi dir="ltr">{item.requestNumber}</bdi>
                      </Link>
                      {item.hasFinancialRecord ? (
                        <span className="mt-1 flex items-center gap-1 text-[10px] font-black text-[var(--itq-color-success-800)]">
                          <ShieldCheckIcon className="size-3" />
                          {text.protected}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-bold" dir="auto">
                      {item.studentDisplayName}
                    </td>
                    <td className="px-4 py-3">
                      <RequestStatusChip locale={locale} status={item.status} />
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3" dir="auto">
                      {item.title}
                    </td>
                    <td className="px-4 py-3 text-[var(--itq-color-muted)]" dir="auto">
                      {item.serviceNameAr}
                    </td>
                    {archivedView ? (
                      <>
                        <td className="px-4 py-3 text-[var(--itq-color-muted)]">
                          {item.archivedAt !== undefined ? (
                            <LocalDateTime locale={locale} value={item.archivedAt.toISOString()} />
                          ) : (
                            "—"
                          )}
                          {item.archivedByName !== undefined ? (
                            <span className="mt-0.5 block text-[11px]">
                              {text.by} {item.archivedByName}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className="max-w-[16rem] px-4 py-3 text-[var(--itq-color-muted)]"
                          dir="auto"
                        >
                          {item.archiveReason ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="inline-flex min-h-9 items-center rounded-lg border border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)] px-3 text-xs font-black text-[var(--itq-color-brand-strong)] transition hover:bg-[var(--itq-color-brand-100)]"
                            formAction="/api/admin/requests/pending/restore"
                            formMethod="post"
                            name="requestId"
                            type="submit"
                            value={item.id}
                          >
                            {text.restore}
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-[var(--itq-color-muted)]">
                          <LocalDateTime locale={locale} value={item.createdAt.toISOString()} />
                        </td>
                        <td className="px-4 py-3 font-black tabular-nums">
                          {text.daysUnit(item.daysPending)}
                        </td>
                        <td className="px-4 py-3 text-[var(--itq-color-muted)]">{item.reason}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {archivedView ? null : (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-4">
            <label className="flex-1 text-xs font-black text-[var(--itq-color-muted)]">
              {text.reasonLabel}
              <input
                className="mt-1 block w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-2 text-sm font-bold text-[var(--itq-color-ink)]"
                maxLength={500}
                name="reason"
                placeholder={text.reasonPlaceholder}
                type="text"
              />
            </label>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--itq-color-warning-700)] px-5 text-sm font-black text-white transition hover:bg-[var(--itq-color-warning-800)]"
              type="submit"
            >
              {text.archiveButton}
            </button>
          </div>
        )}
      </form>

      {report.pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm font-black">
          {report.page > 1 ? (
            <Link
              className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 hover:bg-[var(--itq-color-surface-soft)]"
              href={buildHref(base, {
                status: activeStatus,
                minDays: activeMinDays,
                view: viewParam,
                page: report.page - 1,
              })}
            >
              {text.prev}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--itq-color-muted)]">
            {text.pageInfo(report.page, report.pageCount)}
          </span>
          {report.page < report.pageCount ? (
            <Link
              className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 hover:bg-[var(--itq-color-surface-soft)]"
              href={buildHref(base, {
                status: activeStatus,
                minDays: activeMinDays,
                view: viewParam,
                page: report.page + 1,
              })}
            >
              {text.next}
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
