import type { PlatformMessagingSettings } from "@itqanak/operations";

import { AdminShell } from "./admin-shell";
import { CsrfInput } from "./auth-shell";
import { LocalDateTime } from "./local-date-time";
import { SubmitButton } from "./submit-button";

export interface WhatsAppNotifyStatus {
  readonly mode: "disabled" | "dry-run" | "enabled";
  readonly phoneNumberConfigured: boolean;
  readonly templateConfigured: boolean;
  readonly tokenConfigured: boolean;
  readonly envRecipientE164?: string;
  readonly resolvedRecipientE164?: string;
  readonly delivered24h: number;
  readonly queued: number;
  readonly deadLetter: number;
  readonly lastDeliveredAt?: Date;
}

interface MessagingAdminProps {
  readonly settings: PlatformMessagingSettings;
  readonly whatsapp: WhatsAppNotifyStatus;
  readonly csrfToken: string | undefined;
  readonly displayName: string;
  readonly locale: "ar" | "en";
  readonly notice?: string;
}

const control =
  "mt-2 min-h-12 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-sm shadow-sm outline-none focus:border-[var(--itq-color-brand-500)]";

const noticeText = {
  ar: {
    contact_saved: "تم حفظ أرقام المراسلة وتسجيل التغيير في سجل التدقيق.",
    announcement_saved: "تم حفظ الإعلان.",
    invalid: "تحقق من صيغة الرقم (‎+9665…) ومن نص الإعلان باللغتين.",
    conflict: "غيّر مدير آخر الإعداد. حدّث الصفحة ثم أعد المحاولة.",
    forbidden: "لا تملك صلاحية تعديل إعدادات المراسلة.",
    csrf: "انتهت صلاحية نموذج الأمان. حدّث الصفحة.",
    unavailable: "تعذر الوصول إلى إعدادات المراسلة حالياً.",
    failed: "تعذر حفظ الإعداد.",
  },
  en: {
    contact_saved: "Messaging numbers saved and the change was written to the audit log.",
    announcement_saved: "Announcement saved.",
    invalid: "Check the phone format (+9665…) and the announcement text in both languages.",
    conflict: "Another administrator changed the setting. Refresh and try again.",
    forbidden: "You do not have permission to edit messaging settings.",
    csrf: "The security form expired. Refresh the page.",
    unavailable: "Messaging settings are currently unavailable.",
    failed: "The setting could not be saved.",
  },
} as const;

export function MessagingAdmin({
  settings,
  whatsapp,
  csrfToken,
  displayName,
  locale,
  notice,
}: MessagingAdminProps) {
  const english = locale === "en";
  const t = noticeText[locale];
  const flash = notice !== undefined && notice in t ? t[notice as keyof typeof t] : undefined;
  const flashOk = notice === "contact_saved" || notice === "announcement_saved";

  const modeLabel = english
    ? { disabled: "Disabled", "dry-run": "Dry run", enabled: "Enabled" }[whatsapp.mode]
    : { disabled: "معطّل", "dry-run": "تجريبي", enabled: "مُفعّل" }[whatsapp.mode];

  const checklist: readonly (readonly [boolean, string])[] = [
    [whatsapp.mode === "enabled", english ? "WHATSAPP_MODE = enabled" : "‏WHATSAPP_MODE = enabled"],
    [
      whatsapp.phoneNumberConfigured,
      english ? "Sender phone number ID set" : "معرّف رقم المُرسِل مضبوط",
    ],
    [
      whatsapp.templateConfigured,
      english ? "Approved template name set" : "اسم القالب المعتمد مضبوط",
    ],
    [whatsapp.tokenConfigured, english ? "Meta access token mounted" : "رمز وصول Meta مُحمّل"],
    [
      whatsapp.resolvedRecipientE164 !== undefined,
      english ? "Recipient number resolved" : "رقم المستلم مُحدّد",
    ],
  ];
  const ready = checklist.every(([ok]) => ok);

  return (
    <AdminShell csrfToken={csrfToken} displayName={displayName} locale={locale}>
      {flash === undefined ? null : (
        <p
          aria-live="polite"
          className={`mb-5 rounded-2xl border p-4 text-sm font-bold ${
            flashOk
              ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]"
              : "border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-950)]"
          }`}
        >
          {flash}
        </p>
      )}

      <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-7">
        <p className="text-sm font-black text-[var(--itq-color-brand-strong)]">
          {english ? "Messaging & alerts" : "المراسلة والتنبيهات"}
        </p>
        <h1 className="mt-1 text-3xl font-black">
          {english ? "Support numbers & broadcast" : "أرقام الدعم والإعلانات"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--itq-color-muted)]">
          {english
            ? "Edit the WhatsApp number students contact and the number the platform notifies when a new account or request needs review. A broadcast announcement shows to every signed-in user."
            : "عدّل رقم واتساب الذي يتواصل معه الطلاب، والرقم الذي تُرسل إليه المنصة تنبيهاً عند تسجيل حساب جديد أو وصول طلب للمراجعة. ويظهر الإعلان لكل مستخدم مسجّل الدخول."}
        </p>
      </section>

      <section className="mt-6 rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black">
            {english ? "WhatsApp notification status" : "حالة إشعارات واتساب"}
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${
              ready
                ? "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-800)]"
                : "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-900)]"
            }`}
          >
            {ready
              ? english
                ? "Delivering"
                : "يعمل"
              : english
                ? `Not sending — mode: ${modeLabel}`
                : `لا يُرسل — الوضع: ${modeLabel}`}
          </span>
        </div>
        <ul className="mt-4 grid gap-2 text-sm">
          {checklist.map(([ok, label]) => (
            <li className="flex items-center gap-2" key={label}>
              <span
                aria-hidden
                className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-black text-white ${
                  ok ? "bg-[var(--itq-color-success-600)]" : "bg-[var(--itq-color-warning-600)]"
                }`}
              >
                {ok ? "✓" : "!"}
              </span>
              <span dir="auto">{label}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 grid gap-x-6 gap-y-2 text-xs text-[var(--itq-color-muted)] sm:grid-cols-2">
          <div>
            <dt className="inline font-bold">
              {english ? "Recipient in use: " : "الرقم المستخدم: "}
            </dt>
            <dd className="inline" dir="ltr">
              {whatsapp.resolvedRecipientE164 ?? (english ? "none" : "لا يوجد")}
            </dd>
          </div>
          <div>
            <dt className="inline font-bold">
              {english ? "Delivered (24h): " : "أُرسلت (24 ساعة): "}
            </dt>
            <dd className="inline">{whatsapp.delivered24h}</dd>
          </div>
          <div>
            <dt className="inline font-bold">{english ? "Queued: " : "قيد الإرسال: "}</dt>
            <dd className="inline">{whatsapp.queued}</dd>
          </div>
          <div>
            <dt className="inline font-bold">{english ? "Dead-letter: " : "فشل نهائي: "}</dt>
            <dd className="inline">{whatsapp.deadLetter}</dd>
          </div>
          {whatsapp.lastDeliveredAt === undefined ? null : (
            <div>
              <dt className="inline font-bold">{english ? "Last delivered: " : "آخر إرسال: "}</dt>
              <dd className="inline">
                <LocalDateTime locale={locale} value={whatsapp.lastDeliveredAt.toISOString()} />
              </dd>
            </div>
          )}
        </dl>
        {ready ? null : (
          <p className="mt-4 rounded-xl bg-[var(--itq-color-surface-soft)] p-3 text-xs leading-6">
            {english
              ? "To activate: mount a Meta system-user token, set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TEMPLATE_NAME to your approved template, set WHATSAPP_MODE=enabled and WHATSAPP_NOTIFICATIONS_NOT_BEFORE to now, then recreate the worker. The recipient below overrides WHATSAPP_SUPPORT_RECIPIENT_E164."
              : "للتفعيل: حمّل رمز مستخدم نظام من Meta، واضبط WHATSAPP_PHONE_NUMBER_ID و WHATSAPP_TEMPLATE_NAME على قالبك المعتمد، واجعل WHATSAPP_MODE=enabled و WHATSAPP_NOTIFICATIONS_NOT_BEFORE الآن، ثم أعد إنشاء عامل الخلفية. ويتجاوز الرقم أدناه قيمة WHATSAPP_SUPPORT_RECIPIENT_E164."}
          </p>
        )}
      </section>

      <form
        action="/api/admin/messaging/contact"
        className="mt-6 rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-7"
        method="post"
      >
        <CsrfInput token={csrfToken} />
        <input name="locale" type="hidden" value={locale} />
        <input name="version" type="hidden" value={settings.version} />
        <h2 className="text-lg font-black">{english ? "Numbers" : "الأرقام"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-black">
            {english ? "Support WhatsApp number" : "رقم واتساب الدعم"}
            <input
              className={control}
              defaultValue={settings.supportWhatsAppE164 ?? ""}
              dir="ltr"
              inputMode="tel"
              name="supportWhatsAppE164"
              placeholder="+9665XXXXXXXX"
            />
            <span className="mt-1 block text-xs font-semibold text-[var(--itq-color-muted)]">
              {english
                ? "Shown to students. Leave blank to use the deployed value."
                : "يظهر للطلاب. اتركه فارغاً لاستخدام قيمة النشر."}
            </span>
          </label>
          <label className="text-sm font-black">
            {english ? "Notification recipient number" : "رقم استقبال التنبيهات"}
            <input
              className={control}
              defaultValue={settings.whatsappNotifyRecipientE164 ?? ""}
              dir="ltr"
              inputMode="tel"
              name="whatsappNotifyRecipientE164"
              placeholder="+9665XXXXXXXX"
            />
            <span className="mt-1 block text-xs font-semibold text-[var(--itq-color-muted)]">
              {english
                ? "Receives new-account and request-review alerts. Blank = deployed value."
                : "يستقبل تنبيهات الحسابات الجديدة والطلبات للمراجعة. الفراغ = قيمة النشر."}
            </span>
          </label>
        </div>
        <SubmitButton className="mt-5" pendingLabel={english ? "Saving…" : "جارٍ الحفظ…"}>
          {english ? "Save numbers" : "حفظ الأرقام"}
        </SubmitButton>
      </form>

      <form
        action="/api/admin/messaging/announcement"
        className="mt-6 rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-7"
        method="post"
      >
        <CsrfInput token={csrfToken} />
        <input name="locale" type="hidden" value={locale} />
        <input name="version" type="hidden" value={settings.version} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black">{english ? "Broadcast announcement" : "إعلان عام"}</h2>
          {settings.announcementActive ? (
            <span className="rounded-full bg-[var(--itq-color-success-50)] px-3 py-1 text-xs font-black text-[var(--itq-color-success-800)]">
              {english ? "Live now" : "معروض الآن"}
            </span>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4">
          <label className="text-sm font-black">
            {english ? "Arabic text" : "النص بالعربية"}
            <textarea
              className={control}
              defaultValue={settings.announcementAr ?? ""}
              dir="rtl"
              maxLength={600}
              name="announcementAr"
              rows={2}
            />
          </label>
          <label className="text-sm font-black">
            {english ? "English text" : "النص بالإنجليزية"}
            <textarea
              className={control}
              defaultValue={settings.announcementEn ?? ""}
              dir="ltr"
              maxLength={600}
              name="announcementEn"
              rows={2}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-black">
              {english ? "Severity" : "الأهمية"}
              <select className={control} defaultValue={settings.announcementLevel} name="level">
                <option value="INFO">{english ? "Info" : "معلومة"}</option>
                <option value="WARNING">{english ? "Warning" : "تنبيه"}</option>
                <option value="CRITICAL">
                  {english ? "Critical (not dismissible)" : "حرج (لا يُخفى)"}
                </option>
              </select>
            </label>
            <label className="flex items-end gap-2 text-sm font-black">
              <input
                className="size-5"
                defaultChecked={settings.announcementActive}
                name="active"
                type="checkbox"
                value="true"
              />
              {english ? "Show the announcement now" : "عرض الإعلان الآن"}
            </label>
          </div>
        </div>
        <SubmitButton className="mt-5" pendingLabel={english ? "Saving…" : "جارٍ الحفظ…"}>
          {english ? "Save announcement" : "حفظ الإعلان"}
        </SubmitButton>
        {settings.announcementPublishedAt === undefined ? null : (
          <p className="mt-3 text-xs text-[var(--itq-color-muted)]">
            {english ? "Published " : "نُشر "}
            <LocalDateTime locale={locale} value={settings.announcementPublishedAt.toISOString()} />
          </p>
        )}
      </form>
    </AdminShell>
  );
}
