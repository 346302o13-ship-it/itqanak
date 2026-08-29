import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRequestId } from "../../../../lib/request-id";
import { checkStartupHealth } from "../../../../lib/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Container healthcheck target: cheap and honest. Unlike `/api/health/live`
 * (which is unconditionally 200) this fails when Postgres or Redis is
 * unreachable, so an orchestrator or watchdog can act on a web app that is up
 * but cannot serve.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const result = await checkStartupHealth();
  return NextResponse.json(
    { status: result.healthy ? "ok" : "degraded", checks: result.checks },
    {
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      status: result.healthy ? 200 : 503,
    },
  );
}
