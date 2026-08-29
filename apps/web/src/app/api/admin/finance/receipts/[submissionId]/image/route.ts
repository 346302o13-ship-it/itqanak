import { Readable } from "node:stream";

import { FinanceService } from "@itqanak/finance";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requestAuditContext } from "@/lib/auth-runtime";
import { financeErrorResponse } from "@/lib/finance-http";
import { getRequestId } from "@/lib/request-id";
import { requestUnauthorizedResponse } from "@/lib/request-http";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ readonly submissionId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const { submissionId } = await context.params;
    const app = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(app, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const finance = new FinanceService({ database: app.database });
      const receipt = await finance.getPaymentReceipt(principal, submissionId);
      const conversation = await app.unifiedConversations.openConversationForStudent(
        principal,
        receipt.studentUserId,
      );
      const download = await app.unifiedAttachments.authorizeDownload(
        principal,
        conversation.id,
        receipt.attachmentId,
        { ...(await requestAuditContext(request)), requestId },
        { requireClean: false },
      );
      return new NextResponse(Readable.toWeb(download.body) as ReadableStream<Uint8Array>, {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Content-Disposition": "inline",
          "Content-Length": String(download.contentLength),
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Content-Type": download.mimeType,
          "Cross-Origin-Resource-Policy": "same-origin",
          "X-Content-Type-Options": "nosniff",
          "X-Request-ID": requestId,
        },
      });
    } finally {
      await app.close();
    }
  } catch (error: unknown) {
    return financeErrorResponse(request, error, requestId, "/ar/admin/finance", "");
  }
}
