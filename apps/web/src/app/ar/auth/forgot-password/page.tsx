import Link from "next/link";

import { AuthShell, CsrfInput, FormAlert } from "@/components/auth-shell";
import { FormErrorSummary } from "@/components/form-error-summary";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { supportWhatsAppHref } from "@/lib/support-contact";

interface ForgotPageProps {
  readonly searchParams: Promise<{
    readonly reference?: string | string[];
    readonly status?: string | string[];
    readonly c?: string | string[];
    readonly p?: string | string[];
  }>;
}

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";
const referencePattern = /^PR-[A-F0-9]{10}$/u;

export const metadata = { title: "استعادة كلمة المرور" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: ForgotPageProps) {
  const [token, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;
  const candidate = typeof query.reference === "string" ? query.reference : "";
  const reference = referencePattern.test(candidate) ? candidate : undefined;
  const badInput = status === "invalid" || status === "failed";
  const country = typeof query.c === "string" ? query.c : "SA";
  const phone = typeof query.p === "string" ? query.p : undefined;
  return (
    <AuthShell
      description="اطلب الاستعادة برقمك المسجل، ثم تواصل مع الدعم من رقم واتساب نفسه. لن نطلب منك كلمة المرور أبداً."
      title="استعادة آمنة للحساب"
    >
      {status === "sent" && reference !== undefined ? (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <p className="text-sm font-black">تم إنشاء مرجع صالح لمدة ساعتين</p>
          <bdi
            className="mt-3 block text-center font-mono text-2xl font-black tracking-wider"
            dir="ltr"
          >
            {reference}
          </bdi>
          <ol className="mt-4 list-decimal space-y-2 pe-5 text-sm font-semibold leading-7">
            <li>افتح واتساب من رقم الجوال المسجل نفسه.</li>
            <li>أرسل المرجع للدعم ليطابق الرقم ويوافق على الطلب.</li>
            <li>سيصلك رابط أحادي الاستخدام؛ افتحه واختر كلمة المرور بنفسك.</li>
          </ol>
          <a
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--itq-color-whatsapp-600)] px-5 font-black text-white"
            href={supportWhatsAppHref("ar", `استعادة كلمة المرور — المرجع ${reference}`)}
            rel="noreferrer noopener"
            target="_blank"
          >
            متابعة التحقق عبر واتساب
          </a>
          <p className="mt-3 text-xs font-bold">لا ترسل كلمة المرور الحالية أو الجديدة لأي شخص.</p>
        </div>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      {badInput ? (
        <FormErrorSummary>تحقق من الدولة ورقم الجوال ثم أعد المحاولة.</FormErrorSummary>
      ) : null}
      <form action="/api/auth/forgot-password" className="grid gap-5" method="post">
        <CsrfInput token={token} />
        <input name="locale" type="hidden" value="ar" />
        <div>
          <label className="text-sm font-bold" htmlFor="countryCode">
            الدولة
          </label>
          <select
            aria-invalid={badInput || undefined}
            className={inputClassName}
            defaultValue={country}
            id="countryCode"
            name="countryCode"
          >
            <option value="SA">السعودية (+966)</option>
            <option value="AE">الإمارات (+971)</option>
            <option value="KW">الكويت (+965)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="phone">
            رقم الجوال المسجل
          </label>
          <input
            aria-invalid={badInput || undefined}
            autoComplete="tel"
            autoFocus={badInput}
            className={inputClassName}
            defaultValue={phone}
            dir="ltr"
            id="phone"
            inputMode="tel"
            maxLength={24}
            name="phone"
            placeholder="05xxxxxxxx"
            required
            type="tel"
          />
        </div>
        <p className="rounded-xl bg-[var(--itq-color-surface-soft)] p-4 text-xs font-semibold leading-6 text-[var(--itq-color-muted)]">
          نعرض الاستجابة نفسها سواء كان الرقم مرتبطاً بحساب أم لا لحماية خصوصية الحسابات.
        </p>
        <SubmitButton className="w-full" pendingLabel="جارٍ إنشاء المرجع…">
          إنشاء مرجع الاستعادة
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
