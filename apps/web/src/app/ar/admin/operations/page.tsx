import { createMalwareScanner } from "@itqanak/storage";

import { OperationsAdmin } from "@/components/operations-admin";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createOperationsRuntime } from "@/lib/operations-runtime";
import { plannedFileScannerReadiness } from "@/lib/readiness";

interface OperationsPageProps {
  readonly searchParams: Promise<{ readonly notice?: string | readonly string[] }>;
}

export const metadata = { title: "التشغيل والصيانة" };
export const dynamic = "force-dynamic";

export default async function ArabicAdminOperationsPage({ searchParams }: OperationsPageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/operations", "ar", "admin.operations.read"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const runtime = await createOperationsRuntime();
  try {
    const state = await runtime.operations.getAdminState(principal);
    const scannerReadiness =
      plannedFileScannerReadiness(runtime.config.fileScanning.mode, state) ??
      (await createMalwareScanner(runtime.config.fileScanning).checkReadiness());
    return (
      <OperationsAdmin
        csrfToken={csrfToken}
        displayName={principal.displayName}
        locale="ar"
        scannerReadiness={scannerReadiness}
        state={state}
        {...(typeof query.notice === "string" ? { notice: query.notice } : {})}
      />
    );
  } finally {
    await runtime.close();
  }
}
