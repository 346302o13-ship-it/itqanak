import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createLogger } from "@itqanak/observability";

import { getRequestId } from "../../../lib/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Minimal sink for client-side render errors caught by error.tsx. Records only a
 * redacted, bounded signal — a pathname and Next's error digest — never the
 * error message or stack, which could carry user content.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const body = (await request.json().catch(() => ({}))) as {
      readonly pathname?: unknown;
      readonly digest?: unknown;
    };
    const pathname =
      typeof body.pathname === "string" ? body.pathname.slice(0, 512) : "unknown";
    const digest = typeof body.digest === "string" ? body.digest.slice(0, 64) : undefined;
    createLogger({ service: "web", environment: process.env.NODE_ENV || "production" }).warn(
      "client_render_error",
      { requestId, pathname, ...(digest === undefined ? {} : { digest }) },
    );
  } catch {
    // Never let error reporting throw.
  }
  return new NextResponse(null, { status: 204, headers: { "X-Request-ID": requestId } });
}
