import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, createAuthRuntime, formValue } from "@/lib/auth-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

/** Remove one browser's Web Push subscription for the signed-in user. */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const endpoint = formValue(protectedForm.formData, "endpoint").trim();
    const app = await createAuthRuntime();
    try {
      const principal = await principalForRequest(app, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      if (endpoint.length > 0) {
        await app.database`
          DELETE FROM push_subscriptions
          WHERE endpoint = ${endpoint} AND user_id = ${principal.userId}
        `;
      }
      return NextResponse.json(
        { ok: true },
        { status: 200, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await app.close();
    }
  } catch {
    return NextResponse.json(
      { message: "unsubscribe_failed" },
      { status: 400, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  }
}
