import type { NextRequest } from "next/server";

import { unifiedMessageAttachmentRoute } from "@/lib/unified-attachment-routes";

interface RouteContext {
  readonly params: Promise<{
    readonly studentUserId: string;
    readonly messageId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { studentUserId, messageId } = await context.params;
  return unifiedMessageAttachmentRoute(request, messageId, false, studentUserId);
}
