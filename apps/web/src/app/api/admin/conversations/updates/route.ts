import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";
import { conversationListInput, jsonReady } from "@/lib/unified-http";

/**
 * Lightweight authenticated polling endpoint. Permission checks are identical
 * to the audited list view, but routine refreshes deliberately do not append a
 * security-audit row every few seconds.
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const result = await runtime.unifiedConversations.listConversations(
        principal,
        conversationListInput(request.nextUrl.searchParams),
        {},
        { recordAudit: false },
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
