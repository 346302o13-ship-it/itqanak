import Link from "next/link";

import { AuthShell, FormAlert } from "@/components/auth-shell";
import { FragmentTokenForm } from "@/components/fragment-token-form";
import { PasswordField } from "@/components/password-field";
import { csrfTokenForPage } from "@/lib/auth-runtime";

interface ResetPageProps {
  readonly searchParams: Promise<{
    readonly status?: string | string[];
  }>;
}
const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm";

export const dynamic = "force-dynamic";
export const metadata = { title: "تعيين كلمة مرور جديدة", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: ResetPageProps) {
  const [csrfToken, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AuthShell
      description="استخدم كلمة مرور جديدة. ينتهي رابط الاستعادة تلقائياً ولا يعمل إلا مرة واحدة."
      title="تعيين كلمة مرور جديدة"
    >
      {status === "invalid" || status === "failed" ? (
        <FormAlert>
          رابط الاستعادة غير صالح أو انتهت صلاحيته، أو لا تحقق كلمة المرور السياسة.
        </FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      <FragmentTokenForm
        action="/api/auth/reset-password"
        csrfToken={csrfToken}
        missingMessage="رابط الاستعادة غير مكتمل. اطلب رابطاً جديداً."
        pendingLabel="جارٍ التعيين…"
        submitLabel="حفظ كلمة المرور الجديدة"
      >
        <input name="locale" type="hidden" value="ar" />
        <div>
          <label className="text-sm font-bold" htmlFor="password">
            كلمة المرور الجديدة
          </label>
          <PasswordField
            autoComplete="new-password"
            className={inputClassName}
            id="password"
            locale="ar"
            maxLength={128}
            minLength={8}
            name="password"
            required
          />
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="passwordConfirmation">
            تأكيد كلمة المرور الجديدة
          </label>
          <PasswordField
            autoComplete="new-password"
            className={inputClassName}
            id="passwordConfirmation"
            locale="ar"
            maxLength={128}
            minLength={8}
            name="passwordConfirmation"
            required
          />
        </div>
      </FragmentTokenForm>
      <p className="mt-6 text-center text-sm">
        <Link
          className="font-bold text-[var(--itq-color-brand-strong)] underline"
          href="/ar/auth/forgot-password"
        >
          طلب رابط جديد
        </Link>
      </p>
    </AuthShell>
  );
}
