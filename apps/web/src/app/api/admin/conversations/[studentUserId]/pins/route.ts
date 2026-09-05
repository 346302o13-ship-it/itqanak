import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { enforceReadRateLimit, readRateLimitRules } from "@/lib/read-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";
import { jsonReady } from "@/lib/unified-http";

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const { studentUserId } = await context.params;
  const runtime = await createStudentRequestRuntime();
  try {
    const principal = await principalForRequest(runtime, request);
    if (principal === undefined) return requestUnauthorizedResponse(requestId);
    await enforceReadRateLimit(readRateLimitRules.conversationPoll, principal.userId);
    const conversation = await runtime.unifiedConversations.openConversationForStudent(
      principal,
      studentUserId,
    );
    const items = await runtime.unifiedConversations.listPinnedMessages(principal, conversation.id);
    return NextResponse.json(jsonReady({ items }), {
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    });
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  } finally {
    await runtime.close();
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
      const conversation = await runtime.unifiedConversations.openConversationForStudent(
        principal,
        studentUserId,
      );
      const messageId = String(protectedForm.formData.get("messageId") ?? "");
      const action = String(protectedForm.formData.get("action") ?? "");
      if (action === "unpin") {
        await runtime.unifiedConversations.unpinMessage(principal, conversation.id, messageId);
      } else {
        await runtime.unifiedConversations.pinMessage(principal, conversation.id, messageId);
      }
      const items = await runtime.unifiedConversations.listPinnedMessages(
        principal,
        conversation.id,
      );
      return NextResponse.json(jsonReady({ items }), {
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
