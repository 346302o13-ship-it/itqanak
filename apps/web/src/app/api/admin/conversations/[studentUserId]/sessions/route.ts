import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
    if (!principal.roles.includes("ADMIN")) {
      return NextResponse.json(
        { error: "REQUEST_FORBIDDEN" },
        { status: 403, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }
    await enforceReadRateLimit(readRateLimitRules.conversationPoll, principal.userId);
    const sessions = await runtime.unifiedConversations.listStudentSessions(
      principal,
      studentUserId,
    );
    return NextResponse.json(jsonReady({ sessions }), {
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    });
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  } finally {
    await runtime.close();
  }
}
