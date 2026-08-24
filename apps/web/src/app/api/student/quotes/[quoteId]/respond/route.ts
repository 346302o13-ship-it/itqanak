import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";
import { jsonReady, quoteResponseInput } from "@/lib/unified-http";

interface RouteContext {
  readonly params: Promise<{ readonly quoteId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ quoteId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const result = await runtime.quotes.respondToQuote(
        principal,
        quoteId,
        quoteResponseInput(protectedForm.formData),
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
