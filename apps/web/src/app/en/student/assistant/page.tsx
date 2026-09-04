import { AssistantChat } from "@/components/assistant-chat";
import { StudentShell } from "@/components/student-shell";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

export const metadata = { title: "AI assistant" };
export const dynamic = "force-dynamic";

export default async function EnglishStudentAssistantPage() {
  const [principal, csrfToken] = await Promise.all([
    requireStudentPagePrincipal("/en/student/assistant", "requests.read.own", "en"),
    csrfTokenForPage(),
  ]);
  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en" workspace>
      <AssistantChat
        csrfToken={csrfToken}
        endpoint="/api/assistant/student"
        greeting={`Hi ${principal.displayName}! Ask me about your requests, dues, or anything about using the portal.`}
        locale="en"
        placeholder="Type your question…"
        title="AI Assistant"
        variant="full"
      />
    </StudentShell>
  );
}
