import Link from "next/link";

import { AuthShell, CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";

interface ForgotPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}
const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

export const metadata = { title: "استعادة كلمة المرور" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: ForgotPageProps) {
  const [token, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AuthShell
      description="سنرد بالرسالة نفسها سواء وُجد الحساب أم لا لحماية خصوصية المستخدمين."
      title="استعادة كلمة المرور"
    >
      {status === "sent" ? (
        <FormAlert tone="success">
          إذا كان البريد مرتبطاً بحساب مؤهّل، أرسلنا تعليمات الاستعادة.
        </FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      {status === "failed" ? <FormAlert>خدمة البريد غير متاحة الآن. حاول لاحقاً.</FormAlert> : null}
      <form action="/api/auth/forgot-password" className="grid gap-5" method="post">
        <CsrfInput token={token} />
        <div>
          <label className="text-sm font-bold" htmlFor="email">
            البريد الإلكتروني
          </label>
          <input
            autoComplete="email"
            className={inputClassName}
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
        <SubmitButton className="w-full" pendingLabel="جارٍ الإرسال…">
          إرسال تعليمات الاستعادة
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link
          className="font-bold text-[var(--itq-color-brand-700)] underline"
          href="/ar/auth/login"
        >
          العودة لتسجيل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}
