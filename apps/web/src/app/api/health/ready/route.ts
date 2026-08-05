import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRequestId } from "../../../../lib/request-id";
import { checkReadiness } from "../../../../lib/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const result = await checkReadiness(requestId);
  return NextResponse.json(
    { status: result.ready ? "ready" : "not_ready", checks: result.checks },
    {
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      status: result.ready ? 200 : 503,
    },
  );
}
