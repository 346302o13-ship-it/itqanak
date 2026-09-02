import { Readable } from "node:stream";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { loadWebConfig, requestAuditContext } from "@/lib/auth-runtime";
import { attachmentContentDisposition } from "@/lib/attachment-http";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly attachmentId: string }> },
) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  void loadWebConfig();
  try {
    const { attachmentId } = await context.params;
    const app = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(app, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const conversationId = await app.storageAdmin.resolveConversationId(principal, attachmentId);
      const download = await app.unifiedAttachments.authorizeDownload(
        principal,
        conversationId,
        attachmentId,
        { ...(await requestAuditContext(request)), requestId },
        // An admin backup copy: allow an unscanned-but-skipped file through,
        // never an infected one.
        { requireClean: false },
      );
      const headers = new Headers({
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": attachmentContentDisposition(download.filename),
        "Content-Length": String(download.contentLength),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": "application/octet-stream",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": requestId,
      });
      return new NextResponse(Readable.toWeb(download.body) as ReadableStream<Uint8Array>, {
        status: 200,
        headers,
      });
    } finally {
      await app.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
