import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ studentUserId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const requestedConversationId = protectedForm.formData.get("conversationId");
      const conversationId =
        typeof requestedConversationId === "string" && requestedConversationId.trim().length > 0
          ? requestedConversationId.trim()
          : (
              await runtime.unifiedConversations.openConversationForStudent(
                principal,
                studentUserId,
              )
            ).id;
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
