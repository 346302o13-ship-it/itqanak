import type { NextRequest } from "next/server";

import { groupChannelStreamResponse } from "@/lib/group-channel-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: NextRequest): Promise<Response> {
  return groupChannelStreamResponse(request, "student");
}
