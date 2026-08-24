import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, loadWebConfig } from "@/lib/auth-runtime";
import { attachmentIdentifier, requestVersion } from "@/lib/request-form";
import { requestFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface DeleteAttachmentRouteContext {
  readonly params: Promise<{
    readonly requestNumber: string;
    readonly attachmentId: string;
  }>;
}

export async function POST(request: NextRequest, context: DeleteAttachmentRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const publicAppUrl = loadWebConfig().publicAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const [{ requestNumber, attachmentId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    locale = protectedForm.formData.get("locale") === "en" ? "en" : "ar";
    const detailPath = `/${locale}/student/requests/${encodeURIComponent(requestNumber)}`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, detailPath, publicAppUrl);
      }
      await runtime.attachments.deleteAttachment(
        principal,
        requestNumber,
        attachmentIdentifier(attachmentId),
        requestVersion(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      const destination = new URL(
        `${detailPath}?status=attachment_deleted`,
        protectedForm.config.publicAppUrl,
      );
      return NextResponse.redirect(destination, 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const { requestNumber } = await context.params;
    return requestFormErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/student/requests/${encodeURIComponent(requestNumber)}`,
      publicAppUrl,
    );
  }
}
