import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, loadWebConfig } from "@/lib/auth-runtime";
import { createDraftInput } from "@/lib/request-form";
import { requestFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const publicAppUrl = loadWebConfig().publicAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = protectedForm.formData.get("locale") === "en" ? "en" : "ar";
    const newRequestPath = `/${locale}/student/requests/new`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, newRequestPath, publicAppUrl);
      }
      const result = await runtime.requests.createDraft(
        principal,
        createDraftInput(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      const destination = new URL(
        `/${locale}/student/requests/${encodeURIComponent(result.request.requestNumber)}`,
        protectedForm.config.publicAppUrl,
      );
      destination.searchParams.set(
        "status",
        result.idempotentReplay ? "draft_exists" : "draft_created",
      );
      return NextResponse.redirect(destination, 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestFormErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/student/requests/new`,
      publicAppUrl,
    );
  }
}
