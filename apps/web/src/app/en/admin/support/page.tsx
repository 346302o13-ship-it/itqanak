import type { UnifiedConversationDetail, UnifiedMessageListResult } from "@itqanak/requests";

import { AdminShell } from "@/components/admin-shell";
import { UnifiedChatWorkspace } from "@/components/unified-chat-workspace";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface PageProps {
  readonly searchParams: Promise<{
    readonly conversation?: string | readonly string[];
    readonly q?: string | readonly string[];
    readonly request?: string | readonly string[];
    readonly student?: string | readonly string[];
  }>;
}

export const metadata = { title: "Unified conversation center" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminSupportPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/support", "en", "admin.conversations.read"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : undefined;
  const requestedStudent = typeof query.student === "string" ? query.student : undefined;
  const requestedConversation =
    typeof query.conversation === "string" ? query.conversation : undefined;
  const requestedRequestId = typeof query.request === "string" ? query.request : undefined;
  const runtime = await createStudentRequestRuntime();
  let list;
  let conversation: UnifiedConversationDetail | undefined;
  let messages: UnifiedMessageListResult = {
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
    pageCount: 1,
  };
  let maximumBytes;
  try {
    list = await runtime.unifiedConversations.listConversations(principal, {
      pageSize: 100,
      ...(search === undefined || search.length === 0 ? {} : { search }),
    });
    if (requestedStudent !== undefined) {
      conversation = await runtime.unifiedConversations.openConversationForStudent(
        principal,
        requestedStudent,
      );
    } else if (requestedConversation !== undefined) {
      conversation = await runtime.unifiedConversations.getConversation(
        principal,
        requestedConversation,
      );
    } else if (list.items[0] !== undefined) {
      conversation = await runtime.unifiedConversations.openConversationForStudent(
        principal,
        list.items[0].studentUserId,
      );
    }
    if (conversation !== undefined) {
      messages = await runtime.unifiedConversations.listMessages(principal, conversation.id, {
        page: 1,
        pageSize: 100,
      });
    }
    maximumBytes = runtime.config.storage.maxFileBytes;
  } finally {
    await runtime.close();
  }
  const selectedRequestId = conversation?.requests.some(
    (request) => request.id === requestedRequestId,
  )
    ? requestedRequestId
    : undefined;
  const conversationItems =
    conversation === undefined || list.items.some((item) => item.id === conversation.id)
      ? list.items
      : [conversation, ...list.items];
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en" workspace>
      <UnifiedChatWorkspace
        conversations={conversationItems}
        csrfToken={csrfToken}
        initialMessagePage={messages}
        locale="en"
        maximumBytes={maximumBytes}
        mode="admin"
        {...(conversation === undefined ? {} : { conversation })}
        {...(search === undefined ? {} : { search })}
        {...(selectedRequestId === undefined ? {} : { selectedRequestId })}
      />
    </AdminShell>
  );
}
