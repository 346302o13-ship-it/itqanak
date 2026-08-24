import { Readable } from "node:stream";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requestAuditContext } from "@/lib/auth-runtime";
import { attachmentContentDisposition } from "@/lib/attachment-http";
import { attachmentIdentifier } from "@/lib/request-form";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface DownloadRouteContext {
  readonly params: Promise<{
    readonly requestNumber: string;
    readonly attachmentId: string;
  }>;
}

export async function GET(request: NextRequest, context: DownloadRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const { requestNumber, attachmentId } = await context.params;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestUnauthorizedResponse(requestId);
      }
      const auditContext = await requestAuditContext(request);
      const download = await runtime.attachments.authorizeDownload(
        principal,
        requestNumber,
        attachmentIdentifier(attachmentId),
        { ...auditContext, requestId },
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
      if (download.scanStatus === "SCAN_SKIPPED_DEVELOPMENT") {
        headers.set("Warning", '299 - "Development file: malware scan was skipped"');
        headers.set("X-Itqanak-Scan-Status", "skipped-development");
      } else if (download.scanStatus === "SCAN_SKIPPED_BY_ADMIN") {
        headers.set(
          "Warning",
          '299 - "Unscanned file: malware scanning was disabled by an administrator"',
        );
        headers.set("X-Itqanak-Scan-Status", "skipped-by-admin");
      }
      return new NextResponse(Readable.toWeb(download.body) as ReadableStream<Uint8Array>, {
        status: 200,
        headers,
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
