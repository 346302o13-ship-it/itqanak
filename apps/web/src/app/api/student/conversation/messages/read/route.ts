import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { enforceReadRateLimit, readRateLimitRules } from "@/lib/read-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceReadRateLimit(readRateLimitRules.readReceipt, principal.userId);
      const requestedConversationId = protectedForm.formData.get("conversationId");
      const conversationId =
        typeof requestedConversationId === "string" && requestedConversationId.trim().length > 0
          ? requestedConversationId.trim()
          : (await runtime.unifiedConversations.getOrCreateOwnConversation(principal)).id;
      const result = await runtime.unifiedConversations.markRead(principal, conversationId, {
        ...protectedForm.context,
        requestId,
      });
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
