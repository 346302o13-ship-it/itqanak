import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { RequestDomainError } from "@itqanak/requests";
import { hasPermission } from "@itqanak/auth";

import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface StatusRouteContext {
  readonly params: Promise<{
    readonly requestNumber: string;
    readonly attachmentId: string;
  }>;
}

export async function GET(request: NextRequest, context: StatusRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const { requestNumber, attachmentId } = await context.params;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestUnauthorizedResponse(requestId);
      }
      const detail = hasPermission(principal, "admin.requests.read")
        ? await runtime.adminRequests.getAdminRequest(principal, requestNumber)
        : await runtime.requests.getStudentRequest(principal, requestNumber);
      const attachment = detail.attachments.find((candidate) => candidate.id === attachmentId);
      if (attachment === undefined) {
        throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
      }
      return NextResponse.json(
        {
          id: attachment.id,
          storageStatus: attachment.storageStatus,
          scanStatus: attachment.scanStatus,
          mimeType: attachment.detectedMimeType,
          requestId,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
