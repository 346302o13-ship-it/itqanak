import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface ReadRouteContext {
  readonly params: Promise<{ readonly requestNumber: string }>;
}

export async function POST(request: NextRequest, context: ReadRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ requestNumber }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestUnauthorizedResponse(requestId);
      }
      const result = await runtime.chat.markConversationRead(principal, requestNumber, {
        ...protectedForm.context,
        requestId,
      });
      return NextResponse.json(
        { updatedMessageCount: result.updatedMessageCount, requestId },
        { headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
