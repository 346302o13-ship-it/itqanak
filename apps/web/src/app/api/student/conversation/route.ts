import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requestAuditContext } from "@/lib/auth-runtime";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";
import { jsonReady } from "@/lib/unified-http";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const conversation = await runtime.unifiedConversations.getOrCreateOwnConversation(
        principal,
        { ...(await requestAuditContext(request)), requestId },
      );
      return NextResponse.json(
        { conversation: jsonReady(conversation) },
        { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
