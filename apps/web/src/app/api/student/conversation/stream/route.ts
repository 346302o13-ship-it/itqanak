import type { NextRequest } from "next/server";

import { conversationStreamResponse } from "@/lib/conversation-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: NextRequest): Promise<Response> {
  return conversationStreamResponse(request, "student");
}
