import { AssistantChat } from "@/components/assistant-chat";
import { StudentShell } from "@/components/student-shell";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { toDisplayMessages } from "@/lib/assistant-display";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

export const metadata = { title: "AI assistant" };
export const dynamic = "force-dynamic";

export default async function EnglishStudentAssistantPage() {
  const [principal, csrfToken] = await Promise.all([
    requireStudentPagePrincipal("/en/student/assistant", "requests.read.own", "en"),
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
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en" workspace>
      <AssistantChat
        backHref="/en/student/support"
        backLabel="Support"
        csrfToken={csrfToken}
        endpoint="/api/assistant/student"
        greeting={`Hi ${principal.displayName}! Ask me about your requests, dues, or anything about using the portal.`}
        initialMessages={initialMessages}
        locale="en"
        placeholder="Type your question…"
        title="AI Assistant"
        variant="full"
      />
    </StudentShell>
  );
}
