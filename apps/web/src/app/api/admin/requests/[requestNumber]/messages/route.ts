import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { chatContentTypes, type ChatContentType } from "@itqanak/requests";

import { assertProtectedForm, formValue } from "@/lib/auth-runtime";
import { enforceMessageSendRateLimit } from "@/lib/message-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface MessageRouteContext {
  readonly params: Promise<{ readonly requestNumber: string }>;
}

function contentType(value: string): ChatContentType {
  return (chatContentTypes as readonly string[]).includes(value)
    ? (value as ChatContentType)
    : "TEXT";
}

export async function POST(request: NextRequest, context: MessageRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ requestNumber }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createStudentRequestRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceMessageSendRateLimit(runtime.rateLimiter, principal.userId);
      const attachmentId = formValue(protectedForm.formData, "attachmentId").trim();
      const body = formValue(protectedForm.formData, "body");
      const result = await runtime.chat.sendChatMessage(
        principal,
        requestNumber,
        {
          contentType: contentType(formValue(protectedForm.formData, "contentType")),
          ...(body.length === 0 ? {} : { body }),
          ...(attachmentId.length === 0 ? {} : { attachmentId }),
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
