import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

function forbidden(requestId: string): NextResponse {
  return NextResponse.json(
    { error: "REQUEST_FORBIDDEN" },
    { status: 403, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ id }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      if (!principal.roles.includes("ADMIN")) return forbidden(requestId);
      const updated = await runtime.adminQuickReplies.update(principal.userId, id, {
        title: protectedForm.formData.get("title"),
        body: protectedForm.formData.get("body"),
      });
      return NextResponse.json(
        { item: updated },
        { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ id }] = await Promise.all([context.params, assertProtectedForm(request)]);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      if (!principal.roles.includes("ADMIN")) return forbidden(requestId);
      await runtime.adminQuickReplies.remove(principal.userId, id);
      return NextResponse.json(
        { ok: true },
        { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
