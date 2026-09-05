import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

function forbidden(requestId: string): NextResponse {
  return NextResponse.json(
    { error: "REQUEST_FORBIDDEN" },
    { status: 403, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const runtime = await createStudentRequestRuntime();
  try {
    const principal = await principalForRequest(runtime, request);
    if (principal === undefined) return requestUnauthorizedResponse(requestId);
    if (!principal.roles.includes("ADMIN")) return forbidden(requestId);
    const items = await runtime.adminQuickReplies.list(principal.userId);
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
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
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      if (!principal.roles.includes("ADMIN")) return forbidden(requestId);
      const created = await runtime.adminQuickReplies.create(principal.userId, {
        title: protectedForm.formData.get("title"),
        body: protectedForm.formData.get("body"),
      });
      return NextResponse.json(
        { item: created },
        { status: 201, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
