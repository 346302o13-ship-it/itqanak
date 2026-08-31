import Link from "next/link";

import { AuthShell, CsrfInput } from "@/components/auth-shell";
import { FormErrorSummary } from "@/components/form-error-summary";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage, loadWebConfig } from "@/lib/auth-runtime";
import { firstErroredField, registerFieldMessages } from "@/lib/register-form-errors";

interface RegisterPageProps {
  readonly searchParams: Promise<{
    readonly e?: string | string[];
    readonly n?: string | string[];
    readonly m?: string | string[];
    readonly p?: string | string[];
    readonly c?: string | string[];
    readonly status?: string | string[];
  }>;
}

function fieldClassName(invalid: boolean): string {
  return `mt-2 w-full rounded-xl border bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm ${
    invalid ? "border-[var(--itq-color-danger-600)]" : "border-[var(--itq-color-border)]"
  }`;
}

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const metadata = { title: "إنشاء حساب" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const [token, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const { termsVersion, privacyVersion } = loadWebConfig().auth;
  const errors = registerFieldMessages(one(query.e) ?? one(query.status), "ar");
  const focus = firstErroredField(errors);
  const values = { displayName: one(query.n), email: one(query.m), phone: one(query.p) };
  const country = one(query.c) ?? "SA";

  return (
    <AuthShell
      description="أنشئ حسابك بالاسم والبريد ورقم الجوال. يبقى تفعيل الحساب بيد المدير بعد مطابقة رقم واتساب المسجل."
      title="إنشاء حساب جديد"
    >
      {errors.summary ? <FormErrorSummary>{errors.summary}</FormErrorSummary> : null}
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
            autoFocus={focus === "displayName"}
            className={fieldClassName(errors.displayName !== undefined)}
            defaultValue={values.displayName}
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
            aria-describedby="email-help"
            aria-invalid={errors.email !== undefined || undefined}
            autoComplete="email"
            autoFocus={focus === "email"}
            className={fieldClassName(errors.email !== undefined)}
            defaultValue={values.email}
            dir="ltr"
            id="email"
            inputMode="email"
            maxLength={320}
            name="email"
            placeholder="name@example.com"
            required
            type="email"
          />
          {errors.email ? (
            <p
              className="mt-2 text-xs font-bold text-[var(--itq-color-danger-800)]"
              id="email-help"
            >
              {errors.email}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]" id="email-help">
              يُحفظ للتواصل وتسجيل الدخول، ولا يغيّر آلية التفعيل عبر موافقة المدير على رقم الجوال.
            </p>
          )}
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="countryCode">
            الدولة
          </label>
          <select
            aria-invalid={errors.countryCode !== undefined || undefined}
            autoFocus={focus === "countryCode"}
            className={fieldClassName(errors.countryCode !== undefined)}
            defaultValue={country}
            id="countryCode"
            name="countryCode"
          >
            <option value="SA">السعودية (+966)</option>
            <option value="AE">الإمارات (+971)</option>
            <option value="KW">الكويت (+965)</option>
          </select>
          {errors.countryCode ? (
            <p className="mt-2 text-xs font-bold text-[var(--itq-color-danger-800)]">
              {errors.countryCode}
            </p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="phone">
            رقم الجوال
          </label>
          <input
            aria-describedby="phone-help"
            aria-invalid={errors.phone !== undefined || undefined}
            autoComplete="tel"
            autoFocus={focus === "phone"}
            className={fieldClassName(errors.phone !== undefined)}
            defaultValue={values.phone}
            id="phone"
            inputMode="tel"
            maxLength={24}
            name="phone"
            placeholder="05xxxxxxxx"
            required
            type="tel"
          />
          {errors.phone ? (
            <p
              className="mt-2 text-xs font-bold text-[var(--itq-color-danger-800)]"
              id="phone-help"
            >
              {errors.phone}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]" id="phone-help">
              يجب أن يكون الرقم نفسه المستخدم عند مراسلة الدعم على واتساب.
            </p>
          )}
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="password">
            كلمة المرور
          </label>
          <input
            aria-describedby="password-help"
            aria-invalid={errors.password !== undefined || undefined}
            autoComplete="new-password"
            autoFocus={focus === "password"}
            className={fieldClassName(errors.password !== undefined)}
            id="password"
            maxLength={128}
            minLength={8}
            name="password"
            required
            type="password"
          />
          {errors.password ? (
            <p
              className="mt-2 text-xs font-bold text-[var(--itq-color-danger-800)]"
              id="password-help"
            >
              {errors.password}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]" id="password-help">
              8 أحرف على الأقل، وحتى 128 حرفاً. لا تُشترط رموز أو حروف كبيرة، ولا تكن أرقاماً
              متسلسلة فقط.
            </p>
          )}
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="passwordConfirmation">
            تأكيد كلمة المرور
          </label>
          <input
            autoComplete="new-password"
            className={fieldClassName(errors.password !== undefined)}
            id="passwordConfirmation"
            maxLength={128}
            minLength={8}
            name="passwordConfirmation"
            required
            type="password"
          />
        </div>
        <div className="grid gap-3">
          {errors.consent ? (
            <p className="text-xs font-bold text-[var(--itq-color-danger-800)]">{errors.consent}</p>
          ) : null}
          <label className="flex items-start gap-3 rounded-xl border border-[var(--itq-color-border)] p-4 text-sm leading-6">
            <input className="mt-1 size-4" name="acceptedTerms" required type="checkbox" />
            <span>
              أوافق على{" "}
              <Link
                className="font-black text-[var(--itq-color-brand-strong)] underline underline-offset-4"
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
                className="font-black text-[var(--itq-color-brand-strong)] underline underline-offset-4"
                href="/ar/privacy"
                rel="noopener"
                target="_blank"
              >
                سياسة الخصوصية
              </Link>
              ، إصدار <bdi dir="ltr">{privacyVersion}</bdi>.
            </span>
          </label>
        </div>
        <SubmitButton className="w-full" pendingLabel="جارٍ إنشاء الحساب…">
          إنشاء الحساب
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--itq-color-muted)]">
        لديك حساب؟{" "}
        <Link
          className="font-bold text-[var(--itq-color-brand-strong)] underline"
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
