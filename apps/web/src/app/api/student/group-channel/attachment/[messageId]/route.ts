import type { NextRequest } from "next/server";

import { groupChannelAttachmentResponse } from "@/lib/group-channel-attachment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ readonly messageId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { messageId } = await context.params;
  return groupChannelAttachmentResponse(request, messageId);
}
