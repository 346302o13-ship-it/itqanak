import type { PlatformOperationalState } from "@itqanak/operations";
import type { FileScannerReadiness } from "@itqanak/storage";

import { AdminShell } from "./admin-shell";
import { CsrfInput } from "./auth-shell";
import { LocalDateTime } from "./local-date-time";
import { SubmitButton } from "./submit-button";

interface OperationsAdminProps {
  readonly state: PlatformOperationalState;
  readonly scannerReadiness: FileScannerReadiness;
  readonly csrfToken: string | undefined;
  readonly displayName: string;
  readonly locale: "ar" | "en";
  readonly notice?: string;
}

const copyByLocale = {
  ar: {
    eyebrow: "ضوابط تشغيل آمنة",
    title: "التشغيل والصيانة",
    description:
      "تحكم في رسالة الصيانة وطابور فحص الملفات من دون منح تطبيق الويب وصولاً إلى Docker أو صلاحيات النظام.",
    maintenanceTitle: "وضع الصيانة للزائر",
    maintenanceDescription:
      "يعرض صفحة ثنائية اللغة بحالة 503 للصفحات العامة. تظل بوابة الإدارة وفحوصات الصحة متاحة.",
    maintenanceState: "حالة وضع الصيانة",
    maintenanceOn: "مفعّل",
    maintenanceOff: "غير مفعّل",
    messageAr: "رسالة الصيانة بالعربية",
    messageEn: "رسالة الصيانة بالإنجليزية",
    scannerTitle: "طابور فحص الملفات",
    scannerDescription:
      "الفحص مغلق افتراضياً لتوفير موارد الخادم. عند تشغيله يبدأ ClamAV ويفحص الملفات الجديدة فقط؛ وتبقى الملفات المرفوعة أثناء الإيقاف موسومة كغير مفحوصة.",
    queueState: "فحص الملفات الجديدة",
    queueRunning: "مفعّل",
    queuePaused: "معطّل",
    daemonState: "جاهزية محرك ClamAV",
    scannerHealthy: "متصل وجاهز",
    scannerUnavailable: "غير متاح",
    scannerDisabled: "معطّل للتطوير فقط",
    scannerDesiredOff: "معطّل بقرار الإدارة",
    scannerPaused: "متوقف وفق الضابط التشغيلي",
    observedState: "حالة المضيف المسجلة",
    observedStates: {
      UNKNOWN: "غير معروفة",
      STARTING: "قيد التشغيل",
      RUNNING: "يعمل",
      STOPPED: "متوقف وتحررت ذاكرته",
      ERROR: "تعذر التوفيق",
    },
    safetyTitle: "سياسة الملفات عند الإيقاف",
    safetyBody:
      "تُخزّن الملفات بشكل خاص وتُرسل بحالة «غير مفحوص» مع تنزيل إجباري وتحذير دائم. لا تُعاين الصور أو المستندات غير المفحوصة داخل المنصة؛ ويُسمح بتشغيل الصوت فقط عبر مسار مصادق وأنواع صوت محددة. لا يُعاد فحص الملفات القديمة تلقائياً.",
    confirmation:
      "أؤكد أنني راجعت أثر تفعيل الصيانة أو إيقاف طابور الفحص، وأنني سأتابع الحالة حتى الاستئناف.",
    save: "حفظ ضوابط التشغيل",
    saving: "جارٍ الحفظ…",
    lastUpdated: "آخر تحديث",
    version: "نسخة الإعداد",
    notices: {
      updated: "تم حفظ ضوابط التشغيل وتسجيل التغيير في سجل التدقيق.",
      invalid: "راجع الرسائل والحالات وحدد التأكيد عند تفعيل تحكم حرج.",
      conflict: "غيّر مدير آخر الإعدادات. حدّث الصفحة ثم أعد المحاولة.",
      csrf: "انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.",
      forbidden: "لا تملك صلاحية تعديل ضوابط التشغيل.",
      unavailable: "تعذر الوصول إلى إعدادات التشغيل حالياً.",
      failed: "تعذر حفظ ضوابط التشغيل.",
    },
  },
  en: {
    eyebrow: "Safe operational controls",
    title: "Operations & maintenance",
    description:
      "Manage the visitor maintenance notice and file-scanning queue without granting Web access to Docker or host privileges.",
    maintenanceTitle: "Visitor maintenance mode",
    maintenanceDescription:
      "Serves a bilingual 503 page for public pages. The admin portal and health checks remain available.",
    maintenanceState: "Maintenance state",
    maintenanceOn: "Enabled",
    maintenanceOff: "Disabled",
    messageAr: "Arabic maintenance message",
    messageEn: "English maintenance message",
    scannerTitle: "File scanning queue",
    scannerDescription:
      "Scanning is off by default to conserve server resources. Enabling it starts ClamAV and scans new uploads only; files uploaded while off stay explicitly marked as unscanned.",
    queueState: "Scan new uploads",
    queueRunning: "Enabled",
    queuePaused: "Disabled",
    daemonState: "ClamAV readiness",
    scannerHealthy: "Connected and ready",
    scannerUnavailable: "Unavailable",
    scannerDisabled: "Development-only disabled mode",
    scannerDesiredOff: "Disabled by administrator",
    scannerPaused: "Stopped by operational control",
    observedState: "Recorded host state",
    observedStates: {
      UNKNOWN: "Unknown",
      STARTING: "Starting",
      RUNNING: "Running",
      STOPPED: "Stopped; memory released",
      ERROR: "Reconciliation failed",
    },
    safetyTitle: "File policy while disabled",
    safetyBody:
      "Files remain in private storage and are delivered with a persistent unscanned warning and forced download. Unscanned images and documents have no inline preview; only strict allowlisted audio may play through an authenticated endpoint. Existing files are not rescanned automatically.",
    confirmation:
      "I confirm that I reviewed the impact of maintenance mode or a scan-queue pause and will monitor it through resumption.",
    save: "Save operational controls",
    saving: "Saving…",
    lastUpdated: "Last updated",
    version: "Settings version",
    notices: {
      updated: "Operational controls were saved and the change was audit logged.",
      invalid: "Review the messages and states, and confirm any active critical control.",
      conflict: "Another administrator changed the settings. Refresh and try again.",
      csrf: "The security form expired. Refresh and try again.",
      forbidden: "You do not have permission to change operational controls.",
      unavailable: "Operational settings are currently unavailable.",
      failed: "The operational controls could not be saved.",
    },
  },
} as const;

const fieldClass =
  "mt-2 min-h-12 w-full rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-3.5 py-2 text-sm outline-none transition focus:border-[var(--itq-color-brand-500)] focus:ring-4 focus:ring-[var(--itq-color-brand-100)]";

export function OperationsAdmin({
  state,
  scannerReadiness,
  csrfToken,
  displayName,
  locale,
  notice,
}: OperationsAdminProps) {
  const copy = copyByLocale[locale];
  const scannerLabel =
    scannerReadiness === "healthy"
      ? copy.scannerHealthy
      : scannerReadiness === "unavailable"
        ? copy.scannerUnavailable
        : scannerReadiness === "paused-stopped"
          ? copy.scannerPaused
          : scannerReadiness === "disabled-by-admin"
            ? copy.scannerDesiredOff
            : copy.scannerDisabled;
  const noticeMessage =
    notice === undefined ? undefined : copy.notices[notice as keyof typeof copy.notices];
  return (
    <AdminShell csrfToken={csrfToken} displayName={displayName} locale={locale}>
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-[2rem] bg-[var(--itq-color-ink-deep)] p-7 text-white shadow-xl sm:p-9">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--itq-color-accent-300)]">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{copy.title}</h1>
          <p className="mt-4 max-w-3xl leading-8 text-white/75">{copy.description}</p>
          <dl className="mt-7 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-white/10 p-4">
              <dt className="text-white/65">{copy.lastUpdated}</dt>
              <dd className="mt-1 font-black">
                <LocalDateTime locale={locale} value={state.updatedAt.toISOString()} />
              </dd>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <dt className="text-white/65">{copy.version}</dt>
              <dd className="mt-1 font-black">#{state.version}</dd>
            </div>
          </dl>
        </section>

        {noticeMessage !== undefined ? (
          <p
            aria-live="polite"
            className={`rounded-2xl border px-5 py-4 text-sm font-bold ${notice === "updated" ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]" : "border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-950)]"}`}
            role="status"
          >
            {noticeMessage}
          </p>
        ) : null}

        <form action="/api/admin/operations" className="grid gap-6" method="post">
          <CsrfInput token={csrfToken} />
          <input name="locale" type="hidden" value={locale} />
          <input name="version" type="hidden" value={state.version} />

          <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 shadow-[var(--itq-shadow-sm)] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <h2 className="text-xl font-black">{copy.maintenanceTitle}</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
                  {copy.maintenanceDescription}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-black ${state.maintenanceEnabled ? "bg-[var(--itq-color-warning-100)] text-[var(--itq-color-warning-900)]" : "bg-[var(--itq-color-success-100)] text-[var(--itq-color-success-900)]"}`}
              >
                {state.maintenanceEnabled ? copy.maintenanceOn : copy.maintenanceOff}
              </span>
            </div>
            <div className="mt-6 grid gap-5">
              <label className="max-w-md text-sm font-black" htmlFor="maintenance-state">
                {copy.maintenanceState}
                <select
                  className={fieldClass}
                  defaultValue={state.maintenanceEnabled ? "true" : "false"}
                  id="maintenance-state"
                  name="maintenanceEnabled"
                >
                  <option value="false">{copy.maintenanceOff}</option>
                  <option value="true">{copy.maintenanceOn}</option>
                </select>
              </label>
              <div className="grid gap-5 lg:grid-cols-2">
                <label className="text-sm font-black" dir="rtl" htmlFor="maintenance-message-ar">
                  {copy.messageAr}
                  <textarea
                    className={`${fieldClass} min-h-36 resize-y leading-7`}
                    defaultValue={state.maintenanceMessageAr}
                    id="maintenance-message-ar"
                    maxLength={1000}
                    minLength={10}
                    name="maintenanceMessageAr"
                    required
                  />
                </label>
                <label className="text-sm font-black" dir="ltr" htmlFor="maintenance-message-en">
                  {copy.messageEn}
                  <textarea
                    className={`${fieldClass} min-h-36 resize-y leading-7`}
                    defaultValue={state.maintenanceMessageEn}
                    id="maintenance-message-en"
                    maxLength={1000}
                    minLength={10}
                    name="maintenanceMessageEn"
                    required
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 shadow-[var(--itq-shadow-sm)] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <h2 className="text-xl font-black">{copy.scannerTitle}</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
                  {copy.scannerDescription}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-black ${state.fileScanQueuePaused ? "bg-[var(--itq-color-warning-100)] text-[var(--itq-color-warning-900)]" : "bg-[var(--itq-color-success-100)] text-[var(--itq-color-success-900)]"}`}
              >
                {state.fileScanQueuePaused ? copy.queuePaused : copy.queueRunning}
              </span>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="text-sm font-black" htmlFor="scan-queue-state">
                {copy.queueState}
                <select
                  className={fieldClass}
                  defaultValue={state.fileScanQueuePaused ? "true" : "false"}
                  id="scan-queue-state"
                  name="fileScanQueuePaused"
                >
                  <option value="false">{copy.queueRunning}</option>
                  <option value="true">{copy.queuePaused}</option>
                </select>
              </label>
              <div className="grid gap-4 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-4 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-[var(--itq-color-muted)]">
                    {copy.observedState}
                  </p>
                  <p className="mt-2 text-sm font-black">
                    {copy.observedStates[state.fileScannerObservedState]}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[var(--itq-color-muted)]">
                    {copy.daemonState}
                  </p>
                  <p className="mt-2 text-sm font-black">{scannerLabel}</p>
                </div>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-[var(--itq-color-info-200)] bg-[var(--itq-color-info-50)] p-5 text-[var(--itq-color-info-950)]">
              <p className="font-black">{copy.safetyTitle}</p>
              <p className="mt-2 text-sm leading-7">{copy.safetyBody}</p>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-6 sm:p-7">
            <label className="flex cursor-pointer items-start gap-3 text-sm font-black leading-7">
              <input
                className="mt-1 size-5 shrink-0 accent-[var(--itq-color-brand-700)]"
                name="confirmCriticalAction"
                type="checkbox"
                value="true"
              />
              <span>{copy.confirmation}</span>
            </label>
            <SubmitButton className="mt-5 w-full sm:w-auto" pendingLabel={copy.saving}>
              {copy.save}
            </SubmitButton>
          </section>
        </form>
      </div>
    </AdminShell>
  );
}
