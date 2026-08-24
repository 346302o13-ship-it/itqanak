import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { operationalUpdateFromForm } from "@/lib/operations-form";
import { operationsErrorResponse } from "@/lib/operations-http";
import { createOperationsRuntime } from "@/lib/operations-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/operations`;
    const runtime = await createOperationsRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      await runtime.operations.updateState(
        principal,
        operationalUpdateFromForm(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      return NextResponse.redirect(
        new URL(`${fallback}?notice=updated`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return operationsErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/admin/operations`,
      adminAppUrl,
    );
  }
}
