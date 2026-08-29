import Link from "next/link";

import type { PendingPhoneVerification, PhonePasswordResetRequest } from "@itqanak/auth";

import { CsrfInput } from "./auth-shell";
import { FormErrorSummary } from "./form-error-summary";
import { LocalDateTime } from "./local-date-time";
import { SubmitButton } from "./submit-button";
import { VerifiedIcon, WhatsAppIcon } from "./icons";

export type ApprovalsTab = "phone" | "reset";

interface ApprovalsWorkspaceProps {
  readonly locale: "ar" | "en";
  readonly csrfToken: string | undefined;
  readonly tab: ApprovalsTab;
  readonly notice?: string;
  readonly phoneVerifications: readonly PendingPhoneVerification[];
  readonly passwordResets: readonly PhonePasswordResetRequest[];
}

const inputClass =
  "mt-2 h-12 w-full rounded-xl border border-[var(--itq-color-border)] px-4 aria-[invalid]:border-[var(--itq-color-danger-600)]";
const areaClass = "mt-2 min-h-20 w-full rounded-xl border border-[var(--itq-color-border)] p-4";
const attestationClass =
  "flex items-start gap-3 rounded-xl bg-[var(--itq-color-warning-50)] p-4 text-xs font-bold leading-6 text-[var(--itq-color-warning-950)]";

const countryLabels: Record<"ar" | "en", Record<string, string>> = {
  ar: { SA: "السعودية", AE: "الإمارات", KW: "الكويت" },
  en: { SA: "Saudi Arabia", AE: "UAE", KW: "Kuwait" },
};

function IdentityPanel({
  displayName,
  phoneE164,
  meta,
  waLabel,
}: Readonly<{
  displayName: string;
  phoneE164: string;
  meta: readonly string[];
  waLabel: string;
}>) {
  return (
    <div className="rounded-2xl bg-[var(--itq-color-ink-deep)] p-5 text-white">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-xl font-black">
        {displayName.slice(0, 1)}
      </span>
      <h3 className="mt-4 text-xl font-black">{displayName}</h3>
      <bdi className="mt-2 block font-black text-[var(--itq-color-accent-200)]" dir="ltr">
        {phoneE164}
      </bdi>
      <div className="mt-3 grid gap-1 text-xs text-white/65">
        {meta.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <a
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--itq-color-whatsapp-600)] px-4 text-sm font-black"
        href={`https://wa.me/${phoneE164.replace("+", "")}`}
        rel="noreferrer noopener"
        target="_blank"
      >
        <WhatsAppIcon className="size-5" /> {waLabel}
      </a>
    </div>
  );
}

export function ApprovalsWorkspace({
  locale,
  csrfToken,
  tab,
  notice,
  phoneVerifications,
  passwordResets,
}: ApprovalsWorkspaceProps) {
  const english = locale === "en";
  const t = (ar: string, en: string): string => (english ? en : ar);
  const countries = countryLabels[locale];

  const tabs: readonly { key: ApprovalsTab; label: string; count: number }[] = [
    {
      key: "phone",
      label: t("توثيق أرقام واتساب", "WhatsApp number verification"),
      count: phoneVerifications.length,
    },
    {
      key: "reset",
      label: t("استعادة كلمة المرور", "Password recovery"),
      count: passwordResets.length,
    },
  ];

  const notices: Record<string, { tone: "ok" | "warn" | "error"; text: string }> = {
    verified: {
      tone: "ok",
      text: t(
        "تم توثيق الرقم وتفعيل الحساب مع حفظ سجل التدقيق.",
        "The number is verified, the account is active, and the audit record is saved.",
      ),
    },
    rejected: {
      tone: "ok",
      text: t(
        "تم رفض الطلب وحفظ سجل التدقيق.",
        "The request was rejected and the audit record saved.",
      ),
    },
    expired: {
      tone: "warn",
      text: t(
        "انتهت صلاحية المرجع. اطلب من الطالب إنشاء مرجع جديد.",
        "The reference expired. Ask the student to create a new one.",
      ),
    },
    invalid: {
      tone: "error",
      text: t("راجع الحقول ثم أعد المحاولة.", "Review the fields and try again."),
    },
    failed: {
      tone: "error",
      text: t(
        "تعذر حفظ الإجراء. تحقق من البيانات وحدّث الصفحة.",
        "The action could not be saved. Check the details and refresh.",
      ),
    },
  };
  const activeNotice = notice === undefined ? undefined : notices[notice];

  return (
    <div className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-8">
      <div>
        <p className="text-sm font-black text-[var(--itq-color-brand-strong)]">
          {t("أمان الحسابات", "Account security")}
        </p>
        <h1 className="mt-1 text-3xl font-black">{t("الاعتمادات", "Approvals")}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--itq-color-muted)]">
          {t(
            "راجع كل طلب مقابل رسالة واتساب من الرقم المسجل نفسه، ثم سجّل مرجعًا قابلًا للتدقيق قبل الاعتماد.",
            "Check each request against a WhatsApp message from the same registered number, then record an auditable reference before approving.",
          )}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        {tabs.map((entry) => {
          const active = entry.key === tab;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${
                active
                  ? "bg-[var(--itq-color-brand-700)] text-white"
                  : "bg-[var(--itq-color-surface-soft)] text-[var(--itq-color-muted)] hover:text-[var(--itq-color-ink)]"
              }`}
              href={`/${locale}/admin/approvals?tab=${entry.key}`}
              key={entry.key}
            >
              {entry.label}
              <span
                className={`grid min-w-5 place-items-center rounded-full px-1 text-xs tabular-nums ${
                  active ? "bg-white/20" : "bg-[var(--itq-color-surface)]"
                }`}
              >
                {entry.count}
              </span>
            </Link>
          );
        })}
      </div>

      {activeNotice ? (
        activeNotice.tone === "error" ? (
          <div className="mt-6">
            <FormErrorSummary>{activeNotice.text}</FormErrorSummary>
          </div>
        ) : (
          <p
            className={`mt-6 rounded-xl border p-4 font-bold ${
              activeNotice.tone === "ok"
                ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]"
                : "border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-950)]"
            }`}
            role="status"
          >
            {activeNotice.text}
          </p>
        )
      ) : null}

      {tab === "phone" ? (
        <div className="mt-7 grid gap-5">
          {phoneVerifications.length === 0 ? (
            <div className="grid place-items-center rounded-3xl bg-[var(--itq-color-surface-soft)] py-20 text-center">
              <VerifiedIcon className="size-12 text-[var(--itq-color-success-700)]" />
              <h2 className="mt-4 text-xl font-black">
                {t("لا توجد حسابات معلقة", "No pending accounts")}
              </h2>
              <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                {t("تمت مراجعة جميع الطلبات الحالية.", "Every current request has been reviewed.")}
              </p>
            </div>
          ) : (
            phoneVerifications.map((item) => (
              <article
                className="grid gap-6 rounded-3xl border border-[var(--itq-color-border)] p-5 lg:grid-cols-[minmax(15rem,.7fr)_minmax(0,1.3fr)]"
                key={item.userId}
              >
                <IdentityPanel
                  displayName={item.displayName}
                  meta={[countries[item.countryCode] ?? item.countryCode]}
                  phoneE164={item.phoneE164}
                  waLabel={t("فتح محادثة الرقم", "Open the number's chat")}
                />
                <form
                  action={`/api/admin/verifications/${encodeURIComponent(item.userId)}/confirm`}
                  className="grid content-start gap-4"
                  method="post"
                >
                  <CsrfInput token={csrfToken} />
                  <input name="locale" type="hidden" value={locale} />
                  <p className="text-xs text-[var(--itq-color-muted)]">
                    {t("طُلب في", "Requested")}{" "}
                    <LocalDateTime value={item.requestedAt.toISOString()} />
                  </p>
                  <div>
                    <label className="text-sm font-black" htmlFor={`reference-${item.userId}`}>
                      {t("مرجع محادثة واتساب", "WhatsApp conversation reference")} *
                    </label>
                    <input
                      className={inputClass}
                      id={`reference-${item.userId}`}
                      maxLength={160}
                      minLength={3}
                      name="reference"
                      placeholder="WA-2026-08-12-1425"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-black" htmlFor={`note-${item.userId}`}>
                      {t("ملاحظة المراجعة", "Review note")}
                    </label>
                    <textarea
                      className={areaClass}
                      id={`note-${item.userId}`}
                      maxLength={1000}
                      name="note"
                      placeholder={t(
                        "وصلت الرسالة من الرقم نفسه وتمت مطابقة الاسم…",
                        "The message arrived from the same number and the name matched…",
                      )}
                    />
                  </div>
                  <label className={attestationClass}>
                    <input
                      className="mt-1"
                      name="confirmedSameNumber"
                      required
                      type="checkbox"
                      value="true"
                    />
                    {t(
                      "أقر أن الرسالة وصلت من الرقم المعروض نفسه وأنني تحققت منه قبل التفعيل.",
                      "I confirm the message arrived from the number shown and that I verified it before activation.",
                    )}
                  </label>
                  <SubmitButton className="w-fit" pendingLabel={t("جارٍ التوثيق…", "Verifying…")}>
                    {t("تأكيد الرقم وتفعيل الحساب", "Confirm the number and activate the account")}
                  </SubmitButton>
                </form>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="mt-7 grid gap-5">
          {passwordResets.length === 0 ? (
            <div className="rounded-3xl bg-[var(--itq-color-surface-soft)] py-20 text-center">
              <h2 className="text-xl font-black">
                {t("لا توجد طلبات معلقة", "No pending requests")}
              </h2>
              <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                {t(
                  "ستظهر هنا الطلبات التي لم تنته صلاحيتها.",
                  "Requests that have not expired will appear here.",
                )}
              </p>
            </div>
          ) : (
            passwordResets.map((item) => (
              <article
                className="grid gap-6 rounded-3xl border border-[var(--itq-color-border)] p-5 xl:grid-cols-[18rem_minmax(0,1fr)]"
                key={item.id}
              >
                <IdentityPanel
                  displayName={item.displayName}
                  meta={[countries[item.countryCode] ?? item.countryCode]}
                  phoneE164={item.phoneE164}
                  waLabel={t("فتح محادثة واتساب", "Open WhatsApp chat")}
                />
                <div>
                  <p className="text-xs text-[var(--itq-color-muted)]">
                    {t("طُلب في", "Requested")}{" "}
                    <LocalDateTime value={item.requestedAt.toISOString()} /> ·{" "}
                    {t("ينتهي في", "Expires")}{" "}
                    <LocalDateTime value={item.expiresAt.toISOString()} />
                  </p>
                  <div className="mt-3 rounded-2xl border border-dashed border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)] p-5 text-center">
                    <p className="text-xs font-black text-[var(--itq-color-muted)]">
                      {t("المرجع الذي يجب أن يرسله الطالب", "The reference the student must send")}
                    </p>
                    <bdi
                      className="mt-2 block font-mono text-2xl font-black tracking-wider"
                      dir="ltr"
                    >
                      {item.publicReference}
                    </bdi>
                  </div>
                  <form
                    action={`/api/admin/password-resets/${encodeURIComponent(item.id)}/issue`}
                    className="mt-5 grid gap-4"
                    method="post"
                  >
                    <CsrfInput token={csrfToken} />
                    <input name="locale" type="hidden" value={locale} />
                    <div>
                      <label className="text-sm font-black" htmlFor={`student-ref-${item.id}`}>
                        {t(
                          "أعد كتابة المرجع الذي أرسله الطالب",
                          "Re-type the reference the student sent",
                        )}{" "}
                        *
                      </label>
                      <input
                        autoComplete="off"
                        className={`${inputClass} font-mono uppercase`}
                        id={`student-ref-${item.id}`}
                        maxLength={13}
                        minLength={13}
                        name="studentReference"
                        pattern="PR-[A-Fa-f0-9]{10}"
                        placeholder="PR-XXXXXXXXXX"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-black" htmlFor={`wa-${item.id}`}>
                        {t("مرجع محادثة واتساب", "WhatsApp conversation reference")} *
                      </label>
                      <input
                        className={inputClass}
                        id={`wa-${item.id}`}
                        maxLength={160}
                        minLength={3}
                        name="whatsappReference"
                        placeholder="WA-2026-08-13-1425"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-black" htmlFor={`note-${item.id}`}>
                        {t("ملاحظة اختيارية", "Optional note")}
                      </label>
                      <textarea
                        className={areaClass}
                        id={`note-${item.id}`}
                        maxLength={1000}
                        name="note"
                      />
                    </div>
                    <label className={attestationClass}>
                      <input
                        className="mt-1"
                        name="confirmedSameNumber"
                        required
                        type="checkbox"
                        value="true"
                      />
                      {t(
                        "وصلت الرسالة من الرقم المعروض نفسه.",
                        "The message arrived from the number shown.",
                      )}
                    </label>
                    <label className={attestationClass}>
                      <input
                        className="mt-1"
                        name="confirmedReference"
                        required
                        type="checkbox"
                        value="true"
                      />
                      {t(
                        "ذكر الطالب المرجع المعروض وطابقته حرفياً.",
                        "The student quoted the reference shown and I matched it exactly.",
                      )}
                    </label>
                    <SubmitButton
                      className="w-fit"
                      pendingLabel={t("جارٍ إصدار الرابط…", "Issuing the link…")}
                    >
                      {t("اعتماد وإصدار رابط أحادي", "Approve and issue a one-time link")}
                    </SubmitButton>
                  </form>
                  <details className="mt-5 rounded-2xl border border-[var(--itq-color-danger-100)] p-4">
                    <summary className="cursor-pointer text-sm font-black text-[var(--itq-color-danger-800)]">
                      {t("رفض الطلب", "Reject the request")}
                    </summary>
                    <form
                      action={`/api/admin/password-resets/${encodeURIComponent(item.id)}/reject`}
                      className="mt-4 grid gap-3"
                      method="post"
                    >
                      <CsrfInput token={csrfToken} />
                      <input name="locale" type="hidden" value={locale} />
                      <label className="text-xs font-black" htmlFor={`reason-${item.id}`}>
                        {t("سبب الرفض", "Reason for rejection")}
                      </label>
                      <textarea
                        className="min-h-20 rounded-xl border border-[var(--itq-color-border)] p-3"
                        id={`reason-${item.id}`}
                        maxLength={1000}
                        minLength={3}
                        name="reason"
                        required
                      />
                      <SubmitButton
                        className="w-fit"
                        pendingLabel={t("جارٍ الرفض…", "Rejecting…")}
                        variant="secondary"
                      >
                        {t("رفض وحفظ السبب", "Reject and save the reason")}
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
