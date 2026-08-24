import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AuthenticationError, isPhoneCountryCode, RegistrationError } from "@itqanak/auth";
import { RequestDomainError } from "@itqanak/requests";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
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
      const countryCode = formValue(protectedForm.formData, "countryCode");
      if (!isPhoneCountryCode(countryCode)) throw new RequestDomainError("INVALID_REQUEST");
      if (formValue(protectedForm.formData, "confirmedSameNumber") !== "true") {
        throw new RequestDomainError("INVALID_REQUEST");
      }
      const note = formValue(protectedForm.formData, "note").trim();
      const created = await runtime.auth.createStudentByAdmin(
        principal,
        {
          displayName: formValue(protectedForm.formData, "displayName"),
          phone: formValue(protectedForm.formData, "phone"),
          countryCode,
          whatsappReference: formValue(protectedForm.formData, "whatsappReference"),
          ...(note.length === 0 ? {} : { note }),
        },
        { ...protectedForm.context, requestId },
      );
      const destination = new URL(
        `/${locale}/admin/password-resets/issued`,
        protectedForm.config.adminAppUrl,
      );
      destination.searchParams.set("request", created.recovery.request.id);
      destination.hash = new URLSearchParams({ token: created.recovery.token }).toString();
      const response = NextResponse.redirect(destination, 303);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const safeError =
      error instanceof AuthenticationError || error instanceof RegistrationError
        ? new RequestDomainError("INVALID_REQUEST")
        : error;
    return adminFormErrorResponse(
      request,
      safeError,
      requestId,
      `/${locale}/admin/students`,
      adminAppUrl,
    );
  }
}
