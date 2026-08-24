import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import {
  adminFormErrorResponse,
  positiveVersion,
  requestFormUnauthorizedResponse,
} from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface AssignRouteContext {
  readonly params: Promise<{ readonly requestNumber: string }>;
}

export async function POST(request: NextRequest, context: AssignRouteContext) {
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
      const assignee = formValue(protectedForm.formData, "adminUserId");
      await runtime.adminRequests.assignRequest(
        principal,
        requestNumber,
        {
          expectedVersion: positiveVersion(protectedForm.formData.get("version")),
          adminUserId: assignee === "self" ? principal.userId : null,
        },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.redirect(
        new URL(`${fallback}?notice=assigned`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const fallback = `/${locale}/admin/requests/${encodeURIComponent(requestNumber)}`;
    return adminFormErrorResponse(request, error, requestId, fallback, adminAppUrl);
  }
}
