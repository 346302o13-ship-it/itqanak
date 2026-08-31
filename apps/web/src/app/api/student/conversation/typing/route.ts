import type { NextRequest } from "next/server";

import { notifyTyping } from "@/lib/conversation-typing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: NextRequest): Promise<Response> {
  return notifyTyping(request, "student");
}
