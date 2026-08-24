import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue } from "@/lib/auth-runtime";
import { enforceMessageSendRateLimit } from "@/lib/message-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceMessageSendRateLimit(runtime.rateLimiter, principal.userId);
      const conversation = await runtime.support.getOrCreateOwnConversation(principal, {
        ...protectedForm.context,
        requestId,
      });
      const result = await runtime.support.sendMessage(
        principal,
        conversation.id,
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
