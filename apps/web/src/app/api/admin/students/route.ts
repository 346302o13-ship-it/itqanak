import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  CsrfError,
  isPhoneCountryCode,
  RegistrationError,
} from "@itqanak/auth";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { adminFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface StudentDraft {
  readonly displayName: string;
  readonly phone: string;
  readonly countryCode: string;
  readonly whatsappReference: string;
  readonly note: string;
}

/**
 * Bounce back to the create-student form keeping the non-secret fields the
 * admin typed, so a rejected phone or reference does not wipe the whole form.
 */
function studentFormFailure(
  adminAppUrl: string,
  locale: "ar" | "en",
  draft: StudentDraft,
): NextResponse {
  const destination = new URL(`/${locale}/admin/students`, adminAppUrl);
  destination.searchParams.set("notice", "invalid");
  if (draft.displayName) destination.searchParams.set("sn", draft.displayName.slice(0, 120));
  if (draft.phone) destination.searchParams.set("sp", draft.phone.slice(0, 24));
  if (draft.countryCode) destination.searchParams.set("sc", draft.countryCode.slice(0, 8));
  if (draft.whatsappReference)
    destination.searchParams.set("sr", draft.whatsappReference.slice(0, 160));
  if (draft.note) destination.searchParams.set("snote", draft.note.slice(0, 1000));
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  let draft: StudentDraft = {
    displayName: "",
    phone: "",
    countryCode: "",
    whatsappReference: "",
    note: "",
  };
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/students`;
    draft = {
      displayName: formValue(protectedForm.formData, "displayName"),
      phone: formValue(protectedForm.formData, "phone"),
      countryCode: formValue(protectedForm.formData, "countryCode"),
      whatsappReference: formValue(protectedForm.formData, "whatsappReference"),
      note: formValue(protectedForm.formData, "note").trim(),
    };
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      if (
        !isPhoneCountryCode(draft.countryCode) ||
        formValue(protectedForm.formData, "confirmedSameNumber") !== "true"
      ) {
        return studentFormFailure(adminAppUrl, locale, draft);
      }
      const created = await runtime.auth.createStudentByAdmin(
        principal,
        {
          displayName: draft.displayName,
          phone: draft.phone,
          countryCode: draft.countryCode,
          whatsappReference: draft.whatsappReference,
          ...(draft.note.length === 0 ? {} : { note: draft.note }),
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
    if (error instanceof CsrfError) {
      return adminFormErrorResponse(
        request,
        error,
        requestId,
        `/${locale}/admin/students`,
        adminAppUrl,
      );
    }
    // createStudentByAdmin rejects a duplicate phone / bad reference with an
    // AuthenticationError or RegistrationError; keep the typed fields either way.
    if (error instanceof AuthenticationError || error instanceof RegistrationError) {
      return studentFormFailure(adminAppUrl, locale, draft);
    }
    return adminFormErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/admin/students`,
      adminAppUrl,
    );
  }
}
