import type { NextRequest } from "next/server";

import { messageReactionRoute } from "@/lib/reaction-routes";

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string; readonly messageId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { studentUserId, messageId } = await context.params;
  return messageReactionRoute(request, { messageId, studentUserId });
}
