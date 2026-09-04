import { AssistantChat } from "@/components/assistant-chat";
import { StudentShell } from "@/components/student-shell";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

export const metadata = { title: "المساعد الذكي" };
export const dynamic = "force-dynamic";

export default async function StudentAssistantPage() {
  const [principal, csrfToken] = await Promise.all([
    requireStudentPagePrincipal("/ar/student/assistant", "requests.read.own"),
    csrfTokenForPage(),
  ]);
  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} workspace>
      <AssistantChat
        csrfToken={csrfToken}
        endpoint="/api/assistant/student"
        greeting={`أهلاً ${principal.displayName}! اسألني عن طلباتك، مستحقاتك، أو أي شيء يخص استخدام المنصة.`}
        locale="ar"
        placeholder="اكتب سؤالك…"
        title="المساعد الذكي"
        variant="full"
      />
    </StudentShell>
  );
}
