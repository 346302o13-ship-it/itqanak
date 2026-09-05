import { AdminShell } from "@/components/admin-shell";
import { GroupChannelPane } from "@/components/group-channel-pane";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requireAdminPagePrincipal } from "@/lib/admin-page";

export const metadata = { title: "قروب الطلاب" };
export const dynamic = "force-dynamic";

export default async function AdminGroupChannelPage() {
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/group", "ar", "admin.conversations.read"),
    csrfTokenForPage(),
  ]);
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} workspace>
      <div className="itq-screen-h flex min-h-0">
        <GroupChannelPane
          apiBase="/api/admin/group-channel"
          backHref="/ar/admin/support"
          csrfToken={csrfToken}
          locale="ar"
        />
      </div>
    </AdminShell>
  );
}
