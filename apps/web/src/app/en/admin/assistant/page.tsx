import { AdminShell } from "@/components/admin-shell";
import { AssistantChat } from "@/components/assistant-chat";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";

export const metadata = { title: "AI assistant" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminAssistantPage() {
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/assistant", "en", "admin.requests.read"),
    csrfTokenForPage(),
  ]);
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en" workspace>
      <AssistantChat
        csrfToken={csrfToken}
        endpoint="/api/admin/assistant"
        greeting={`Hi ${principal.displayName}! Ask me about any student, request, or conversation, stale requests, or service health.`}
        locale="en"
        placeholder="Type your question… e.g. find student Ahmed"
        title="AI Assistant"
        variant="full"
      />
    </AdminShell>
  );
}
