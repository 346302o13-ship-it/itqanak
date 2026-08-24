import { AdminMonitoring } from "@/components/admin-monitoring";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { loadAdminMonitoringSnapshot } from "@/lib/admin-monitoring";
import { monitoringWhatsAppConfiguration } from "@/lib/admin-monitoring-config";
import { createAuthRuntime, csrfTokenForPage } from "@/lib/auth-runtime";

export const metadata = { title: "مراقبة المنصة" };
export const dynamic = "force-dynamic";

export default async function ArabicAdminMonitoringPage() {
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/monitoring", "ar", "admin.operations.read"),
    csrfTokenForPage(),
  ]);
  const runtime = await createAuthRuntime();
  try {
    const snapshot = await loadAdminMonitoringSnapshot(
      runtime.database,
      principal,
      monitoringWhatsAppConfiguration(),
    );
    return (
      <AdminMonitoring
        csrfToken={csrfToken}
        displayName={principal.displayName}
        locale="ar"
        snapshot={snapshot}
      />
    );
  } finally {
    await runtime.close();
  }
}
