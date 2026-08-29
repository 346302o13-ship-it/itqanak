import { AdminShell } from "@/components/admin-shell";
import { ApprovalsWorkspace, type ApprovalsTab } from "@/components/approvals-workspace";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface PageProps {
  readonly searchParams: Promise<{
    readonly tab?: string | string[];
    readonly notice?: string | string[];
  }>;
}

export const metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminApprovalsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/approvals", "en"),
    csrfTokenForPage(),
  ]);
  const runtime = await createStudentRequestRuntime();
  let phoneVerifications;
  let passwordResets;
  try {
    [phoneVerifications, passwordResets] = await Promise.all([
      runtime.auth.listPendingPhoneVerifications(principal, 100),
      runtime.auth.listPhonePasswordResetRequests(principal, 100),
    ]);
  } finally {
    await runtime.close();
  }
  const requested = typeof query.tab === "string" ? query.tab : undefined;
  const tab: ApprovalsTab =
    requested === "reset" || (requested === undefined && phoneVerifications.length === 0)
      ? "reset"
      : "phone";
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <ApprovalsWorkspace
        csrfToken={csrfToken}
        locale="en"
        {...(typeof query.notice === "string" ? { notice: query.notice } : {})}
        passwordResets={passwordResets}
        phoneVerifications={phoneVerifications}
        tab={tab}
      />
    </AdminShell>
  );
}
