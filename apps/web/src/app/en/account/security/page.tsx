import { hasAdminAccess } from "@itqanak/auth";

import { AccountShell } from "@/components/account-shell";
import { CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requirePagePrincipal } from "@/lib/account-page";

interface SecurityPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

export const metadata = { title: "Account security" };
export const dynamic = "force-dynamic";

export default async function EnglishSecurityPage({ searchParams }: SecurityPageProps) {
  const principal = await requirePagePrincipal("/en/account/security", "en");
  const [csrfToken, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const status = typeof query.status === "string" ? query.status : undefined;

  return (
    <AccountShell
      surface={hasAdminAccess(principal) ? "admin" : "student"}
      csrfToken={csrfToken}
      displayName={principal.displayName}
      locale="en"
    >
      <h1 className="text-3xl font-black">Password & security</h1>
      <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
        When you change your password, previous sessions are revoked and a new session is created
        for this browser.
      </p>
      {status === "password_changed" ? (
        <FormAlert tone="success">
          Your password was changed and previous sessions were revoked.
        </FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>Too many attempts. Please try again later.</FormAlert>
      ) : null}
      {status === "failed" || status === "invalid" ? (
        <FormAlert>
          The password could not be changed. Check your current password and the password
          requirements.
        </FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>The security form expired. Refresh the page and try again.</FormAlert>
      ) : null}
      <form
        action="/api/account/change-password"
        className="mt-8 grid max-w-lg gap-5"
        method="post"
      >
        <CsrfInput token={csrfToken} />
        <input name="locale" type="hidden" value="en" />
        <div>
          <label className="text-sm font-bold" htmlFor="currentPassword">
            Current password
          </label>
          <input
            autoComplete="current-password"
            className={inputClassName}
            id="currentPassword"
            name="currentPassword"
            required
            type="password"
          />
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="newPassword">
            New password
          </label>
          <input
            aria-describedby="new-password-help"
            autoComplete="new-password"
            className={inputClassName}
            id="newPassword"
            maxLength={128}
            minLength={12}
            name="newPassword"
            required
            type="password"
          />
          <p className="mt-2 text-xs text-[var(--itq-color-muted)]" id="new-password-help">
            Use at least 12 characters; your current password cannot be reused.
          </p>
        </div>
        <div>
          <label className="text-sm font-bold" htmlFor="passwordConfirmation">
            Confirm new password
          </label>
          <input
            autoComplete="new-password"
            className={inputClassName}
            id="passwordConfirmation"
            maxLength={128}
            minLength={12}
            name="passwordConfirmation"
            required
            type="password"
          />
        </div>
        <SubmitButton pendingLabel="Changing password…">Change password</SubmitButton>
      </form>
      <p className="mt-6 max-w-lg rounded-xl bg-[var(--itq-color-surface-soft)] p-4 text-sm font-semibold leading-7">
        Forgot the current password?{" "}
        <Link
          className="font-black text-[var(--itq-color-brand-700)] underline"
          href="/en/auth/forgot-password"
        >
          Create a support-assisted recovery request
        </Link>
        . An administrator verifies the registered WhatsApp number, then you choose the password
        yourself.
      </p>
    </AccountShell>
  );
}
import Link from "next/link";
