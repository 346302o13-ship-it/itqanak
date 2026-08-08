import Link from "next/link";

import { AuthShell, FormAlert } from "@/components/auth-shell";
import { FragmentTokenForm } from "@/components/fragment-token-form";
import { csrfTokenForPage } from "@/lib/auth-runtime";

interface VerifyEmailPageProps {
  readonly searchParams: Promise<{
    readonly status?: string | string[];
  }>;
}

export const dynamic = "force-dynamic";
export const metadata = {
  title: "تأكيد البريد الإلكتروني",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const [csrfToken, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AuthShell
      description="نتحقق من رابط التأكيد مرة واحدة ثم ننقلك إلى عنوان نظيف بلا رمز حساس."
      title="تأكيد البريد الإلكتروني"
    >
      {status === "csrf" ? (
        <FormAlert>انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "invalid" || status === "failed" ? (
        <FormAlert>رابط التأكيد غير صالح أو انتهت صلاحيته.</FormAlert>
      ) : null}
      <FragmentTokenForm
        action="/api/auth/verify-email"
        csrfToken={csrfToken}
        missingMessage="رابط التأكيد غير مكتمل. اطلب رسالة تأكيد جديدة."
        pendingLabel="جارٍ التأكيد…"
        submitLabel="تأكيد البريد الإلكتروني"
      />
      <p className="mt-6 text-center text-sm">
        <Link
          className="font-bold text-[var(--itq-color-brand-700)] underline"
          href="/ar/auth/resend-verification"
        >
          إعادة إرسال رابط التأكيد
        </Link>
      </p>
    </AuthShell>
  );
}
