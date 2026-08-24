import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { createDraftInput } from "@/lib/request-form";
import { adminFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/students`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      const result = await runtime.adminRequests.createRequestForStudent(
        principal,
        {
          ...createDraftInput(protectedForm.formData),
          studentUserId: formValue(protectedForm.formData, "studentUserId"),
          submitImmediately: formValue(protectedForm.formData, "submitImmediately") === "true",
        },
        { ...protectedForm.context, requestId },
      );
      const destination = new URL(
        `/${locale}/admin/requests/${encodeURIComponent(result.request.requestNumber)}`,
        protectedForm.config.adminAppUrl,
      );
      destination.searchParams.set(
        "notice",
        result.idempotentReplay ? "draft_exists" : "draft_created",
      );
      return NextResponse.redirect(destination, 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return adminFormErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/admin/students`,
      adminAppUrl,
    );
  }
}
