import { AdminMonitoring } from "@/components/admin-monitoring";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { loadAdminMonitoringSnapshot } from "@/lib/admin-monitoring";
import { monitoringWhatsAppConfiguration } from "@/lib/admin-monitoring-config";
import { createAuthRuntime, csrfTokenForPage } from "@/lib/auth-runtime";

export const metadata = { title: "Platform monitoring" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminMonitoringPage() {
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/monitoring", "en", "admin.operations.read"),
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
        locale="en"
        snapshot={snapshot}
      />
    );
  } finally {
    await runtime.close();
  }
}
