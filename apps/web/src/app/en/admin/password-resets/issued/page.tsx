import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthenticationError } from "@itqanak/auth";

import { AdminShell } from "@/components/admin-shell";
import { IssuedPasswordResetLink } from "@/components/issued-password-reset-link";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { issuedPasswordResetExpiryIso } from "@/lib/password-reset-presenters";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface PageProps {
  readonly searchParams: Promise<{ readonly request?: string | string[] }>;
}
export const metadata = {
  title: "One-time recovery link",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function EnglishIssuedPasswordResetPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const requestId = typeof query.request === "string" ? query.request : "";
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/password-resets/issued", "en"),
    csrfTokenForPage(),
  ]);
  const runtime = await createStudentRequestRuntime();
  let item;
  let publicAppUrl;
  let tokenExpiresAt;
  try {
    try {
      item = await runtime.auth.getPhonePasswordResetRequest(principal, requestId);
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) notFound();
      throw error;
    }
    const persistedTokenExpiry = issuedPasswordResetExpiryIso(item);
    if (persistedTokenExpiry === undefined) notFound();
    publicAppUrl = runtime.config.publicAppUrl.replace(/\/$/u, "");
    tokenExpiresAt = persistedTokenExpiry;
  } finally {
    await runtime.close();
  }
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <div className="mx-auto max-w-3xl rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-[var(--itq-shadow-sm)] sm:p-8">
        <p className="text-sm font-black text-[var(--itq-color-brand-700)]">Securely approved</p>
        <h1 className="mt-1 text-3xl font-black">Send the recovery link to the student</h1>
        <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
          Your approval and WhatsApp evidence were written to the audit trail. Administrators cannot
          see the password the student chooses.
        </p>
        <IssuedPasswordResetLink
          expiresAt={tokenExpiresAt}
          locale="en"
          phoneE164={item.phoneE164}
          publicAppUrl={publicAppUrl}
          publicReference={item.publicReference}
        />
        <Link
          className="mt-7 inline-flex font-black text-[var(--itq-color-brand-700)] underline"
          href="/en/admin/password-resets"
        >
          Back to recovery requests
        </Link>
      </div>
    </AdminShell>
  );
}
