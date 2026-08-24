import type { NextRequest } from "next/server";

import { unifiedMessageAttachmentRoute } from "@/lib/unified-attachment-routes";

interface RouteContext {
  readonly params: Promise<{ readonly messageId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  return unifiedMessageAttachmentRoute(request, (await context.params).messageId, true);
}
