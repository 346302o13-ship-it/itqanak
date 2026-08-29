import type { NextRequest } from "next/server";

import { messageRevisionRoute } from "@/lib/message-revision-routes";

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string; readonly messageId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { studentUserId, messageId } = await context.params;
  return messageRevisionRoute(request, "edit", { messageId, studentUserId });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { studentUserId, messageId } = await context.params;
  return messageRevisionRoute(request, "delete", { messageId, studentUserId });
}
