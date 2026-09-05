import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthShell, CsrfInput, FormAlert } from "@/components/auth-shell";
import { InstallAppButton } from "@/components/install-app-button";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage, loadWebConfig } from "@/lib/auth-runtime";
import { safeNext } from "@/lib/auth-responses";
import { supportWhatsAppHref } from "@/lib/support-contact";

interface LoginPageProps {
  readonly searchParams: Promise<{
    readonly next?: string | string[];
    readonly status?: string | string[];
    readonly id?: string | string[];
  }>;
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function EnglishLoginPage({ searchParams }: LoginPageProps) {
  const [token, query, requestHeaders] = await Promise.all([
    csrfTokenForPage(),
    searchParams,
    headers(),
  ]);
  const status = typeof query.status === "string" ? query.status : undefined;
  const identity = typeof query.id === "string" ? query.id : undefined;
  const badCredentials = status === "failed" || status === "invalid";
  const requestedNext = safeNext(typeof query.next === "string" ? query.next : undefined);
  const cameFromGuard =
    status === undefined && typeof query.next === "string" && query.next.length > 0;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const onAdminHost = host.split(":")[0]?.toLowerCase().startsWith("admin.") === true;
  const admin = onAdminHost || requestedNext.startsWith("/en/admin");
  // The admin session cookie is Host-only, so an admin login submitted from
  // the public host produces a cookie the admin host can never see — the user
  // just bounces back to the admin login guard. Send them to the admin host's
  // own login page before they can submit a doomed form.
  if (admin && !onAdminHost) {
    const adminBase = loadWebConfig().adminAppUrl.replace(/\/$/u, "");
    const target = new URL(`${adminBase}/en/auth/login`);
    if (requestedNext.length > 0) target.searchParams.set("next", requestedNext);
    if (status !== undefined) target.searchParams.set("status", status);
    if (identity !== undefined) target.searchParams.set("id", identity);
    redirect(target.toString());
  }
  const next = admin ? "/en/admin" : requestedNext;
  return (
    <AuthShell
      description={
        admin
          ? "Restricted sign-in for authorized request, conversation and content administrators."
          : "Use your E.164 mobile number or your legacy email address and password."
      }
      locale="en"
      title={admin ? "Admin center sign-in" : "Sign in"}
    >
      {admin ? <InstallAppButton className="mb-5 w-full" locale="en" surface="admin" /> : null}
      {cameFromGuard ? (
        <FormAlert>
          🔐 Please sign in to continue to the {admin ? "admin center" : "student portal"}.
        </FormAlert>
      ) : null}
      {status === "pending_verification" || status === "account_created" ? (
        <FormAlert>
          Your account is waiting for mobile verification.{" "}
          <a className="underline" href={supportWhatsAppHref("en", "Account verification")}>
            Contact support from the registered number
          </a>
          .
        </FormAlert>
      ) : null}
      {status === "verified" ? (
        <FormAlert tone="success">Your email was verified. You can sign in.</FormAlert>
      ) : null}
      {status === "password_reset" ? (
        <FormAlert tone="success">Password updated. Sign in with the new password.</FormAlert>
      ) : null}
      {status === "logged_out" ? (
        <FormAlert tone="success">You signed out safely.</FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>Too many attempts. Please try again later.</FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>The security form expired. Refresh and retry.</FormAlert>
      ) : null}
      {status === "failed" || status === "invalid" ? (
        <FormAlert>The mobile number/email or password is incorrect.</FormAlert>
      ) : null}
      <form action="/api/auth/login?locale=en" className="grid gap-5" method="post">
        <CsrfInput token={token} />
        <input name="next" type="hidden" value={next} />
        <input name="locale" type="hidden" value="en" />
        <div>
          <label className="text-sm font-bold" htmlFor="identity">
            Mobile number or email
          </label>
          <input
            autoComplete="username"
            autoFocus={identity !== undefined && !badCredentials}
            className={fieldClassName}
            defaultValue={identity}
            dir="ltr"
            id="identity"
            name="identity"
            placeholder="+9665xxxxxxxx or name@example.com"
            required
            type="text"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-bold" htmlFor="password">
              Password
            </label>
            <Link
              className="text-xs font-bold text-[var(--itq-color-brand-strong)] underline"
              href="/en/auth/forgot-password"
            >
              Trouble signing in?
            </Link>
          </div>
          <PasswordField
            autoComplete="current-password"
            autoFocus={badCredentials}
            className={fieldClassName}
            id="password"
            locale="en"
            name="password"
            required
          />
        </div>
        <SubmitButton className="w-full" pendingLabel="Checking…">
          Sign in
        </SubmitButton>
      </form>
      {!admin ? (
        <p className="mt-6 text-center text-sm text-[var(--itq-color-muted)]">
          Need an account?{" "}
          <Link className="font-bold underline" href="/en/auth/register">
            Create one
          </Link>
        </p>
      ) : null}
      <p className="mt-3 text-center text-sm">
        <Link className="font-bold underline" href="/ar/auth/login">
          العربية
        </Link>
      </p>
    </AuthShell>
  );
}
