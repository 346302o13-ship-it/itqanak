import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRequestId } from "../../../../lib/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: NextRequest): NextResponse {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  return NextResponse.json(
    { status: "live" },
    { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId }, status: 200 },
  );
}
