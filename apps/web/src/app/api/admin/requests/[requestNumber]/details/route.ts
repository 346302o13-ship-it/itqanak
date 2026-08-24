import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { adminRequestEditInput } from "@/lib/request-form";
import { adminFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly requestNumber: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  const { requestNumber } = await context.params;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/requests/${encodeURIComponent(requestNumber)}`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined)
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      await runtime.adminRequests.updateRequestDetails(
        principal,
        requestNumber,
        adminRequestEditInput(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      return NextResponse.redirect(new URL(`${fallback}?notice=details_saved`, adminAppUrl), 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const fallback = `/${locale}/admin/requests/${encodeURIComponent(requestNumber)}`;
    return adminFormErrorResponse(request, error, requestId, fallback, adminAppUrl);
  }
}
