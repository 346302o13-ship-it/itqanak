import type { UnifiedConversationDetail, UnifiedMessageListResult } from "@itqanak/requests";
import type { ReactNode } from "react";

import { GroupChannelPane } from "@/components/group-channel-pane";
import { StudentChatLayout } from "@/components/student-chat-layout";
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
    readonly view?: string | readonly string[];
  }>;
}

export const metadata = { title: "Conversations" };
export const dynamic = "force-dynamic";

export default async function EnglishStudentSupportPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireStudentPagePrincipal("/en/student/support", "conversations.read.own", "en"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const view = typeof query.view === "string" ? query.view : undefined;
  const assistantRequested = typeof query.assistant === "string";
  const active: "admin" | "assistant" | "group" =
    view === "group" ? "group" : assistantRequested ? "assistant" : "admin";
  const showListOnMobile = view === undefined && !assistantRequested;
  const requestedRequestId = typeof query.request === "string" ? query.request : undefined;
  const backHref = "/en/student/support";

  const runtime = await createStudentRequestRuntime();
  let groupUnread = 0;
  let groupOpen = false;
  let conversation: UnifiedConversationDetail | undefined;
  let messages: UnifiedMessageListResult | undefined;
  let maximumBytes: number | undefined;
  let services: { readonly id: string; readonly name: string }[] = [];
  let assistantInitialMessages;
  try {
    const groupView = await runtime.groupChannel.getView(principal);
    groupUnread = groupView.unreadCount;
    groupOpen = groupView.membersCanPost;
    if (active !== "group") {
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
    }
  } finally {
    await runtime.close();
  }

  const layout = (pane: ReactNode) => (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en" workspace>
      <StudentChatLayout
        active={active}
        groupOpen={groupOpen}
        groupUnread={groupUnread}
        locale="en"
        showListOnMobile={showListOnMobile}
      >
        {pane}
      </StudentChatLayout>
    </StudentShell>
  );

  if (active === "group") {
    return layout(
      <GroupChannelPane
        apiBase="/api/student/group-channel"
        backHref={backHref}
        csrfToken={csrfToken}
        locale="en"
      />,
    );
  }

  if (conversation === undefined || messages === undefined || maximumBytes === undefined) {
    throw new Error("student conversation failed to load");
  }
  const selectedRequestId = conversation.requests.some(
    (request) => request.id === requestedRequestId,
  )
    ? requestedRequestId
    : undefined;
  return layout(
    <UnifiedChatWorkspace
      assistantGreeting={`Hi ${principal.displayName}! Ask me about your requests, dues, or anything about using the portal.`}
      assistantMode={assistantRequested}
      assistantPlaceholder="Type your question…"
      backHrefOverride={backHref}
      conversation={conversation}
      csrfToken={csrfToken}
      initialMessagePage={messages}
      locale="en"
      maximumBytes={maximumBytes}
      mode="student"
      services={services}
      {...(assistantInitialMessages === undefined ? {} : { assistantInitialMessages })}
      {...(selectedRequestId === undefined ? {} : { selectedRequestId })}
    />,
  );
}
