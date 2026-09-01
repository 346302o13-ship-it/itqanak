import Link from "next/link";

import { AuthShell, FormAlert } from "@/components/auth-shell";
import { FragmentTokenForm } from "@/components/fragment-token-form";
import { PasswordField } from "@/components/password-field";
import { csrfTokenForPage } from "@/lib/auth-runtime";

interface ResetPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set a new password", robots: { index: false, follow: false } };

export default async function EnglishResetPasswordPage({ searchParams }: ResetPageProps) {
  const [csrfToken, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AuthShell
      description="Choose the new password yourself. The recovery link expires automatically and works only once."
      locale="en"
      title="Set a new password"
    >
      {status === "invalid" || status === "failed" ? (
        <FormAlert>
          The recovery link is invalid or expired, or the password does not meet the policy.
        </FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>Too many attempts. Please try again later.</FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>The security form expired. Refresh and retry.</FormAlert>
      ) : null}
      <FragmentTokenForm
        action="/api/auth/reset-password"
        csrfToken={csrfToken}
        missingMessage="The recovery link is incomplete. Request a new one."
        pendingLabel="Saving…"
        submitLabel="Save new password"
      >
        <input name="locale" type="hidden" value="en" />
        <div>
          <label className="text-sm font-bold" htmlFor="password">
            New password
          </label>
          <PasswordField
            autoComplete="new-password"
            className={inputClassName}
            id="password"
            locale="en"
            maxLength={128}
            minLength={8}
            name="password"
            required
          />
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="passwordConfirmation">
            Confirm new password
          </label>
          <PasswordField
            autoComplete="new-password"
            className={inputClassName}
            id="passwordConfirmation"
            locale="en"
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
          href="/en/auth/forgot-password"
        >
          Request a new link
        </Link>
      </p>
    </AuthShell>
  );
}
