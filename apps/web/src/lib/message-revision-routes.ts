import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue } from "./auth-runtime";
import { enforceMessageSendRateLimit } from "./message-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "./request-http";
import { getRequestId } from "./request-id";
import { createStudentRequestRuntime } from "./request-runtime";
import { principalForRequest } from "./route-principal";
import { jsonReady } from "./unified-http";

type RevisionAction = "edit" | "delete";

interface RevisionRouteOptions {
  readonly messageId: string;
  /** Present on the admin path (any student's conversation); omit for the student's own. */
  readonly studentUserId?: string;
}

/**
 * Shared handler for the sender-only edit (PATCH) and delete (DELETE) of one
 * message. Both are CSRF-protected form posts, rate-limited like a send, and
 * return the folded message so the caller can merge it immediately.
 */
export async function messageRevisionRoute(
  request: NextRequest,
  action: RevisionAction,
  options: RevisionRouteOptions,
): Promise<NextResponse> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceMessageSendRateLimit(runtime.rateLimiter, principal.userId);
      const conversation =
        options.studentUserId === undefined
          ? await runtime.unifiedConversations.getOrCreateOwnConversation(principal)
          : await runtime.unifiedConversations.openConversationForStudent(
              principal,
              options.studentUserId,
            );
      const audit = { ...protectedForm.context, requestId };
      const result =
        action === "edit"
          ? await runtime.unifiedConversations.editMessage(
              principal,
              conversation.id,
              options.messageId,
              formValue(protectedForm.formData, "body"),
              audit,
            )
          : await runtime.unifiedConversations.deleteMessage(
              principal,
              conversation.id,
              options.messageId,
              audit,
            );
      return NextResponse.json(jsonReady(result), {
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
