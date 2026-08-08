import Link from "next/link";

import { AuthShell, CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { safeNext } from "@/lib/auth-responses";

interface LoginPageProps {
  readonly searchParams: Promise<{
    readonly next?: string | string[];
    readonly status?: string | string[];
  }>;
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

export const metadata = { title: "تسجيل الدخول" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [token, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;
  const next = safeNext(typeof query.next === "string" ? query.next : undefined);
  return (
    <AuthShell
      description="استخدم بيانات حسابك الموثّق. لا نحفظ الجلسة في المتصفح إلا داخل Cookie آمنة."
      title="تسجيل الدخول"
    >
      {status === "account_created" ? (
        <FormAlert tone="success">
          إذا كان البريد جديداً، أرسلنا رابط التأكيد. افتح بريدك ثم سجّل الدخول.
        </FormAlert>
      ) : null}
      {status === "verified" ? (
        <FormAlert tone="success">تم تأكيد البريد الإلكتروني. يمكنك تسجيل الدخول الآن.</FormAlert>
      ) : null}
      {status === "password_reset" ? (
        <FormAlert tone="success">
          تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.
        </FormAlert>
      ) : null}
      {status === "logged_out" ? (
        <FormAlert tone="success">تم تسجيل الخروج بأمان.</FormAlert>
      ) : null}
      {status === "unverified" ? (
        <FormAlert>
          تم التحقق من بيانات الدخول، لكن يلزم تأكيد البريد أولاً.{" "}
          <Link className="underline" href="/ar/auth/resend-verification">
            أعد إرسال الرابط
          </Link>
        </FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      {status === "failed" || status === "invalid" ? (
        <FormAlert>البريد الإلكتروني أو كلمة المرور غير صحيحة.</FormAlert>
      ) : null}
      <form action="/api/auth/login" className="grid gap-5" method="post">
        <CsrfInput token={token} />
        <input name="next" type="hidden" value={next} />
        <div>
          <label className="text-sm font-bold" htmlFor="email">
            البريد الإلكتروني
          </label>
          <input
            autoComplete="email"
            className={fieldClassName}
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-bold" htmlFor="password">
              كلمة المرور
            </label>
            <Link
              className="text-xs font-bold text-[var(--itq-color-brand-700)] underline"
              href="/ar/auth/forgot-password"
            >
              نسيت كلمة المرور؟
            </Link>
          </div>
          <input
            autoComplete="current-password"
            className={fieldClassName}
            id="password"
            name="password"
            required
            type="password"
          />
        </div>
        <SubmitButton className="w-full" pendingLabel="جارٍ التحقق…">
          تسجيل الدخول
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--itq-color-muted)]">
        ليس لديك حساب؟{" "}
        <Link
          className="font-bold text-[var(--itq-color-brand-700)] underline"
          href="/ar/auth/register"
        >
          أنشئ حساباً
        </Link>
      </p>
    </AuthShell>
  );
}
