import { hasAdminAccess } from "@itqanak/auth";

import { AccountShell } from "@/components/account-shell";
import { CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requirePagePrincipal } from "@/lib/account-page";

interface SecurityPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}
const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm";

export const metadata = { title: "أمان الحساب" };
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage({ searchParams }: SecurityPageProps) {
  const principal = await requirePagePrincipal("/ar/account/security");
  const [csrfToken, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AccountShell
      surface={hasAdminAccess(principal) ? "admin" : "student"}
      csrfToken={csrfToken}
      displayName={principal.displayName}
    >
      <h1 className="text-3xl font-black">كلمة المرور والأمان</h1>
      <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
        عند تغيير كلمة المرور نلغي الجلسات السابقة وننشئ جلسة جديدة لهذا المتصفح.
      </p>
      {status === "password_changed" ? (
        <FormAlert tone="success">تم تغيير كلمة المرور وإلغاء الجلسات السابقة.</FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "failed" || status === "invalid" ? (
        <FormAlert>
          تعذر تغيير كلمة المرور. تأكد من كلمة المرور الحالية والسياسة المطلوبة.
        </FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      <form
        action="/api/account/change-password"
        className="mt-8 grid max-w-lg gap-5"
        method="post"
      >
        <CsrfInput token={csrfToken} />
        <div>
          <label className="text-sm font-bold" htmlFor="currentPassword">
            كلمة المرور الحالية
          </label>
          <input
            autoComplete="current-password"
            className={inputClassName}
            id="currentPassword"
            name="currentPassword"
            required
            type="password"
          />
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="newPassword">
            كلمة المرور الجديدة
          </label>
          <input
            aria-describedby="new-password-help"
            autoComplete="new-password"
            className={inputClassName}
            id="newPassword"
            maxLength={128}
            minLength={12}
            name="newPassword"
            required
            type="password"
          />
          <p className="mt-2 text-xs text-[var(--itq-color-muted)]" id="new-password-help">
            12 حرفاً على الأقل؛ لا يمكن إعادة استخدام كلمة المرور الحالية.
          </p>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="passwordConfirmation">
            تأكيد كلمة المرور الجديدة
          </label>
          <input
            autoComplete="new-password"
            className={inputClassName}
            id="passwordConfirmation"
            maxLength={128}
            minLength={12}
            name="passwordConfirmation"
            required
            type="password"
          />
        </div>
        <SubmitButton pendingLabel="جارٍ التغيير…">تغيير كلمة المرور</SubmitButton>
      </form>
      <p className="mt-6 max-w-lg rounded-xl bg-[var(--itq-color-surface-soft)] p-4 text-sm font-semibold leading-7">
        لا تتذكر كلمة المرور الحالية؟{" "}
        <Link
          className="font-black text-[var(--itq-color-brand-700)] underline"
          href="/ar/auth/forgot-password"
        >
          أنشئ طلب استعادة عبر الدعم
        </Link>
        . سيتحقق المدير من رقم واتساب المسجل ثم تختار كلمة المرور بنفسك.
      </p>
    </AccountShell>
  );
}
import Link from "next/link";
