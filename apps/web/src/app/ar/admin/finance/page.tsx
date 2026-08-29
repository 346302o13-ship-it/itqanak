import { hasPermission } from "@itqanak/auth";

import { FinanceAdmin } from "@/components/finance-admin";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { parseFinanceListQuery } from "@/lib/finance-form";
import { createFinanceRuntime } from "@/lib/finance-runtime";

interface FinancePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>;
}

export const metadata = { title: "المدفوعات والمستحقات" };
export const dynamic = "force-dynamic";

export default async function ArabicAdminFinancePage({ searchParams }: FinancePageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/finance", "ar", "admin.finance.read"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const filters = parseFinanceListQuery(query);
  const runtime = await createFinanceRuntime();
  let dues;
  let report;
  let pendingReceipts;
  try {
    dues = await runtime.finance.listAdminDues(principal, filters);
    pendingReceipts = await runtime.finance.listPendingReceipts(principal);
    if (hasPermission(principal, "admin.finance.reports.read")) {
      report = await runtime.finance.getAdminReport(principal);
    }
  } finally {
    await runtime.close();
  }
  return (
    <FinanceAdmin
      canManage={hasPermission(principal, "admin.finance.manage")}
      csrfToken={csrfToken}
      displayName={principal.displayName}
      dues={dues}
      filters={filters}
      locale="ar"
      pendingReceipts={pendingReceipts}
      {...(report === undefined ? {} : { report })}
      {...(typeof query.notice === "string" ? { notice: query.notice } : {})}
    />
  );
}
