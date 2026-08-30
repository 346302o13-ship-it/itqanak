import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@itqanak/auth";

import { createAuthRuntime } from "@/lib/auth-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string }>;
}

/** Most recent activity on a live session of one student (admin presence dot). */
export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const { studentUserId } = await context.params;
  const app = await createAuthRuntime();
  try {
    const principal = await principalForRequest(app, request);
    if (principal === undefined) return requestUnauthorizedResponse(requestId);
    requireAdmin(principal);
    if (!UUID.test(studentUserId)) {
      return NextResponse.json(
        { lastSeenAt: null },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const rows = await app.database<{ readonly last_seen: Date | string | null }[]>`
      SELECT max(last_seen_at) AS last_seen
      FROM user_sessions
      WHERE user_id = ${studentUserId} AND revoked_at IS NULL AND expires_at > now()
    `;
    const value = rows[0]?.last_seen ?? null;
    return NextResponse.json(
      { lastSeenAt: value === null ? null : new Date(value).toISOString() },
      { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  } catch {
    return NextResponse.json(
      { lastSeenAt: null },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await app.close();
  }
}
