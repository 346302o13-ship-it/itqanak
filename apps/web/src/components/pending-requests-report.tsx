import Link from "next/link";
import type { JSX } from "react";

import type { StalePendingRequestReport } from "@itqanak/requests";

import { requestStatusLabel } from "@/lib/request-presenters";

import { LocalDateTime } from "./local-date-time";
import { RequestStatusChip } from "./request-status-chip";
import { ShieldCheckIcon } from "./icons";

type StaleStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "QUOTED";

interface PendingRequestsReportProps {
  readonly locale: "ar" | "en";
  readonly report: StalePendingRequestReport;
  readonly activeStatus: StaleStatus | undefined;
  readonly activeMinDays: number | undefined;
}

const STATUS_KEYS: readonly StaleStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED"];
const DAY_STEPS = [7, 30, 60, 90] as const;

const copy = {
  ar: {
    title: "الطلبات المعلّقة غير المنتهية",
    intro:
      "طلبات بقيت في حالة غير نهائية دون تحديث: مسودة أكثر من ٧ أيام، أو مُرسَل/قيد المراجعة/مُسعّر أكثر من ٣٠ يومًا. للعرض فقط في هذه المرحلة — التمديد والحذف يأتيان لاحقًا.",
    note: "الطلبات المكتملة والملغاة والمالية لا تظهر هنا ولا تُحذف أبدًا — معلومات محفوظة دائمًا.",
    statTotal: "إجمالي معلّق",
    statDraft: "مسودات ٧ أيام",
    statSubmitted: "مُرسَل ٣٠ يومًا",
    statReview: "قيد المراجعة ٣٠ يومًا",
    statQuoted: "مُسعّر ٣٠ يومًا",
    filterStatus: "الحالة",
    filterDays: "التعليق منذ",
    all: "الكل",
    clear: "مسح الفلاتر",
    colNumber: "رقم الطلب",
    colStudent: "الطالب",
    colStatus: "الحالة",
    colTitle: "العنوان",
    colService: "الخدمة",
    colCreated: "أُنشئ",
    colIdle: "معلّق منذ",
    colReason: "السبب",
    protected: "سجل مالي — محمي",
    daysUnit: (n: number) => `${n} يومًا`,
    empty: "لا توجد طلبات معلّقة مطابقة.",
    prev: "السابق",
    next: "التالي",
    pageInfo: (p: number, count: number) => `صفحة ${p} من ${count}`,
  },
  en: {
    title: "Stale pending requests",
    intro:
      "Requests left in a non-terminal state without an update: draft over 7 days, or submitted / under review / quoted over 30 days. Review-only for now — extend and delete come later.",
    note: "Completed, cancelled and finance data never appear here and are never deleted — kept permanently.",
    statTotal: "Total pending",
    statDraft: "Drafts 7d",
    statSubmitted: "Submitted 30d",
    statReview: "Under review 30d",
    statQuoted: "Quoted 30d",
    filterStatus: "Status",
    filterDays: "Idle for",
    all: "All",
    clear: "Clear filters",
    colNumber: "Request",
    colStudent: "Student",
    colStatus: "Status",
    colTitle: "Title",
    colService: "Service",
    colCreated: "Created",
    colIdle: "Idle for",
    colReason: "Reason",
    protected: "Financial record — protected",
    daysUnit: (n: number) => `${n}d`,
    empty: "No matching pending requests.",
    prev: "Previous",
    next: "Next",
    pageInfo: (p: number, count: number) => `Page ${p} of ${count}`,
  },
} as const;

function buildHref(
  base: string,
  params: { status?: StaleStatus | undefined; minDays?: number | undefined; page?: number },
): string {
  const search = new URLSearchParams();
  if (params.status !== undefined) search.set("status", params.status);
  if (params.minDays !== undefined) search.set("minDays", String(params.minDays));
  if (params.page !== undefined && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query.length === 0 ? base : `${base}?${query}`;
}

export function PendingRequestsReport({
  activeMinDays,
  activeStatus,
  locale,
  report,
}: PendingRequestsReportProps): JSX.Element {
  const text = copy[locale];
  const base = `/${locale}/admin/requests/pending`;
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

  return (
    <div>
      <div className="border-b border-[var(--itq-color-border)] pb-6">
        <h1 className="text-2xl font-black sm:text-3xl">{text.title}</h1>
        <p className="mt-2 max-w-3xl leading-7 text-[var(--itq-color-muted)]">{text.intro}</p>
        <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-[var(--itq-color-success-50)] px-3 py-2 text-xs font-bold leading-6 text-[var(--itq-color-success-900)]">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--itq-color-success-700)]" />
          {text.note}
        </p>
      </div>

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
            href={buildHref(base, { minDays: activeMinDays })}
          >
            {text.all}
          </Link>
          {STATUS_KEYS.map((status) => (
            <Link
              className={`${chipBase} ${activeStatus === status ? chipOn : chipOff}`}
              href={buildHref(base, { status, minDays: activeMinDays })}
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
              href={buildHref(base, { status: activeStatus, minDays: days })}
              key={days}
            >
              ≥ {text.daysUnit(days)}
            </Link>
          ))}
        </div>
        {activeStatus !== undefined || activeMinDays !== undefined ? (
          <Link
            className="text-xs font-black text-[var(--itq-color-brand-strong)] underline-offset-4 hover:underline"
            href={base}
          >
            {text.clear}
          </Link>
        ) : null}
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--itq-color-border)]">
        <table className="w-full min-w-[54rem] border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--itq-color-surface-soft)] text-start text-xs font-black text-[var(--itq-color-muted)]">
              <th className="px-4 py-3 text-start">{text.colNumber}</th>
              <th className="px-4 py-3 text-start">{text.colStudent}</th>
              <th className="px-4 py-3 text-start">{text.colStatus}</th>
              <th className="px-4 py-3 text-start">{text.colTitle}</th>
              <th className="px-4 py-3 text-start">{text.colService}</th>
              <th className="px-4 py-3 text-start">{text.colCreated}</th>
              <th className="px-4 py-3 text-start">{text.colIdle}</th>
              <th className="px-4 py-3 text-start">{text.colReason}</th>
            </tr>
          </thead>
          <tbody>
            {report.items.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-[var(--itq-color-muted)]" colSpan={8}>
                  {text.empty}
                </td>
              </tr>
            ) : (
              report.items.map((item) => (
                <tr className="border-t border-[var(--itq-color-border)] align-top" key={item.id}>
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
                  <td className="px-4 py-3 text-[var(--itq-color-muted)]">
                    <LocalDateTime locale={locale} value={item.createdAt.toISOString()} />
                  </td>
                  <td className="px-4 py-3 font-black tabular-nums">
                    {text.daysUnit(item.daysPending)}
                  </td>
                  <td className="px-4 py-3 text-[var(--itq-color-muted)]">{item.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {report.pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm font-black">
          {report.page > 1 ? (
            <Link
              className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 hover:bg-[var(--itq-color-surface-soft)]"
              href={buildHref(base, {
                status: activeStatus,
                minDays: activeMinDays,
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
