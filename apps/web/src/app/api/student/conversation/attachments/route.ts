import type { NextRequest } from "next/server";

import { unifiedAttachmentUploadRoute } from "@/lib/unified-attachment-routes";

export async function POST(request: NextRequest) {
  return unifiedAttachmentUploadRoute(request);
}
