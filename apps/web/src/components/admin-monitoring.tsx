import Link from "next/link";

import type { AdminMonitoringSnapshot, MonitoringHealth } from "@/lib/admin-monitoring";
import { requestStatusLabel } from "@/lib/request-presenters";

import { AdminShell } from "./admin-shell";
import {
  ClockIcon,
  MessageIcon,
  OperationsIcon,
  RequestsIcon,
  ShieldCheckIcon,
  WhatsAppIcon,
} from "./icons";
import { LocalDateTime } from "./local-date-time";

interface AdminMonitoringProps {
  readonly csrfToken: string | undefined;
  readonly displayName: string;
  readonly locale: "ar" | "en";
  readonly snapshot: AdminMonitoringSnapshot;
}

const healthTone: Readonly<Record<MonitoringHealth, string>> = {
  HEALTHY: "border-emerald-200 bg-emerald-50 text-emerald-950",
  WARNING: "border-amber-200 bg-amber-50 text-amber-950",
  CRITICAL: "border-red-200 bg-red-50 text-red-950",
  UNKNOWN: "border-slate-200 bg-slate-50 text-slate-800",
};

const copy = {
  ar: {
    eyebrow: "مراقبة تشغيلية آمنة",
    title: "لوحة مراقبة المنصة",
    description:
      "مؤشرات مباشرة من قاعدة البيانات لحالة العامل، قناة Meta، المحادثات والملفات، من دون عرض مفاتيح أو بيانات حساسة.",
    refresh: "تحديث المؤشرات",
    captured: "وقت آخر قراءة",
    health: {
      HEALTHY: "سليم",
      WARNING: "يحتاج متابعة",
      CRITICAL: "خلل",
      UNKNOWN: "لا توجد إشارة حديثة",
    },
    worker: "عامل المهام",
    workerDetail: "نبض العامل المسؤول عن الإشعارات والمهام الخلفية",
    workers: "عامل نشط خلال دقيقتين",
    lastSeen: "آخر نبض",
    noHeartbeat: "لم يُسجل نبض",
    meta: "إشعارات Meta WhatsApp",
    metaDetail: "حسابات وطلبات جديدة إلى رقم الدعم",
    configured: "الإعداد",
    configuredYes: "مهيّأ",
    configuredNo: "غير مكتمل",
    mode: "وضع القناة",
    modeValues: {
      disabled: "متوقفة",
      "dry-run": "محاكاة محلية",
      enabled: "إرسال فعلي إلى Meta",
    },
    recipient: "المستلم",
    delivered: "قبلتها Meta خلال 24 ساعة",
    simulated: "حُوكيت محليًا خلال 24 ساعة",
    deliveryUnavailable: "قبول Meta غير متاح والقناة متوقفة",
    queued: "في الانتظار أو الإعادة",
    dead: "فشلت نهائيًا",
    lastDelivery: "آخر قبول من Meta",
    lastSimulation: "آخر محاكاة محلية",
    noSimulation: "لا توجد محاكاة محلية مسجلة",
    noDelivery: "لا يوجد قبول مسجل من Meta",
    operations: "حالة التشغيل",
    maintenanceOn: "الصيانة مفعلة للزوار",
    maintenanceOff: "المنصة متاحة للزوار",
    scannerPaused: "فحص الملفات مغلق افتراضيًا",
    scannerRunning: "فحص الملفات الجديدة مفعّل",
    observed: "حالة ClamAV المرصودة",
    manage: "فتح ضوابط التشغيل",
    files: "سلامة الملفات",
    stored: "ملف مخزن",
    unscanned: "غير مفحوص بقرار المدير",
    pendingScan: "بانتظار الفحص",
    blocked: "محظور أو فشل فحصه",
    fileWarning:
      "الملفات غير المفحوصة تُسلّم كتنزيل خاص مع تحذير دائم، ولا تُعرض معاينة داخلية للصور والمستندات.",
    activity: "النشاط الآن",
    conversations: "محادثات الطلاب",
    messages: "رسائل خلال 24 ساعة",
    notifications: "إشعارات غير مقروءة",
    stale: "منها أقدم من 24 ساعة",
    quotes: "عروض تنتظر الرد",
    requests: "طلبات نشطة",
    accounts: "حسابات تنتظر الاعتماد",
    outboxPending: "أحداث outbox معلّقة",
    outboxDeadLetter: "أحداث outbox متوقفة",
    outboxOldest: "عمر أقدم حدث معلّق",
    requestDistribution: "توزيع حالات الطلبات",
    noRequests: "لا توجد طلبات حتى الآن.",
    problems: "آخر مشكلات الأتمتة",
    problemDescription: "إعادات المحاولة والأحداث المتوقفة فقط؛ لا تُعرض حمولة الحدث.",
    noProblems: "لا توجد مشكلات أتمتة مسجلة.",
    retry: "إعادة محاولة",
    deadLetter: "متوقف نهائيًا",
    attempts: "المحاولات",
    error: "رمز الخطأ",
  },
  en: {
    eyebrow: "Safe operational monitoring",
    title: "Platform monitoring dashboard",
    description:
      "Live database signals for the worker, Meta channel, conversations and files without exposing keys or sensitive payloads.",
    refresh: "Refresh signals",
    captured: "Last captured",
    health: {
      HEALTHY: "Healthy",
      WARNING: "Needs attention",
      CRITICAL: "Fault",
      UNKNOWN: "No recent signal",
    },
    worker: "Background worker",
    workerDetail: "Heartbeat for notifications and background processing",
    workers: "worker active within two minutes",
    lastSeen: "Last heartbeat",
    noHeartbeat: "No heartbeat recorded",
    meta: "Meta WhatsApp notifications",
    metaDetail: "New accounts and requests sent to the support number",
    configured: "Configuration",
    configuredYes: "Configured",
    configuredNo: "Incomplete",
    mode: "Channel mode",
    modeValues: {
      disabled: "Disabled",
      "dry-run": "Local simulation",
      enabled: "Live Meta delivery",
    },
    recipient: "Recipient",
    delivered: "Accepted by Meta in 24 hours",
    simulated: "Simulated locally in 24 hours",
    deliveryUnavailable: "Meta acceptance unavailable while the channel is disabled",
    queued: "Queued or retrying",
    dead: "Permanently failed",
    lastDelivery: "Last Meta acceptance",
    lastSimulation: "Last local simulation",
    noSimulation: "No local simulation is recorded",
    noDelivery: "No Meta acceptance recorded",
    operations: "Operational state",
    maintenanceOn: "Visitor maintenance is enabled",
    maintenanceOff: "Platform is available to visitors",
    scannerPaused: "File scanning is off by default",
    scannerRunning: "Scanning new files is enabled",
    observed: "Observed ClamAV state",
    manage: "Open operational controls",
    files: "File safety",
    stored: "stored files",
    unscanned: "unscanned by admin policy",
    pendingScan: "awaiting scan",
    blocked: "blocked or scan failed",
    fileWarning:
      "Unscanned files are served as private downloads with a persistent warning; images and documents are never previewed inline.",
    activity: "Current activity",
    conversations: "Student conversations",
    messages: "Messages in 24 hours",
    notifications: "Unread notifications",
    stale: "Older than 24 hours",
    quotes: "Quotes awaiting response",
    requests: "Active requests",
    accounts: "Accounts awaiting approval",
    outboxPending: "Pending outbox events",
    outboxDeadLetter: "Dead-letter outbox events",
    outboxOldest: "Oldest pending event age",
    requestDistribution: "Request status distribution",
    noRequests: "No requests yet.",
    problems: "Recent automation problems",
    problemDescription: "Retries and stopped events only; event payloads are never shown.",
    noProblems: "No automation problems are recorded.",
    retry: "Retrying",
    deadLetter: "Permanently stopped",
    attempts: "Attempts",
    error: "Error code",
  },
} as const;

function HealthBadge({ health, label }: Readonly<{ health: MonitoringHealth; label: string }>) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-black ${healthTone[health]}`}>
      {label}
    </span>
  );
}

function formatAgeSeconds(seconds: number, locale: "ar" | "en"): string {
  if (seconds <= 0) return locale === "ar" ? "لا يوجد" : "None";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const unit = (value: number, ar: string, en: string) =>
    locale === "ar" ? `${value} ${ar}` : `${value}${en}`;
  if (days > 0) return `${unit(days, "ي", "d")} ${unit(hours, "س", "h")}`.trim();
  if (hours > 0) return `${unit(hours, "س", "h")} ${unit(minutes, "د", "m")}`.trim();
  return unit(Math.max(1, minutes), "د", "m");
}

function Metric({ label, value }: Readonly<{ label: string; value: number | string }>) {
  return (
    <div className="rounded-2xl border border-[var(--itq-color-border)] bg-white p-4">
      <strong
        className="block text-2xl font-black"
        dir={typeof value === "string" ? "auto" : undefined}
      >
        {value}
      </strong>
      <span className="mt-1 block text-xs font-bold text-[var(--itq-color-muted)]">{label}</span>
    </div>
  );
}

export function AdminMonitoring({
  csrfToken,
  displayName,
  locale,
  snapshot,
}: AdminMonitoringProps) {
  const t = copy[locale];
  const whatsappMode = snapshot.whatsapp.mode;
  const deliveryMetricLabel =
    whatsappMode === "enabled"
      ? t.delivered
      : whatsappMode === "dry-run"
        ? t.simulated
        : t.deliveryUnavailable;
  const lastDeliveryLabel = whatsappMode === "dry-run" ? t.lastSimulation : t.lastDelivery;
  const noDeliveryLabel = whatsappMode === "dry-run" ? t.noSimulation : t.noDelivery;
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US");
  const path = `/${locale}/admin/monitoring`;
  return (
    <AdminShell csrfToken={csrfToken} displayName={displayName} locale={locale}>
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-[2rem] bg-[var(--itq-color-ink-deep)] p-7 text-white shadow-xl sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                {t.eyebrow}
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{t.title}</h1>
              <p className="mt-4 leading-8 text-white/75">{t.description}</p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-[var(--itq-color-ink-deep)]"
              href={path}
            >
              <ClockIcon className="size-5" /> {t.refresh}
            </Link>
          </div>
          <p className="mt-7 text-sm font-bold text-white/70">
            {t.captured}:{" "}
            <LocalDateTime locale={locale} value={snapshot.capturedAt.toISOString()} />
          </p>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-6 shadow-[var(--itq-shadow-sm)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-800">
                  <OperationsIcon className="size-5" />
                </span>
                <div>
                  <h2 className="text-xl font-black">{t.worker}</h2>
                  <p className="mt-1 text-sm text-[var(--itq-color-muted)]">{t.workerDetail}</p>
                </div>
              </div>
              <HealthBadge
                health={snapshot.worker.health}
                label={t.health[snapshot.worker.health]}
              />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Metric label={t.workers} value={number.format(snapshot.worker.activeCount)} />
              <div className="rounded-2xl border border-[var(--itq-color-border)] bg-white p-4">
                <strong className="block text-sm font-black">{t.lastSeen}</strong>
                <span className="mt-2 block text-xs font-bold text-[var(--itq-color-muted)]">
                  {snapshot.worker.lastSeenAt === undefined ? (
                    t.noHeartbeat
                  ) : (
                    <LocalDateTime
                      locale={locale}
                      value={snapshot.worker.lastSeenAt.toISOString()}
                    />
                  )}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-6 shadow-[var(--itq-shadow-sm)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">
                  <WhatsAppIcon className="size-5" />
                </span>
                <div>
                  <h2 className="text-xl font-black">{t.meta}</h2>
                  <p className="mt-1 text-sm text-[var(--itq-color-muted)]">{t.metaDetail}</p>
                </div>
              </div>
              <HealthBadge
                health={snapshot.whatsapp.health}
                label={t.health[snapshot.whatsapp.health]}
              />
            </div>
            <dl className="mt-5 grid gap-2 rounded-2xl bg-[var(--itq-color-surface-soft)] p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-bold text-[var(--itq-color-muted)]">{t.configured}</dt>
                <dd className="mt-1 font-black">
                  {snapshot.whatsapp.configured ? t.configuredYes : t.configuredNo}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-[var(--itq-color-muted)]">{t.mode}</dt>
                <dd className="mt-1 font-black">{t.modeValues[whatsappMode]}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-[var(--itq-color-muted)]">{t.recipient}</dt>
                <dd className="mt-1 font-black" dir="ltr">
                  {snapshot.whatsapp.recipientMasked ?? "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Metric
                label={deliveryMetricLabel}
                value={number.format(snapshot.whatsapp.delivered24Hours)}
              />
              <Metric label={t.queued} value={number.format(snapshot.whatsapp.queued)} />
              <Metric label={t.dead} value={number.format(snapshot.whatsapp.deadLetter)} />
            </div>
            <p className="mt-4 text-xs font-bold text-[var(--itq-color-muted)]">
              {lastDeliveryLabel}:{" "}
              {snapshot.whatsapp.lastDeliveredAt === undefined ? (
                noDeliveryLabel
              ) : (
                <LocalDateTime
                  locale={locale}
                  value={snapshot.whatsapp.lastDeliveredAt.toISOString()}
                />
              )}
            </p>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-6 shadow-[var(--itq-shadow-sm)]">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-900">
                <ShieldCheckIcon className="size-5" />
              </span>
              <h2 className="pt-2 text-xl font-black">{t.operations}</h2>
            </div>
            <div className="mt-5 grid gap-3">
              <p
                className={`rounded-2xl border p-4 text-sm font-black ${snapshot.platform.maintenanceEnabled ? healthTone.WARNING : healthTone.HEALTHY}`}
              >
                {snapshot.platform.maintenanceEnabled ? t.maintenanceOn : t.maintenanceOff}
              </p>
              <p
                className={`rounded-2xl border p-4 text-sm font-black ${snapshot.platform.fileScanQueuePaused ? healthTone.UNKNOWN : healthTone.HEALTHY}`}
              >
                {snapshot.platform.fileScanQueuePaused ? t.scannerPaused : t.scannerRunning}
              </p>
              <p className="rounded-2xl bg-[var(--itq-color-surface-soft)] p-4 text-sm">
                <span className="font-bold text-[var(--itq-color-muted)]">{t.observed}: </span>
                <bdi className="font-black" dir="ltr">
                  {snapshot.platform.fileScannerObservedState}
                </bdi>
              </p>
            </div>
            <Link
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--itq-color-brand-700)] px-4 text-sm font-black text-white"
              href={`/${locale}/admin/operations`}
            >
              {t.manage}
            </Link>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-6 shadow-[var(--itq-shadow-sm)]">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-800">
                <ShieldCheckIcon className="size-5" />
              </span>
              <h2 className="pt-2 text-xl font-black">{t.files}</h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label={t.stored} value={number.format(snapshot.files.stored)} />
              <Metric
                label={t.unscanned}
                value={number.format(snapshot.files.explicitlyUnscanned)}
              />
              <Metric label={t.pendingScan} value={number.format(snapshot.files.pendingScan)} />
              <Metric label={t.blocked} value={number.format(snapshot.files.blocked)} />
            </div>
            {snapshot.files.explicitlyUnscanned > 0 ? (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-950">
                {t.fileWarning}
              </p>
            ) : null}
          </section>
        </div>

        <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-6 shadow-[var(--itq-shadow-sm)]">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">
              <MessageIcon className="size-5" />
            </span>
            <h2 className="pt-2 text-xl font-black">{t.activity}</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label={t.conversations}
              value={number.format(snapshot.activity.conversations)}
            />
            <Metric label={t.messages} value={number.format(snapshot.activity.messages24Hours)} />
            <Metric
              label={t.notifications}
              value={number.format(snapshot.activity.unreadNotifications)}
            />
            <Metric
              label={t.stale}
              value={number.format(snapshot.activity.staleUnreadNotifications)}
            />
            <Metric label={t.quotes} value={number.format(snapshot.activity.pendingQuotes)} />
            <Metric label={t.requests} value={number.format(snapshot.activity.activeRequests)} />
            <Metric label={t.accounts} value={number.format(snapshot.activity.pendingAccounts)} />
            <Metric
              label={t.outboxPending}
              value={number.format(snapshot.automation.outboxPending)}
            />
            <Metric
              label={t.outboxDeadLetter}
              value={number.format(snapshot.automation.outboxDeadLetter)}
            />
            <Metric
              label={t.outboxOldest}
              value={formatAgeSeconds(snapshot.automation.outboxOldestPendingAgeSeconds, locale)}
            />
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-6 shadow-[var(--itq-shadow-sm)]">
            <div className="flex items-center gap-3">
              <RequestsIcon className="size-5 text-[var(--itq-color-brand-700)]" />
              <h2 className="text-xl font-black">{t.requestDistribution}</h2>
            </div>
            <div className="mt-5 grid gap-2">
              {snapshot.requestStatuses.length === 0 ? (
                <p className="rounded-2xl bg-[var(--itq-color-surface-soft)] p-5 text-sm text-[var(--itq-color-muted)]">
                  {t.noRequests}
                </p>
              ) : (
                snapshot.requestStatuses.map((item) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--itq-color-border)] px-4 py-3"
                    key={item.status}
                  >
                    <span className="text-sm font-black">
                      {requestStatusLabel(item.status, locale)}
                    </span>
                    <strong>{number.format(item.count)}</strong>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-6 shadow-[var(--itq-shadow-sm)]">
            <h2 className="text-xl font-black">{t.problems}</h2>
            <p className="mt-2 text-sm text-[var(--itq-color-muted)]">{t.problemDescription}</p>
            <div className="mt-5 grid gap-3">
              {snapshot.recentAutomationProblems.length === 0 ? (
                <p className="rounded-2xl bg-emerald-50 p-5 text-sm font-bold text-emerald-950">
                  {t.noProblems}
                </p>
              ) : (
                snapshot.recentAutomationProblems.map((problem) => (
                  <article
                    className="rounded-2xl border border-[var(--itq-color-border)] p-4"
                    key={problem.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <bdi className="break-all font-mono text-xs font-bold" dir="ltr">
                        {problem.eventType}
                      </bdi>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${problem.status === "DEAD_LETTER" ? "bg-red-100 text-red-950" : "bg-amber-100 text-amber-950"}`}
                      >
                        {problem.status === "DEAD_LETTER" ? t.deadLetter : t.retry}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--itq-color-muted)]">
                      <span>
                        {t.attempts}: {number.format(problem.attemptCount)}
                      </span>
                      {problem.errorCode === undefined ? null : (
                        <span>
                          {t.error}:{" "}
                          <bdi className="font-mono" dir="ltr">
                            {problem.errorCode}
                          </bdi>
                        </span>
                      )}
                      <LocalDateTime locale={locale} value={problem.createdAt.toISOString()} />
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
