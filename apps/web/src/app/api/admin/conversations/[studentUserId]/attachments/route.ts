import type { NextRequest } from "next/server";

import { unifiedAttachmentUploadRoute } from "@/lib/unified-attachment-routes";

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  return unifiedAttachmentUploadRoute(request, (await context.params).studentUserId);
}
