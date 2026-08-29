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
  title: "رابط الاستعادة الأحادي",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function IssuedPasswordResetPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const requestId = typeof query.request === "string" ? query.request : "";
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/password-resets/issued"),
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
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName}>
      <div className="mx-auto max-w-3xl rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-8">
        <p className="text-sm font-black text-[var(--itq-color-brand-700)]">تمت الموافقة بأمان</p>
        <h1 className="mt-1 text-3xl font-black">أرسل رابط الاستعادة للطالب</h1>
        <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
          تم حفظ موافقتك ومرجع واتساب في سجل التدقيق. لا يمكن للمدير رؤية كلمة المرور التي سيختارها
          الطالب.
        </p>
        <IssuedPasswordResetLink
          expiresAt={tokenExpiresAt}
          locale="ar"
          phoneE164={item.phoneE164}
          publicAppUrl={publicAppUrl}
          publicReference={item.publicReference}
        />
        <Link
          className="mt-7 inline-flex font-black text-[var(--itq-color-brand-700)] underline"
          href="/ar/admin/approvals?tab=reset"
        >
          العودة إلى الاعتمادات
        </Link>
      </div>
    </AdminShell>
  );
}
