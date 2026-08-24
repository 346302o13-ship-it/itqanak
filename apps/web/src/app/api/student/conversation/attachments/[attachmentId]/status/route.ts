import type { NextRequest } from "next/server";

import { unifiedAttachmentStatusRoute } from "@/lib/unified-attachment-routes";

interface RouteContext {
  readonly params: Promise<{ readonly attachmentId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  return unifiedAttachmentStatusRoute(request, (await context.params).attachmentId);
}
