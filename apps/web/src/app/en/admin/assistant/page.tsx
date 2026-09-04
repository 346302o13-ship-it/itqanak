import { AdminShell } from "@/components/admin-shell";
import { AssistantChat } from "@/components/assistant-chat";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { toDisplayMessages } from "@/lib/assistant-display";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

export const metadata = { title: "AI assistant" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminAssistantPage() {
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/assistant", "en", "admin.requests.read"),
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
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en" workspace>
      <AssistantChat
        backHref="/en/admin/support"
        backLabel="Conversations"
        csrfToken={csrfToken}
        endpoint="/api/admin/assistant"
        greeting={`Hi ${principal.displayName}! Ask me about any student, request, or conversation, stale requests, or service health.`}
        initialMessages={initialMessages}
        locale="en"
        placeholder="Type your question… e.g. find student Ahmed"
        title="AI Assistant"
        variant="full"
      />
    </AdminShell>
  );
}
