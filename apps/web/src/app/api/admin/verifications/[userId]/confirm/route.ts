import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { RequestDomainError } from "@itqanak/requests";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { adminFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface ConfirmRouteContext {
  readonly params: Promise<{ readonly userId: string }>;
}

export async function POST(request: NextRequest, context: ConfirmRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const [{ userId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/approvals?tab=phone`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined)
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      if (formValue(protectedForm.formData, "confirmedSameNumber") !== "true") {
        throw new RequestDomainError("INVALID_REQUEST");
      }
      const note = formValue(protectedForm.formData, "note").trim();
      await runtime.auth.confirmPhoneVerification(
        principal,
        userId,
        {
          reference: formValue(protectedForm.formData, "reference"),
          ...(note.length === 0 ? {} : { note }),
        },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.redirect(
        new URL(`${fallback}&notice=verified`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const fallback = `/${locale}/admin/approvals?tab=phone`;
    return adminFormErrorResponse(request, error, requestId, fallback, adminAppUrl);
  }
}
