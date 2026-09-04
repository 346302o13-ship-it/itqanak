import { AdminShell } from "@/components/admin-shell";
import { AssistantChat } from "@/components/assistant-chat";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";

export const metadata = { title: "المساعد الذكي" };
export const dynamic = "force-dynamic";

export default async function AdminAssistantPage() {
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/assistant", "ar", "admin.requests.read"),
    csrfTokenForPage(),
  ]);
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} workspace>
      <AssistantChat
        csrfToken={csrfToken}
        endpoint="/api/admin/assistant"
        greeting={`أهلاً ${principal.displayName}! اسألني عن أي طالب أو طلب أو محادثة، أو عن الطلبات المتوقفة، أو حالة الخدمة.`}
        locale="ar"
        placeholder="اكتب سؤالك… مثال: ابحث عن الطالب أحمد"
        title="المساعد الذكي"
        variant="full"
      />
    </AdminShell>
  );
}
