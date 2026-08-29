import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/request-id";
import { createMessagingRuntime } from "@/lib/messaging-runtime";
import { principalForRequest } from "@/lib/route-principal";

export const dynamic = "force-dynamic";

/** The current broadcast announcement, or null. Any signed-in user may read it. */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const runtime = await createMessagingRuntime();
  try {
    const principal = await principalForRequest(runtime, request);
    if (principal === undefined) {
      return NextResponse.json(
        { message: "unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }
    const messaging = await runtime.messaging.getRuntimeMessaging();
    return NextResponse.json(
      { announcement: messaging.announcement ?? null },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch {
    return NextResponse.json(
      { announcement: null },
      { status: 200, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  } finally {
    await runtime.close();
  }
}
