import type { UnifiedConversationDetail, UnifiedMessageListResult } from "@itqanak/requests";

import { AdminShell } from "@/components/admin-shell";
import { UnifiedChatWorkspace } from "@/components/unified-chat-workspace";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { toDisplayMessages } from "@/lib/assistant-display";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface PageProps {
  readonly searchParams: Promise<{
    readonly assistant?: string | readonly string[];
    readonly conversation?: string | readonly string[];
    readonly q?: string | readonly string[];
    readonly request?: string | readonly string[];
    readonly student?: string | readonly string[];
  }>;
}

export const metadata = { title: "مركز المحادثات الموحد" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/support", "ar", "admin.conversations.read"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : undefined;
  const assistantRequested = typeof query.assistant === "string";
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
    incremental: false,
  };
  let maximumBytes;
  let services: { readonly id: string; readonly name: string }[] = [];
  let assistantInitialMessages;
  try {
    const catalog = await runtime.catalog.listPublicCatalog();
    services = catalog.flatMap((category) =>
      category.services.map((service) => ({ id: service.id, name: service.nameAr })),
    );
    list = await runtime.unifiedConversations.listConversations(principal, {
      pageSize: 100,
      ...(search === undefined || search.length === 0 ? {} : { search }),
    });
    if (assistantRequested) {
      assistantInitialMessages = toDisplayMessages(
        await runtime.assistantHistory.listRecent(principal.userId),
      );
    } else if (requestedStudent !== undefined) {
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
  const explicitlySelected =
    assistantRequested || requestedStudent !== undefined || requestedConversation !== undefined;
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} workspace>
      <UnifiedChatWorkspace
        assistantGreeting={`أهلاً ${principal.displayName}! اسألني عن أي طالب أو طلب أو محادثة، أو عن الطلبات المتوقفة، أو حالة الخدمة.`}
        assistantMode={assistantRequested}
        assistantPlaceholder="اكتب سؤالك… مثال: ابحث عن الطالب أحمد"
        conversations={conversationItems}
        csrfToken={csrfToken}
        initialContactsOpen={!explicitlySelected}
        initialMessagePage={messages}
        maximumBytes={maximumBytes}
        mode="admin"
        services={services}
        {...(assistantInitialMessages === undefined ? {} : { assistantInitialMessages })}
        {...(conversation === undefined ? {} : { conversation })}
        {...(search === undefined ? {} : { search })}
        {...(selectedRequestId === undefined ? {} : { selectedRequestId })}
      />
    </AdminShell>
  );
}
