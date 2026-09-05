import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "@/lib/auth-runtime";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      if (!principal.roles.includes("ADMIN")) {
        return NextResponse.json(
          { error: "REQUEST_FORBIDDEN" },
          { status: 403, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
        );
      }
      const membersCanPost = protectedForm.formData.get("membersCanPost") === "true";
      const expectedVersion = Number(protectedForm.formData.get("expectedVersion"));
      const result = await runtime.groupChannel.setPolicy(
        principal,
        { membersCanPost, expectedVersion },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
