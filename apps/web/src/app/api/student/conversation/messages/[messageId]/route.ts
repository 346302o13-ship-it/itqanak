import type { NextRequest } from "next/server";

import { messageRevisionRoute } from "@/lib/message-revision-routes";

interface RouteContext {
  readonly params: Promise<{ readonly messageId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { messageId } = await context.params;
  return messageRevisionRoute(request, "edit", { messageId });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { messageId } = await context.params;
  return messageRevisionRoute(request, "delete", { messageId });
}
