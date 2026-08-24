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
      description="أنشئ حسابك بالاسم والبريد ورقم الجوال. يبقى تفعيل الحساب بيد المدير بعد مطابقة رقم واتساب المسجل."
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
        <input name="locale" type="hidden" value="ar" />
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
            dir="ltr"
            id="email"
            inputMode="email"
            maxLength={320}
            name="email"
            placeholder="name@example.com"
            required
            type="email"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]">
            يُحفظ للتواصل وتسجيل الدخول، ولا يغيّر آلية التفعيل عبر موافقة المدير على رقم الجوال.
          </p>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="countryCode">
            الدولة
          </label>
          <select
            className={fieldClassName()}
            defaultValue="SA"
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
            رقم الجوال
          </label>
          <input
            autoComplete="tel"
            className={fieldClassName()}
            id="phone"
            inputMode="tel"
            maxLength={24}
            name="phone"
            placeholder="05xxxxxxxx"
            required
            type="tel"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]">
            يجب أن يكون الرقم نفسه المستخدم عند مراسلة الدعم على واتساب.
          </p>
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
          <span>
            أوافق على{" "}
            <Link
              className="font-black text-[var(--itq-color-brand-700)] underline underline-offset-4"
              href="/ar/terms"
              rel="noopener"
              target="_blank"
            >
              شروط الاستخدام
            </Link>
            ، إصدار <bdi dir="ltr">{termsVersion}</bdi>.
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-[var(--itq-color-border)] p-4 text-sm leading-6">
          <input className="mt-1 size-4" name="acceptedPrivacy" required type="checkbox" />
          <span>
            أوافق على{" "}
            <Link
              className="font-black text-[var(--itq-color-brand-700)] underline underline-offset-4"
              href="/ar/privacy"
              rel="noopener"
              target="_blank"
            >
              سياسة الخصوصية
            </Link>
            ، إصدار <bdi dir="ltr">{privacyVersion}</bdi>.
          </span>
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
      <p className="mt-3 text-center text-sm">
        <Link className="font-bold underline" href="/en/auth/register">
          English
        </Link>
      </p>
    </AuthShell>
  );
}
