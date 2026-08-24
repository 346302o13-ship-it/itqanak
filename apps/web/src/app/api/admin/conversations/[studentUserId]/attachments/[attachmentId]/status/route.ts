import type { NextRequest } from "next/server";

import { unifiedAttachmentStatusRoute } from "@/lib/unified-attachment-routes";

interface RouteContext {
  readonly params: Promise<{
    readonly studentUserId: string;
    readonly attachmentId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { studentUserId, attachmentId } = await context.params;
  return unifiedAttachmentStatusRoute(request, attachmentId, studentUserId);
}
