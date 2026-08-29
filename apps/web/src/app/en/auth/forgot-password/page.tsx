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
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm";
const referencePattern = /^PR-[A-F0-9]{10}$/u;

export const metadata = { title: "Recover password" };
export const dynamic = "force-dynamic";

export default async function EnglishForgotPasswordPage({ searchParams }: ForgotPageProps) {
  const [token, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;
  const candidate = typeof query.reference === "string" ? query.reference : "";
  const reference = referencePattern.test(candidate) ? candidate : undefined;
  const badInput = status === "invalid" || status === "failed";
  const country = typeof query.c === "string" ? query.c : "SA";
  const phone = typeof query.p === "string" ? query.p : undefined;
  return (
    <AuthShell
      description="Request recovery with your registered mobile, then contact support from that same WhatsApp number. We never ask for your password."
      locale="en"
      title="Secure account recovery"
    >
      {status === "sent" && reference !== undefined ? (
        <div className="mb-6 rounded-2xl border border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] p-5 text-[var(--itq-color-success-900)]">
          <p className="text-sm font-black">Reference created and valid for two hours</p>
          <bdi
            className="mt-3 block text-center font-mono text-2xl font-black tracking-wider"
            dir="ltr"
          >
            {reference}
          </bdi>
          <ol className="mt-4 list-decimal space-y-2 ps-5 text-sm font-semibold leading-7">
            <li>Open WhatsApp from the registered mobile number.</li>
            <li>Send the reference so support can match the number and approve the request.</li>
            <li>You will receive a one-time link where you choose the new password yourself.</li>
          </ol>
          <a
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--itq-color-whatsapp-600)] px-5 font-black text-white"
            href={supportWhatsAppHref("en", `Password recovery — reference ${reference}`)}
            rel="noreferrer noopener"
            target="_blank"
          >
            Continue verification on WhatsApp
          </a>
          <p className="mt-3 text-xs font-bold">
            Never send your current or new password to anyone.
          </p>
        </div>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>Too many attempts. Please try again later.</FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>The security form expired. Refresh and retry.</FormAlert>
      ) : null}
      {badInput ? (
        <FormErrorSummary>Check the country and mobile number, then try again.</FormErrorSummary>
      ) : null}
      <form action="/api/auth/forgot-password" className="grid gap-5" method="post">
        <CsrfInput token={token} />
        <input name="locale" type="hidden" value="en" />
        <div>
          <label className="text-sm font-bold" htmlFor="countryCode">
            Country
          </label>
          <select
            aria-invalid={badInput || undefined}
            className={inputClassName}
            defaultValue={country}
            id="countryCode"
            name="countryCode"
          >
            <option value="SA">Saudi Arabia (+966)</option>
            <option value="AE">United Arab Emirates (+971)</option>
            <option value="KW">Kuwait (+965)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="phone">
            Registered mobile number
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
          We show the same response whether or not the number belongs to an account, protecting
          account privacy.
        </p>
        <SubmitButton className="w-full" pendingLabel="Creating reference…">
          Create recovery reference
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link
          className="font-bold text-[var(--itq-color-brand-700)] underline"
          href="/en/auth/login"
        >
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
