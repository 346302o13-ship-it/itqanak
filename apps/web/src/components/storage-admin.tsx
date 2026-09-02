import Link from "next/link";
import type { JSX } from "react";

import type { RetentionSweepPreview, StorageAdminReport } from "@itqanak/requests";

import { AdminShell } from "./admin-shell";
import { ConfirmSubmitButton } from "./confirm-submit-button";
import { CsrfInput } from "./auth-shell";
import { LocalDateTime } from "./local-date-time";

type StorageStatusFilter = "STORED" | "EXPIRED" | "PENDING_DELETION";

interface StorageAdminProps {
  readonly locale: "ar" | "en";
  readonly displayName: string;
  readonly report: StorageAdminReport;
  readonly preview: RetentionSweepPreview;
  readonly csrfToken: string | undefined;
  readonly activeStatus: StorageStatusFilter | undefined;
  readonly search: string;
  readonly notice: string | undefined;
}

const STATUS_FILTERS: readonly StorageStatusFilter[] = ["STORED", "PENDING_DELETION", "EXPIRED"];

const copy = {
  ar: {
    title: "إدارة تخزين ملفات المحادثات",
    intro:
      "كل ملفات المحادثات وحالتها ومواعيد حذفها. إيصالات الدفع محميّة ولا تُحذف أبدًا. الطلبات والمالية غير معنيّة هنا.",
    statTotal: "إجمالي الملفات",
    statSize: "الحجم الإجمالي",
    statStored: "مخزَّنة الآن",
    statPending: "بانتظار الحذف",
    statExpired: "محذوفة (انتهت)",
    statReceipts: "إيصالات محميّة",
    selfHosted: "التخزين ذاتي الاستضافة (MinIO) — لا تكلفة سحابية شهرية.",
    previewTitle: "معاينة ما سيُحذف في الكنس القادم",
    previewMsg: (n: number, enabled: boolean, days: number) =>
      enabled
        ? `${n} رسالة أقدم من ${days} يومًا ستُؤرشَف`
        : `${n} رسالة تتجاوز ${days} يومًا (الأرشفة غير مفعّلة — لن تُحذف)`,
    previewAtt: (n: number) => `${n} ملف سيُحذف كائنه (يبقى اسمه في الشات)`,
    previewSample: "أمثلة:",
    filterStatus: "الحالة",
    all: "الكل",
    searchPlaceholder: "اسم ملف أو طالب أو رقم طلب",
    searchButton: "بحث",
    clear: "مسح",
    colFile: "الملف",
    colRequest: "الطلب",
    colStudent: "الطالب",
    colUploader: "رفعه",
    colSize: "الحجم",
    colUploaded: "الرفع",
    colDownloaded: "آخر تنزيل / العدد",
    colStatus: "الحالة",
    colDeleteAfter: "يُحذف بعد",
    colActions: "إجراءات",
    never: "—",
    receipt: "إيصال — محمي",
    extend: "تمديد ٣٠ يومًا",
    purge: "حذف الآن",
    backup: "نسخة احتياطية",
    purgeTitle: "حذف كائن الملف الآن؟",
    purgeBody:
      "سيُحذف الملف من التخزين فورًا ويظهر «انتهت الصلاحية» في الشات (يبقى اسمه). لا يمكن التراجع. الإيصالات لا تُحذف.",
    purgeConfirm: "نعم، احذف الآن",
    cancel: "إلغاء",
    empty: "لا توجد ملفات مطابقة.",
    prev: "السابق",
    next: "التالي",
    page: (p: number, c: number) => `صفحة ${p} من ${c}`,
    notices: {
      extended: "تم تمديد مدة الاحتفاظ بالملف.",
      purged: "تم حذف كائن الملف.",
      invalid: "تعذّر تنفيذ الإجراء على هذا الملف.",
      conflict: "تغيّرت حالة الملف. حدّث الصفحة ثم أعد المحاولة.",
      forbidden: "لا تملك صلاحية إدارة التخزين.",
      not_found: "الملف غير موجود.",
      failed: "تعذّر تنفيذ الإجراء.",
      csrf: "انتهت صلاحية النموذج الآمن. حدّث الصفحة.",
    },
  },
  en: {
    title: "Conversation file storage",
    intro:
      "Every conversation file, its state and its purge time. Payment receipts are protected and never purged. Requests and finance are out of scope here.",
    statTotal: "Total files",
    statSize: "Total size",
    statStored: "Stored now",
    statPending: "Pending deletion",
    statExpired: "Purged (expired)",
    statReceipts: "Protected receipts",
    selfHosted: "Self-hosted storage (MinIO) — no monthly cloud cost.",
    previewTitle: "Preview of the next sweep",
    previewMsg: (n: number, enabled: boolean, days: number) =>
      enabled
        ? `${n} messages older than ${days}d will be archived`
        : `${n} messages exceed ${days}d (archival disabled — nothing removed)`,
    previewAtt: (n: number) => `${n} files will have their object purged (name stays in chat)`,
    previewSample: "Examples:",
    filterStatus: "Status",
    all: "All",
    searchPlaceholder: "file name, student, or request number",
    searchButton: "Search",
    clear: "Clear",
    colFile: "File",
    colRequest: "Request",
    colStudent: "Student",
    colUploader: "Uploaded by",
    colSize: "Size",
    colUploaded: "Uploaded",
    colDownloaded: "Last download / count",
    colStatus: "Status",
    colDeleteAfter: "Purge after",
    colActions: "Actions",
    never: "—",
    receipt: "Receipt — protected",
    extend: "Extend 30 days",
    purge: "Purge now",
    backup: "Backup copy",
    purgeTitle: "Purge the file object now?",
    purgeBody:
      "The file is removed from storage immediately and the chat shows “expired” (the name stays). This cannot be undone. Receipts are never purged.",
    purgeConfirm: "Yes, purge now",
    cancel: "Cancel",
    empty: "No matching files.",
    prev: "Previous",
    next: "Next",
    page: (p: number, c: number) => `Page ${p} of ${c}`,
    notices: {
      extended: "The file retention was extended.",
      purged: "The file object was purged.",
      invalid: "That action could not be applied to this file.",
      conflict: "The file state changed. Refresh and try again.",
      forbidden: "You do not have permission to manage storage.",
      not_found: "The file was not found.",
      failed: "The action could not be completed.",
      csrf: "The security form expired. Refresh the page.",
    },
  },
} as const;

function formatBytes(bytes: number, locale: "ar" | "en"): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  }).format(value)} ${units[unit]}`;
}

function statusLabel(status: string, deleteAfter: Date | undefined, locale: "ar" | "en"): string {
  const english = locale === "en";
  if (status === "EXPIRED") return english ? "Expired" : "انتهت الصلاحية";
  if (status === "STORED" && deleteAfter !== undefined && deleteAfter.getTime() > Date.now()) {
    return english ? "Pending deletion" : "بانتظار الحذف";
  }
  if (status === "STORED") return english ? "Stored" : "مخزَّن";
  if (status === "DELETE_PENDING" || status === "DELETED") {
    return english ? "Removed" : "محذوف";
  }
  return status;
}

function buildHref(base: string, params: { status?: string; q?: string; page?: number }): string {
  const search = new URLSearchParams();
  if (params.status !== undefined) search.set("status", params.status);
  if (params.q !== undefined && params.q.length > 0) search.set("q", params.q);
  if (params.page !== undefined && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query.length === 0 ? base : `${base}?${query}`;
}

export function StorageAdmin({
  activeStatus,
  csrfToken,
  displayName,
  locale,
  notice,
  preview,
  report,
  search,
}: StorageAdminProps): JSX.Element {
  const text = copy[locale];
  const base = `/${locale}/admin/storage`;
  const { stats } = report;
  const noticeMessage =
    notice === undefined ? undefined : text.notices[notice as keyof typeof text.notices];

  const statCards: readonly { label: string; value: string }[] = [
    { label: text.statTotal, value: String(stats.totalFiles) },
    { label: text.statSize, value: formatBytes(stats.totalBytes, locale) },
    { label: text.statStored, value: String(stats.storedFiles) },
    { label: text.statPending, value: String(stats.pendingDeletionFiles) },
    { label: text.statExpired, value: String(stats.expiredFiles) },
    { label: text.statReceipts, value: String(stats.receiptFiles) },
  ];

  const chipBase =
    "inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-black transition";
  const chipOn =
    "border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]";
  const chipOff =
    "border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] text-[var(--itq-color-ink-soft)] hover:border-[var(--itq-color-brand-200)]";

  return (
    <AdminShell csrfToken={csrfToken} displayName={displayName} locale={locale}>
      <div>
        <div className="border-b border-[var(--itq-color-border)] pb-6">
          <h1 className="text-2xl font-black sm:text-3xl">{text.title}</h1>
          <p className="mt-2 max-w-3xl leading-7 text-[var(--itq-color-muted)]">{text.intro}</p>
          <p className="mt-1 text-xs font-bold text-[var(--itq-color-muted)]">{text.selfHosted}</p>
        </div>

        {noticeMessage !== undefined ? (
          <p
            className={`mt-5 rounded-xl border px-4 py-3 text-sm font-black ${
              notice === "extended" || notice === "purged"
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
              <dd className="text-xl font-black tabular-nums">{card.value}</dd>
              <dt className="mt-1 text-xs font-bold text-[var(--itq-color-muted)]">{card.label}</dt>
            </div>
          ))}
        </dl>

        <section className="mt-6 rounded-2xl border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-5 text-[var(--itq-color-warning-950)]">
          <h2 className="text-sm font-black">{text.previewTitle}</h2>
          <ul className="mt-2 grid gap-1 text-sm font-bold">
            <li>
              {text.previewMsg(
                preview.messagesEligible,
                preview.messageArchivalEnabled,
                preview.messageRetentionDays,
              )}
            </li>
            <li>{text.previewAtt(preview.attachmentsEligible)}</li>
          </ul>
          {preview.attachmentSampleFilenames.length > 0 ? (
            <p className="mt-2 text-xs font-semibold">
              {text.previewSample}{" "}
              <bdi dir="auto">{preview.attachmentSampleFilenames.join("، ")}</bdi>
            </p>
          ) : null}
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-[var(--itq-color-muted)]">
              {text.filterStatus}:
            </span>
            <Link
              className={`${chipBase} ${activeStatus === undefined ? chipOn : chipOff}`}
              href={buildHref(base, { q: search })}
            >
              {text.all}
            </Link>
            {STATUS_FILTERS.map((status) => (
              <Link
                className={`${chipBase} ${activeStatus === status ? chipOn : chipOff}`}
                href={buildHref(base, { status, q: search })}
                key={status}
              >
                {status === "STORED"
                  ? text.statStored
                  : status === "PENDING_DELETION"
                    ? text.statPending
                    : text.statExpired}
              </Link>
            ))}
          </div>
          <form action={base} className="flex items-center gap-2" method="get">
            {activeStatus !== undefined ? (
              <input name="status" type="hidden" value={activeStatus} />
            ) : null}
            <input
              className="min-h-9 w-64 rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-3 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
              defaultValue={search}
              name="q"
              placeholder={text.searchPlaceholder}
              type="search"
            />
            <button
              className="min-h-9 rounded-xl bg-[var(--itq-color-brand-700)] px-4 text-xs font-black text-white"
              type="submit"
            >
              {text.searchButton}
            </button>
          </form>
          {activeStatus !== undefined || search.length > 0 ? (
            <Link
              className="text-xs font-black text-[var(--itq-color-brand-strong)] underline-offset-4 hover:underline"
              href={base}
            >
              {text.clear}
            </Link>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--itq-color-border)]">
          <table className="w-full min-w-[68rem] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--itq-color-surface-soft)] text-start text-xs font-black text-[var(--itq-color-muted)]">
                <th className="px-4 py-3 text-start">{text.colFile}</th>
                <th className="px-4 py-3 text-start">{text.colRequest}</th>
                <th className="px-4 py-3 text-start">{text.colStudent}</th>
                <th className="px-4 py-3 text-start">{text.colUploader}</th>
                <th className="px-4 py-3 text-start">{text.colSize}</th>
                <th className="px-4 py-3 text-start">{text.colUploaded}</th>
                <th className="px-4 py-3 text-start">{text.colDownloaded}</th>
                <th className="px-4 py-3 text-start">{text.colStatus}</th>
                <th className="px-4 py-3 text-start">{text.colDeleteAfter}</th>
                <th className="px-4 py-3 text-start">{text.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {report.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-[var(--itq-color-muted)]" colSpan={10}>
                    {text.empty}
                  </td>
                </tr>
              ) : (
                report.items.map((item) => {
                  const acting = item.storageStatus === "STORED" && !item.isReceipt;
                  return (
                    <tr
                      className="border-t border-[var(--itq-color-border)] align-top"
                      key={item.id}
                    >
                      <td className="max-w-[16rem] px-4 py-3">
                        <bdi className="block truncate font-bold" dir="auto">
                          {item.originalFilename}
                        </bdi>
                        {item.isReceipt ? (
                          <span className="mt-0.5 block text-[10px] font-black text-[var(--itq-color-success-800)]">
                            {text.receipt}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {item.requestNumber !== undefined ? (
                          <Link
                            className="font-black text-[var(--itq-color-brand-strong)]"
                            href={`/${locale}/admin/support?q=${encodeURIComponent(item.requestNumber)}`}
                          >
                            <bdi dir="ltr">{item.requestNumber}</bdi>
                          </Link>
                        ) : (
                          text.never
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold" dir="auto">
                        {item.studentDisplayName}
                      </td>
                      <td className="px-4 py-3 text-[var(--itq-color-muted)]" dir="auto">
                        {item.uploaderDisplayName}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatBytes(item.sizeBytes, locale)}
                      </td>
                      <td className="px-4 py-3 text-[var(--itq-color-muted)]">
                        <LocalDateTime locale={locale} value={item.createdAt.toISOString()} />
                      </td>
                      <td className="px-4 py-3 text-[var(--itq-color-muted)] tabular-nums">
                        {item.lastDownloadedAt !== undefined ? (
                          <LocalDateTime
                            locale={locale}
                            value={item.lastDownloadedAt.toISOString()}
                          />
                        ) : (
                          text.never
                        )}
                        {" · "}
                        {item.downloadCount}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {statusLabel(item.storageStatus, item.deleteAfter, locale)}
                      </td>
                      <td className="px-4 py-3 text-[var(--itq-color-muted)]">
                        {item.deleteAfter !== undefined ? (
                          <LocalDateTime locale={locale} value={item.deleteAfter.toISOString()} />
                        ) : (
                          text.never
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {acting ? (
                          <div className="flex flex-wrap gap-1.5">
                            <form action={`/api/admin/storage/${item.id}/extend`} method="post">
                              <CsrfInput token={csrfToken} />
                              <input name="locale" type="hidden" value={locale} />
                              <input name="days" type="hidden" value="30" />
                              <button
                                className="rounded-lg border border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)] px-2.5 py-1 text-[11px] font-black text-[var(--itq-color-brand-strong)] hover:bg-[var(--itq-color-brand-100)]"
                                type="submit"
                              >
                                {text.extend}
                              </button>
                            </form>
                            <a
                              className="rounded-lg border border-[var(--itq-color-border)] px-2.5 py-1 text-[11px] font-black text-[var(--itq-color-ink-soft)] hover:bg-[var(--itq-color-surface-soft)]"
                              href={`/api/admin/storage/${item.id}/download`}
                            >
                              {text.backup}
                            </a>
                            <form action={`/api/admin/storage/${item.id}/purge`} method="post">
                              <CsrfInput token={csrfToken} />
                              <input name="locale" type="hidden" value={locale} />
                              <ConfirmSubmitButton
                                body={text.purgeBody}
                                cancelLabel={text.cancel}
                                confirmLabel={text.purgeConfirm}
                                locale={locale}
                                title={text.purgeTitle}
                              >
                                {text.purge}
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--itq-color-muted)]">
                            {text.never}
                          </span>
                        )}
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
                  q: search,
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
                  q: search,
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
