import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { adminFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createOperationsRuntime } from "@/lib/operations-runtime";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly eventId: string }> },
) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/monitoring/autobox`;
    const { eventId } = await context.params;
    const app = await createOperationsRuntime();
    try {
      const principal = await principalForRequest(app, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      await app.outboxMonitor.retryEvent(principal, eventId, {
        ...protectedForm.context,
        requestId,
      });
      const destination = new URL(fallback, protectedForm.config.adminAppUrl);
      destination.searchParams.set("notice", "retried");
      return NextResponse.redirect(destination, 303);
    } finally {
      await app.close();
    }
  } catch (error: unknown) {
    return adminFormErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/admin/monitoring/autobox`,
      adminAppUrl,
    );
  }
}
