import { StudentShell } from "@/components/student-shell";
import { UnifiedChatWorkspace } from "@/components/unified-chat-workspace";
import { toDisplayMessages } from "@/lib/assistant-display";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

interface PageProps {
  readonly searchParams: Promise<{
    readonly assistant?: string | readonly string[];
    readonly request?: string | readonly string[];
  }>;
}

export const metadata = { title: "Unified conversation" };
export const dynamic = "force-dynamic";

export default async function EnglishStudentSupportPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireStudentPagePrincipal("/en/student/support", "conversations.read.own", "en"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const assistantRequested = typeof query.assistant === "string";
  const requestedRequestId = typeof query.request === "string" ? query.request : undefined;
  const runtime = await createStudentRequestRuntime();
  let conversation;
  let messages;
  let maximumBytes;
  let services: { readonly id: string; readonly name: string }[] = [];
  let assistantInitialMessages;
  try {
    conversation = await runtime.unifiedConversations.getOrCreateOwnConversation(principal);
    messages = await runtime.unifiedConversations.listMessages(principal, conversation.id, {
      page: 1,
      pageSize: 100,
    });
    maximumBytes = runtime.config.storage.maxFileBytes;
    const catalog = await runtime.catalog.listPublicCatalog();
    services = catalog.flatMap((category) =>
      category.services.map((service) => ({ id: service.id, name: service.nameEn })),
    );
    if (assistantRequested) {
      assistantInitialMessages = toDisplayMessages(
        await runtime.assistantHistory.listRecent(principal.userId),
      );
    }
  } finally {
    await runtime.close();
  }
  const selectedRequestId = conversation.requests.some(
    (request) => request.id === requestedRequestId,
  )
    ? requestedRequestId
    : undefined;
  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en" workspace>
      <UnifiedChatWorkspace
        assistantGreeting={`Hi ${principal.displayName}! Ask me about your requests, dues, or anything about using the portal.`}
        assistantMode={assistantRequested}
        assistantPlaceholder="Type your question…"
        conversation={conversation}
        csrfToken={csrfToken}
        initialMessagePage={messages}
        locale="en"
        maximumBytes={maximumBytes}
        mode="student"
        services={services}
        {...(assistantInitialMessages === undefined ? {} : { assistantInitialMessages })}
        {...(selectedRequestId === undefined ? {} : { selectedRequestId })}
      />
    </StudentShell>
  );
}
