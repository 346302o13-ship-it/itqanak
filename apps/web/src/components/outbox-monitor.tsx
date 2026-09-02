import Link from "next/link";
import type { JSX } from "react";

import type { OutboxMonitorReport } from "@itqanak/operations";

import { AdminShell } from "./admin-shell";
import { CsrfInput } from "./auth-shell";
import { LocalDateTime } from "./local-date-time";

type OutboxStatus = "PENDING" | "PROCESSING" | "RETRY" | "DELIVERED" | "DEAD_LETTER";

interface OutboxMonitorProps {
  readonly locale: "ar" | "en";
  readonly displayName: string;
  readonly report: OutboxMonitorReport;
  readonly csrfToken: string | undefined;
  readonly activeStatus: OutboxStatus | undefined;
  readonly typePrefix: string;
  readonly notice: string | undefined;
}

const STATUSES: readonly OutboxStatus[] = [
  "PENDING",
  "PROCESSING",
  "RETRY",
  "DELIVERED",
  "DEAD_LETTER",
];

const copy = {
  ar: {
    title: "صندوق الأحداث (AutoBox)",
    intro:
      "سجل الأحداث المعاملي: كل حدث يُكتب مع نفس المعاملة ثم يُسلَّم بموثوقية. كثير من الأحداث «معلّقة» لأنها سجلّ داخلي بلا خطوة تسليم — المهم هو «فشل نهائي».",
    pending: "معلّق",
    processing: "قيد المعالجة",
    retry: "إعادة محاولة",
    delivered: "مُسلَّم",
    deadLetter: "فشل نهائي",
    stuck: "متأخّر > ساعة",
    oldest: "أقدم غير مُسلَّم",
    minutes: (n: number | null) => (n === null ? "—" : `${n} دقيقة`),
    topTypes: "أكثر الأنواع",
    filterStatus: "الحالة",
    all: "الكل",
    typePlaceholder: "بادئة النوع، مثل FILE_ أو REQUEST_",
    apply: "تطبيق",
    clear: "مسح",
    colTime: "الوقت",
    colType: "النوع",
    colAggregate: "الكيان",
    colStatus: "الحالة",
    colAttempts: "المحاولات",
    colError: "آخر خطأ",
    colActions: "",
    retryBtn: "إعادة المحاولة",
    empty: "لا توجد أحداث مطابقة.",
    prev: "السابق",
    next: "التالي",
    page: (p: number, c: number) => `صفحة ${p} من ${c}`,
    notices: {
      retried: "تمت إعادة جدولة الحدث للتسليم.",
      invalid: "لا يمكن إعادة محاولة هذا الحدث.",
      forbidden: "لا تملك صلاحية إدارة صندوق الأحداث.",
      failed: "تعذّر تنفيذ الإجراء.",
      csrf: "انتهت صلاحية النموذج الآمن. حدّث الصفحة.",
    },
  },
  en: {
    title: "AutoBox events",
    intro:
      "The transactional event log: every event is written in the same transaction, then delivered reliably. Many events sit as “pending” because they are an internal record with no delivery step — the one to watch is “dead letter”.",
    pending: "Pending",
    processing: "Processing",
    retry: "Retry",
    delivered: "Delivered",
    deadLetter: "Dead letter",
    stuck: "Waiting > 1h",
    oldest: "Oldest unprocessed",
    minutes: (n: number | null) => (n === null ? "—" : `${n} min`),
    topTypes: "Top types",
    filterStatus: "Status",
    all: "All",
    typePlaceholder: "type prefix, e.g. FILE_ or REQUEST_",
    apply: "Apply",
    clear: "Clear",
    colTime: "Time",
    colType: "Type",
    colAggregate: "Entity",
    colStatus: "Status",
    colAttempts: "Attempts",
    colError: "Last error",
    colActions: "",
    retryBtn: "Retry",
    empty: "No matching events.",
    prev: "Previous",
    next: "Next",
    page: (p: number, c: number) => `Page ${p} of ${c}`,
    notices: {
      retried: "The event was re-queued for delivery.",
      invalid: "That event cannot be retried.",
      forbidden: "You do not have permission to manage the event box.",
      failed: "The action could not be completed.",
      csrf: "The security form expired. Refresh the page.",
    },
  },
} as const;

function statusTone(status: string): string {
  switch (status) {
    case "DELIVERED":
      return "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]";
    case "DEAD_LETTER":
      return "bg-[var(--itq-color-danger-50)] text-[var(--itq-color-danger-800)]";
    case "RETRY":
    case "PROCESSING":
      return "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-900)]";
    default:
      return "bg-[var(--itq-color-surface-soft)] text-[var(--itq-color-ink-soft)]";
  }
}

function buildHref(
  base: string,
  params: { status?: string; type?: string; page?: number },
): string {
  const search = new URLSearchParams();
  if (params.status !== undefined) search.set("status", params.status);
  if (params.type !== undefined && params.type.length > 0) search.set("type", params.type);
  if (params.page !== undefined && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query.length === 0 ? base : `${base}?${query}`;
}

export function OutboxMonitor({
  activeStatus,
  csrfToken,
  displayName,
  locale,
  notice,
  report,
  typePrefix,
}: OutboxMonitorProps): JSX.Element {
  const text = copy[locale];
  const base = `/${locale}/admin/monitoring/autobox`;
  const { stats } = report;
  const noticeMessage =
    notice === undefined ? undefined : text.notices[notice as keyof typeof text.notices];

  const chipBase =
    "inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-black transition";
  const chipOn =
    "border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]";
  const chipOff =
    "border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] text-[var(--itq-color-ink-soft)] hover:border-[var(--itq-color-brand-200)]";

  const statCards: readonly { label: string; value: string; tone?: string }[] = [
    { label: text.deadLetter, value: String(stats.deadLetter), tone: statusTone("DEAD_LETTER") },
    { label: text.stuck, value: String(stats.stuck) },
    { label: text.retry, value: String(stats.retry) },
    { label: text.pending, value: String(stats.pending) },
    { label: text.delivered, value: String(stats.delivered) },
    { label: text.oldest, value: text.minutes(stats.oldestUnprocessedMinutes) },
  ];

  return (
    <AdminShell csrfToken={csrfToken} displayName={displayName} locale={locale}>
      <div>
        <div className="border-b border-[var(--itq-color-border)] pb-6">
          <h1 className="text-2xl font-black sm:text-3xl">{text.title}</h1>
          <p className="mt-2 max-w-3xl leading-7 text-[var(--itq-color-muted)]">{text.intro}</p>
        </div>

        {noticeMessage !== undefined ? (
          <p
            className={`mt-5 rounded-xl border px-4 py-3 text-sm font-black ${
              notice === "retried"
                ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]"
                : "border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-950)]"
            }`}
          >
            {noticeMessage}
          </p>
        ) : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((card) => (
            <div
              className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4"
              key={card.label}
            >
              <dd
                className={`inline-flex rounded-lg px-2 py-1 text-xl font-black tabular-nums ${
                  card.tone ?? ""
                }`}
              >
                {card.value}
              </dd>
              <dt className="mt-1.5 text-xs font-bold text-[var(--itq-color-muted)]">
                {card.label}
              </dt>
            </div>
          ))}
        </dl>

        {report.topTypes.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-black text-[var(--itq-color-muted)]">{text.topTypes}:</span>
            {report.topTypes.map((entry) => (
              <Link
                className="rounded-full border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2.5 py-1 font-bold text-[var(--itq-color-ink-soft)] hover:border-[var(--itq-color-brand-200)]"
                href={buildHref(base, { type: entry.type })}
                key={entry.type}
              >
                <bdi dir="ltr">{entry.type}</bdi> · {entry.count}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-[var(--itq-color-muted)]">
              {text.filterStatus}:
            </span>
            <Link
              className={`${chipBase} ${activeStatus === undefined ? chipOn : chipOff}`}
              href={buildHref(base, { type: typePrefix })}
            >
              {text.all}
            </Link>
            {STATUSES.map((status) => (
              <Link
                className={`${chipBase} ${activeStatus === status ? chipOn : chipOff}`}
                href={buildHref(base, { status, type: typePrefix })}
                key={status}
              >
                {status === "PENDING"
                  ? text.pending
                  : status === "PROCESSING"
                    ? text.processing
                    : status === "RETRY"
                      ? text.retry
                      : status === "DELIVERED"
                        ? text.delivered
                        : text.deadLetter}
              </Link>
            ))}
          </div>
          <form action={base} className="flex items-center gap-2" method="get">
            {activeStatus !== undefined ? (
              <input name="status" type="hidden" value={activeStatus} />
            ) : null}
            <input
              className="min-h-9 w-72 rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-3 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
              defaultValue={typePrefix}
              name="type"
              placeholder={text.typePlaceholder}
              type="search"
            />
            <button
              className="min-h-9 rounded-xl bg-[var(--itq-color-brand-700)] px-4 text-xs font-black text-white"
              type="submit"
            >
              {text.apply}
            </button>
          </form>
          {activeStatus !== undefined || typePrefix.length > 0 ? (
            <Link
              className="text-xs font-black text-[var(--itq-color-brand-strong)] underline-offset-4 hover:underline"
              href={base}
            >
              {text.clear}
            </Link>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--itq-color-border)]">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--itq-color-surface-soft)] text-start text-xs font-black text-[var(--itq-color-muted)]">
                <th className="px-4 py-3 text-start">{text.colTime}</th>
                <th className="px-4 py-3 text-start">{text.colType}</th>
                <th className="px-4 py-3 text-start">{text.colAggregate}</th>
                <th className="px-4 py-3 text-start">{text.colStatus}</th>
                <th className="px-4 py-3 text-start">{text.colAttempts}</th>
                <th className="px-4 py-3 text-start">{text.colError}</th>
                <th className="px-4 py-3 text-start" />
              </tr>
            </thead>
            <tbody>
              {report.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-[var(--itq-color-muted)]" colSpan={7}>
                    {text.empty}
                  </td>
                </tr>
              ) : (
                report.items.map((item) => {
                  const retryable = item.status === "DEAD_LETTER" || item.status === "RETRY";
                  return (
                    <tr
                      className="border-t border-[var(--itq-color-border)] align-top"
                      key={item.id}
                    >
                      <td className="px-4 py-3 text-[var(--itq-color-muted)]">
                        <LocalDateTime locale={locale} value={item.createdAt.toISOString()} />
                      </td>
                      <td className="px-4 py-3 font-bold">
                        <bdi dir="ltr">{item.eventType}</bdi>
                      </td>
                      <td className="px-4 py-3 text-[var(--itq-color-muted)]">
                        <bdi dir="ltr">{item.aggregateType}</bdi>
                        {item.aggregateId !== undefined ? (
                          <span className="mt-0.5 block text-[10px]">
                            <bdi dir="ltr">{item.aggregateId.slice(0, 8)}</bdi>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-black ${statusTone(
                            item.status,
                          )}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{item.attemptCount}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3 text-[var(--itq-color-danger-700)]">
                        {item.lastErrorCode ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {retryable ? (
                          <form
                            action={`/api/admin/monitoring/autobox/${item.id}/retry`}
                            method="post"
                          >
                            <CsrfInput token={csrfToken} />
                            <input name="locale" type="hidden" value={locale} />
                            <button
                              className="rounded-lg border border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)] px-2.5 py-1 text-[11px] font-black text-[var(--itq-color-brand-strong)] hover:bg-[var(--itq-color-brand-100)]"
                              type="submit"
                            >
                              {text.retryBtn}
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
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
                  ...(activeStatus === undefined ? {} : { status: activeStatus }),
                  type: typePrefix,
                  page: report.page - 1,
                })}
              >
                {text.prev}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-[var(--itq-color-muted)]">
              {text.page(report.page, report.pageCount)}
            </span>
            {report.page < report.pageCount ? (
              <Link
                className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 hover:bg-[var(--itq-color-surface-soft)]"
                href={buildHref(base, {
                  ...(activeStatus === undefined ? {} : { status: activeStatus }),
                  type: typePrefix,
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
    </AdminShell>
  );
}
