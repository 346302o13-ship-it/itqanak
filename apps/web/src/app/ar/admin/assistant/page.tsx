import { AdminShell } from "@/components/admin-shell";
import { AssistantChat } from "@/components/assistant-chat";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { toDisplayMessages } from "@/lib/assistant-display";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

export const metadata = { title: "المساعد الذكي" };
export const dynamic = "force-dynamic";

export default async function AdminAssistantPage() {
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/assistant", "ar", "admin.requests.read"),
    csrfTokenForPage(),
  ]);
  const runtime = await createStudentRequestRuntime();
  let initialMessages;
  try {
    initialMessages = toDisplayMessages(
      await runtime.assistantHistory.listRecent(principal.userId),
    );
  } finally {
    await runtime.close();
  }
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} workspace>
      <AssistantChat
        backHref="/ar/admin/support"
        backLabel="المحادثات"
        csrfToken={csrfToken}
        endpoint="/api/admin/assistant"
        greeting={`أهلاً ${principal.displayName}! اسألني عن أي طالب أو طلب أو محادثة، أو عن الطلبات المتوقفة، أو حالة الخدمة.`}
        initialMessages={initialMessages}
        locale="ar"
        placeholder="اكتب سؤالك… مثال: ابحث عن الطالب أحمد"
        title="المساعد الذكي"
        variant="full"
      />
    </AdminShell>
  );
}
