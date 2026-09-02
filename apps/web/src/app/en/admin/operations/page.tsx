import { createMalwareScanner } from "@itqanak/storage";

import { OperationsAdmin } from "@/components/operations-admin";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createOperationsRuntime } from "@/lib/operations-runtime";
import { plannedFileScannerReadiness } from "@/lib/readiness";

interface OperationsPageProps {
  readonly searchParams: Promise<{
    readonly notice?: string | readonly string[];
    readonly retentionNotice?: string | readonly string[];
  }>;
}

export const metadata = { title: "Operations & maintenance" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminOperationsPage({ searchParams }: OperationsPageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/operations", "en", "admin.operations.read"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const runtime = await createOperationsRuntime();
  try {
    const [state, retention] = await Promise.all([
      runtime.operations.getAdminState(principal),
      runtime.retention.getAdminRetention(principal),
    ]);
    const scannerReadiness =
      plannedFileScannerReadiness(runtime.config.fileScanning.mode, state) ??
      (await createMalwareScanner(runtime.config.fileScanning).checkReadiness());
    return (
      <OperationsAdmin
        csrfToken={csrfToken}
        displayName={principal.displayName}
        locale="en"
        retention={retention}
        scannerReadiness={scannerReadiness}
        state={state}
        {...(typeof query.notice === "string" ? { notice: query.notice } : {})}
        {...(typeof query.retentionNotice === "string"
          ? { retentionNotice: query.retentionNotice }
          : {})}
      />
    );
  } finally {
    await runtime.close();
  }
}
