import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "./auth-runtime";
import { enforceReadRateLimit, readRateLimitRules } from "./read-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "./request-http";
import { getRequestId } from "./request-id";
import { createStudentRequestRuntime } from "./request-runtime";
import { principalForRequest } from "./route-principal";

/**
 * Toggle the caller's emoji reaction on one message. `studentUserId` selects the
 * admin path (any student's conversation); omit it for the student's own.
 */
export async function messageReactionRoute(
  request: NextRequest,
  options: { readonly messageId: string; readonly studentUserId?: string },
): Promise<NextResponse> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceReadRateLimit(readRateLimitRules.readReceipt, principal.userId);
      const conversation =
        options.studentUserId === undefined
          ? await runtime.unifiedConversations.getOrCreateOwnConversation(principal)
          : await runtime.unifiedConversations.openConversationForStudent(
              principal,
              options.studentUserId,
            );
      const result = await runtime.unifiedConversations.toggleReaction(
        principal,
        conversation.id,
        options.messageId,
        String(protectedForm.formData.get("emoji") ?? ""),
      );
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
