import Link from "next/link";

import { AuthShell, CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage, loadWebConfig } from "@/lib/auth-runtime";

interface RegisterPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}

function fieldClassName(): string {
  return "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";
}

export const metadata = { title: "إنشاء حساب" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const [token, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const { termsVersion, privacyVersion } = loadWebConfig().auth;
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AuthShell
      description="أنشئ حساب طالب. لا تُمنح صلاحيات الحساب حتى تأكيد البريد الإلكتروني."
      title="إنشاء حساب جديد"
    >
      {status === "csrf" ? (
        <FormAlert>انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "failed" ? (
        <FormAlert>تعذر إتمام التسجيل. راجع البيانات والموافقات ثم أعد المحاولة.</FormAlert>
      ) : null}
      <form action="/api/auth/register" className="grid gap-5" method="post">
        <CsrfInput token={token} />
        <input name="termsVersion" type="hidden" value={termsVersion} />
        <input name="privacyVersion" type="hidden" value={privacyVersion} />
        <div>
          <label className="text-sm font-bold" htmlFor="displayName">
            الاسم
          </label>
          <input
            autoComplete="name"
            className={fieldClassName()}
            id="displayName"
            maxLength={120}
            minLength={2}
            name="displayName"
            required
          />
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="email">
            البريد الإلكتروني
          </label>
          <input
            autoComplete="email"
            className={fieldClassName()}
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="password">
            كلمة المرور
          </label>
          <input
            aria-describedby="password-help"
            autoComplete="new-password"
            className={fieldClassName()}
            id="password"
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]" id="password-help">
            12 حرفاً على الأقل، وحتى 128 حرفاً. يمكنك استخدام عبارة مرور طويلة.
          </p>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="passwordConfirmation">
            تأكيد كلمة المرور
          </label>
          <input
            autoComplete="new-password"
            className={fieldClassName()}
            id="passwordConfirmation"
            maxLength={128}
            minLength={12}
            name="passwordConfirmation"
            required
            type="password"
          />
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-[var(--itq-color-border)] p-4 text-sm leading-6">
          <input className="mt-1 size-4" name="acceptedTerms" required type="checkbox" />
          <span>أوافق على شروط الاستخدام، إصدار {termsVersion}.</span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-[var(--itq-color-border)] p-4 text-sm leading-6">
          <input className="mt-1 size-4" name="acceptedPrivacy" required type="checkbox" />
          <span>أوافق على سياسة الخصوصية، إصدار {privacyVersion}.</span>
        </label>
        <SubmitButton className="w-full" pendingLabel="جارٍ إنشاء الحساب…">
          إنشاء الحساب
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--itq-color-muted)]">
        لديك حساب؟{" "}
        <Link
          className="font-bold text-[var(--itq-color-brand-700)] underline"
          href="/ar/auth/login"
        >
          سجّل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}
