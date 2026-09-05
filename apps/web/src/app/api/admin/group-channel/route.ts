import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { enforceReadRateLimit, readRateLimitRules } from "@/lib/read-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

const noStore = (requestId: string) => ({
  "Cache-Control": "no-store",
  "X-Request-ID": requestId,
});

function forbidden(requestId: string): NextResponse {
  return NextResponse.json(
    { error: "REQUEST_FORBIDDEN" },
    { status: 403, headers: noStore(requestId) },
  );
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const runtime = await createStudentRequestRuntime();
  try {
    const principal = await principalForRequest(runtime, request);
    if (principal === undefined) return requestUnauthorizedResponse(requestId);
    if (!principal.roles.includes("ADMIN")) return forbidden(requestId);
    await enforceReadRateLimit(readRateLimitRules.conversationPoll, principal.userId);
    const view = await runtime.groupChannel.getView(principal);
    return NextResponse.json(view, { headers: noStore(requestId) });
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  } finally {
    await runtime.close();
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      if (!principal.roles.includes("ADMIN")) return forbidden(requestId);
      const result = await runtime.groupChannel.post(
        principal,
        {
          body: protectedForm.formData.get("body"),
          clientMessageId: protectedForm.formData.get("clientMessageId"),
        },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.json(result, {
        status: result.idempotentReplay ? 200 : 201,
        headers: noStore(requestId),
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
