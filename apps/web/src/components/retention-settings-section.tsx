import type { PlatformRetentionState } from "@itqanak/operations";

import { CsrfInput } from "./auth-shell";
import { LocalDateTime } from "./local-date-time";
import { SubmitButton } from "./submit-button";

interface RetentionSettingsSectionProps {
  readonly retention: PlatformRetentionState;
  readonly csrfToken: string | undefined;
  readonly locale: "ar" | "en";
  readonly notice?: string;
}

const copy = {
  ar: {
    eyebrow: "الاحتفاظ بالبيانات",
    title: "احتفاظ رسائل المحادثات",
    description:
      "بعد المدة المحددة، يُنقل نص الرسائل والكاردات القديمة من الجدول الرئيسي إلى أرشيف منفصل، وتظهر في الشات «تمت أرشفة هذه الرسالة». الطلبات والمالية لا تتأثر — محفوظة دائمًا.",
    stateLabel: "حالة الأرشفة",
    on: "مفعّلة",
    off: "غير مفعّلة",
    enableLabel: "تفعيل أرشفة الرسائل تلقائيًا",
    daysLabel: "مدة الاحتفاظ (بالأيام)",
    daysHint: "بين ٧ و٣٦٥٠ يومًا. الموصى به: ٣٠.",
    filesTitle: "احتفاظ ملفات المحادثات",
    filesDescription:
      "الملف يبقى على السيرفر حتى ينزّله المستقبِل، ثم يُحذف كائنه بعد مدة قصيرة (يبقى اسمه في الشات). الملف الذي لم يُنزَّل أبدًا يُحذف بعد المدة الطويلة. إيصالات الدفع لا تُحذف أبدًا.",
    undownloadedLabel: "حذف الملف غير المنزَّل بعد (أيام)",
    downloadedLabel: "حذف الملف بعد تنزيله بـ (أيام)",
    filesHint: "بين ١ و٣٦٥٠ يومًا. الموصى به: ٣٠ للملف غير المنزَّل، و١ بعد التنزيل.",
    confirm:
      "أفهم أن التفعيل يزيل نص الرسائل الأقدم من المدة من الجدول الرئيسي (تبقى نسخة في الأرشيف) وأن ذلك تدريجي وغير قابل للتراجع التلقائي.",
    save: "حفظ سياسة الاحتفاظ",
    saving: "يُحفظ…",
    version: "إصدار الإعداد",
    updated: "آخر تحديث",
    notices: {
      updated: "تم حفظ سياسة الاحتفاظ وتسجيل التغيير في سجل التدقيق.",
      invalid: "راجع القيم وأكّد الإجراء الحسّاس عند التفعيل.",
      conflict: "غيّر مسؤول آخر الإعداد. حدّث الصفحة ثم أعد المحاولة.",
      csrf: "انتهت صلاحية النموذج الآمن. حدّث الصفحة ثم أعد المحاولة.",
      forbidden: "لا تملك صلاحية تغيير سياسة الاحتفاظ.",
      unavailable: "إعداد الاحتفاظ غير متاح حاليًا.",
      failed: "تعذّر حفظ سياسة الاحتفاظ.",
    },
  },
  en: {
    eyebrow: "Data retention",
    title: "Conversation message retention",
    description:
      "After the set window, the text of old messages and cards is moved out of the hot table into a separate archive, and the chat shows “this message was archived”. Requests and finance are unaffected — kept permanently.",
    stateLabel: "Archival state",
    on: "Enabled",
    off: "Disabled",
    enableLabel: "Automatically archive old messages",
    daysLabel: "Retention window (days)",
    daysHint: "Between 7 and 3650. Recommended: 30.",
    filesTitle: "Conversation file retention",
    filesDescription:
      "A file stays on the server until the recipient downloads it, then its object is purged after a short window (the name stays in the chat). A file that is never downloaded is purged after the long window. Payment receipts are never purged.",
    undownloadedLabel: "Purge an undownloaded file after (days)",
    downloadedLabel: "Purge a file this many days after download",
    filesHint: "Between 1 and 3650. Recommended: 30 undownloaded, 1 after download.",
    confirm:
      "I understand that enabling this removes the text of messages older than the window from the hot table (a copy stays in the archive), that it applies progressively, and that it does not auto-reverse.",
    save: "Save retention policy",
    saving: "Saving…",
    version: "Settings version",
    updated: "Last updated",
    notices: {
      updated: "The retention policy was saved and the change was audit logged.",
      invalid: "Review the values and confirm the critical action when enabling.",
      conflict: "Another administrator changed the setting. Refresh and try again.",
      csrf: "The security form expired. Refresh and try again.",
      forbidden: "You do not have permission to change the retention policy.",
      unavailable: "The retention setting is currently unavailable.",
      failed: "The retention policy could not be saved.",
    },
  },
} as const;

export function RetentionSettingsSection({
  csrfToken,
  locale,
  notice,
  retention,
}: RetentionSettingsSectionProps) {
  const text = copy[locale];
  const noticeMessage =
    notice === undefined ? undefined : text.notices[notice as keyof typeof text.notices];
  return (
    <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 shadow-[var(--itq-shadow-sm)] sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--itq-color-brand-strong)]">
        {text.eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black">{text.title}</h2>
      <p className="mt-3 max-w-3xl leading-8 text-[var(--itq-color-muted)]">{text.description}</p>

      <dl className="mt-5 flex flex-wrap gap-3 text-sm">
        <div className="rounded-xl bg-[var(--itq-color-surface-soft)] px-4 py-2">
          <dt className="text-[var(--itq-color-muted)]">{text.stateLabel}</dt>
          <dd className="mt-0.5 font-black">
            {retention.messageArchivalEnabled ? text.on : text.off}
          </dd>
        </div>
        <div className="rounded-xl bg-[var(--itq-color-surface-soft)] px-4 py-2">
          <dt className="text-[var(--itq-color-muted)]">{text.updated}</dt>
          <dd className="mt-0.5 font-black">
            <LocalDateTime locale={locale} value={retention.updatedAt.toISOString()} />
          </dd>
        </div>
        <div className="rounded-xl bg-[var(--itq-color-surface-soft)] px-4 py-2">
          <dt className="text-[var(--itq-color-muted)]">{text.version}</dt>
          <dd className="mt-0.5 font-black">#{retention.version}</dd>
        </div>
      </dl>

      {noticeMessage !== undefined ? (
        <p
          aria-live="polite"
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
            notice === "updated"
              ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]"
              : "border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-950)]"
          }`}
          role="status"
        >
          {noticeMessage}
        </p>
      ) : null}

      <form action="/api/admin/retention" className="mt-5 grid gap-4" method="post">
        <CsrfInput token={csrfToken} />
        <input name="locale" type="hidden" value={locale} />
        <input name="expectedVersion" type="hidden" value={retention.version} />

        <label className="flex cursor-pointer items-start gap-3 text-sm font-black leading-7">
          <input
            className="mt-1 size-5 shrink-0 accent-[var(--itq-color-brand-700)]"
            defaultChecked={retention.messageArchivalEnabled}
            name="messageArchivalEnabled"
            type="checkbox"
            value="true"
          />
          <span>{text.enableLabel}</span>
        </label>

        <label className="text-sm font-black">
          {text.daysLabel}
          <input
            className="mt-2 block w-40 rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-3.5 py-2 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
            defaultValue={retention.messageRetentionDays}
            inputMode="numeric"
            max={3650}
            min={7}
            name="messageRetentionDays"
            type="number"
          />
          <span className="mt-1 block text-xs font-semibold text-[var(--itq-color-muted)]">
            {text.daysHint}
          </span>
        </label>

        <fieldset className="rounded-2xl border border-[var(--itq-color-border)] p-4">
          <legend className="px-1 text-sm font-black">{text.filesTitle}</legend>
          <p className="text-xs leading-6 text-[var(--itq-color-muted)]">{text.filesDescription}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="text-sm font-black">
              {text.undownloadedLabel}
              <input
                className="mt-2 block w-40 rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-3.5 py-2 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
                defaultValue={retention.attachmentUndownloadedRetentionDays}
                inputMode="numeric"
                max={3650}
                min={1}
                name="attachmentUndownloadedRetentionDays"
                type="number"
              />
            </label>
            <label className="text-sm font-black">
              {text.downloadedLabel}
              <input
                className="mt-2 block w-40 rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-3.5 py-2 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
                defaultValue={retention.attachmentDownloadedRetentionDays}
                inputMode="numeric"
                max={3650}
                min={1}
                name="attachmentDownloadedRetentionDays"
                type="number"
              />
            </label>
          </div>
          <span className="mt-2 block text-xs font-semibold text-[var(--itq-color-muted)]">
            {text.filesHint}
          </span>
        </fieldset>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-4 text-sm font-black leading-7 text-[var(--itq-color-warning-950)]">
          <input
            className="mt-1 size-5 shrink-0 accent-[var(--itq-color-brand-700)]"
            name="confirmCriticalAction"
            type="checkbox"
            value="true"
          />
          <span>{text.confirm}</span>
        </label>

        <SubmitButton className="w-full sm:w-auto" pendingLabel={text.saving}>
          {text.save}
        </SubmitButton>
      </form>
    </section>
  );
}
