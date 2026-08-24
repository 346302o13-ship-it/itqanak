import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue } from "@/lib/auth-runtime";
import { enforceMessageSendRateLimit } from "@/lib/message-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly conversationId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ conversationId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createStudentRequestRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceMessageSendRateLimit(runtime.rateLimiter, principal.userId);
      const result = await runtime.support.sendMessage(
        principal,
        conversationId,
        {
          body: formValue(protectedForm.formData, "body"),
          clientMessageId: formValue(protectedForm.formData, "clientMessageId"),
        },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.json(
        { messageId: result.message.id, requestId },
        { status: result.idempotentReplay ? 200 : 201, headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
