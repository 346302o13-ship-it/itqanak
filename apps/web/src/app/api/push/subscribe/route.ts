import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, createAuthRuntime, formValue } from "@/lib/auth-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

function bounded(value: string, min: number, max: number): string | null {
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

/** Store (or refresh) one browser's Web Push subscription for the signed-in user. */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const endpoint = bounded(formValue(protectedForm.formData, "endpoint"), 12, 2048);
    const p256dh = bounded(formValue(protectedForm.formData, "p256dh"), 8, 256);
    const auth = bounded(formValue(protectedForm.formData, "auth"), 8, 256);
    const userAgent = bounded(formValue(protectedForm.formData, "userAgent"), 1, 400);
    if (endpoint === null || !endpoint.startsWith("https://") || p256dh === null || auth === null) {
      return NextResponse.json(
        { message: "invalid_subscription" },
        { status: 400, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }
    const app = await createAuthRuntime();
    try {
      const principal = await principalForRequest(app, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await app.database`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
        VALUES (${principal.userId}, ${endpoint}, ${p256dh}, ${auth}, ${userAgent})
        ON CONFLICT (endpoint) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          failure_count = 0,
          last_active_at = now()
      `;
      return NextResponse.json(
        { ok: true },
        { status: 201, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await app.close();
    }
  } catch {
    return NextResponse.json(
      { message: "subscribe_failed" },
      { status: 400, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  }
}
