import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { enforceMessageSendRateLimit } from "@/lib/message-rate-limit";
import { enforceReadRateLimit, readRateLimitRules } from "@/lib/read-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";
import { jsonReady, messageListInput, unifiedMessageInput } from "@/lib/unified-http";

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const { studentUserId } = await context.params;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceReadRateLimit(readRateLimitRules.conversationPoll, principal.userId);
      const requestedConversationId = request.nextUrl.searchParams.get("conversationId")?.trim();
      const conversationId =
        requestedConversationId === undefined || requestedConversationId.length === 0
          ? (
              await runtime.unifiedConversations.openConversationForStudent(
                principal,
                studentUserId,
              )
            ).id
          : requestedConversationId;
      const result = await runtime.unifiedConversations.listMessages(
        principal,
        conversationId,
        messageListInput(request.nextUrl.searchParams),
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

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ studentUserId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createStudentRequestRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceMessageSendRateLimit(runtime.rateLimiter, principal.userId);
      const conversation = await runtime.unifiedConversations.openConversationForStudent(
        principal,
        studentUserId,
      );
      const result = await runtime.unifiedConversations.sendMessage(
        principal,
        conversation.id,
        unifiedMessageInput(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      return NextResponse.json(jsonReady(result), {
        status: result.idempotentReplay ? 200 : 201,
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
