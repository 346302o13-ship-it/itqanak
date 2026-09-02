import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { adminFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/requests/pending?view=archived`;
    const targetId = formValue(protectedForm.formData, "requestId");
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      await runtime.adminRequests.restorePendingRequest(principal, targetId, {
        ...protectedForm.context,
        requestId,
      });
      const destination = new URL(
        `/${locale}/admin/requests/pending`,
        protectedForm.config.adminAppUrl,
      );
      destination.searchParams.set("view", "archived");
      destination.searchParams.set("notice", "restored");
      return NextResponse.redirect(destination, 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return adminFormErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/admin/requests/pending?view=archived`,
      adminAppUrl,
    );
  }
}
