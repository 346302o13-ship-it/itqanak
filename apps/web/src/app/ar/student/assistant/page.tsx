import { AssistantChat } from "@/components/assistant-chat";
import { StudentShell } from "@/components/student-shell";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { toDisplayMessages } from "@/lib/assistant-display";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

export const metadata = { title: "المساعد الذكي" };
export const dynamic = "force-dynamic";

export default async function StudentAssistantPage() {
  const [principal, csrfToken] = await Promise.all([
    requireStudentPagePrincipal("/ar/student/assistant", "requests.read.own"),
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
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} workspace>
      <AssistantChat
        backHref="/ar/student/support"
        backLabel="الدعم"
        csrfToken={csrfToken}
        endpoint="/api/assistant/student"
        greeting={`أهلاً ${principal.displayName}! اسألني عن طلباتك، مستحقاتك، أو أي شيء يخص استخدام المنصة.`}
        initialMessages={initialMessages}
        locale="ar"
        placeholder="اكتب سؤالك…"
        title="المساعد الذكي"
        variant="full"
      />
    </StudentShell>
  );
}
