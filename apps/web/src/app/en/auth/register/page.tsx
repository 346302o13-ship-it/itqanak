import Link from "next/link";

import { AuthShell, CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage, loadWebConfig } from "@/lib/auth-runtime";

interface RegisterPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function EnglishRegisterPage({ searchParams }: RegisterPageProps) {
  const [token, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const { termsVersion, privacyVersion } = loadWebConfig().auth;
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AuthShell
      description="Create your account with your name, email, and mobile number. An administrator still activates it after matching your registered WhatsApp number."
      locale="en"
      title="Create your account"
    >
      {status === "csrf" ? (
        <FormAlert>The security form expired. Refresh and retry.</FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>Too many attempts. Please try again later.</FormAlert>
      ) : null}
      {status === "failed" ? (
        <FormAlert>We could not create the account. Check the details and retry.</FormAlert>
      ) : null}
      <form action="/api/auth/register?locale=en" className="grid gap-5" method="post">
        <CsrfInput token={token} />
        <input name="locale" type="hidden" value="en" />
        <input name="termsVersion" type="hidden" value={termsVersion} />
        <input name="privacyVersion" type="hidden" value={privacyVersion} />
        <div>
          <label className="text-sm font-bold" htmlFor="displayName">
            Name
          </label>
          <input
            autoComplete="name"
            className={fieldClassName}
            id="displayName"
            maxLength={120}
            minLength={2}
            name="displayName"
            required
          />
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="email">
            Email address
          </label>
          <input
            autoComplete="email"
            className={fieldClassName}
            id="email"
            inputMode="email"
            maxLength={320}
            name="email"
            placeholder="name@example.com"
            required
            type="email"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]">
            Used for contact and sign-in. Activation still requires administrator approval of your
            mobile number.
          </p>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="countryCode">
            Country
          </label>
          <select className={fieldClassName} defaultValue="SA" id="countryCode" name="countryCode">
            <option value="SA">Saudi Arabia (+966)</option>
            <option value="AE">United Arab Emirates (+971)</option>
            <option value="KW">Kuwait (+965)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="phone">
            Mobile number
          </label>
          <input
            autoComplete="tel"
            className={fieldClassName}
            id="phone"
            inputMode="tel"
            maxLength={24}
            name="phone"
            placeholder="05xxxxxxxx"
            required
            type="tel"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]">
            You must contact support from this same number on WhatsApp.
          </p>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="password">
            Password
          </label>
          <input
            autoComplete="new-password"
            className={fieldClassName}
            id="password"
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]">
            Use at least 12 characters. A long passphrase is recommended.
          </p>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="passwordConfirmation">
            Confirm password
          </label>
          <input
            autoComplete="new-password"
            className={fieldClassName}
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
            I accept the{" "}
            <Link
              className="font-black text-[var(--itq-color-brand-700)] underline underline-offset-4"
              href="/en/terms"
              rel="noopener"
              target="_blank"
            >
              Terms of Use
            </Link>
            , version <bdi dir="ltr">{termsVersion}</bdi>.
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-[var(--itq-color-border)] p-4 text-sm leading-6">
          <input className="mt-1 size-4" name="acceptedPrivacy" required type="checkbox" />
          <span>
            I accept the{" "}
            <Link
              className="font-black text-[var(--itq-color-brand-700)] underline underline-offset-4"
              href="/en/privacy"
              rel="noopener"
              target="_blank"
            >
              Privacy Policy
            </Link>
            , version <bdi dir="ltr">{privacyVersion}</bdi>.
          </span>
        </label>
        <SubmitButton className="w-full" pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--itq-color-muted)]">
        Already registered?{" "}
        <Link className="font-bold underline" href="/en/auth/login">
          Sign in
        </Link>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link className="font-bold underline" href="/ar/auth/register">
          العربية
        </Link>
      </p>
    </AuthShell>
  );
}
