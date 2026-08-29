import { AuthenticationError } from "@itqanak/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { appUrl, statusForAuthError } from "@/lib/auth-responses";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly requestId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = "ar";
  try {
    const [{ requestId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/approvals?tab=reset`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined)
        return requestFormUnauthorizedResponse(
          request,
          "password-reset-issue",
          fallback,
          config.adminAppUrl,
        );
      if (
        formValue(protectedForm.formData, "confirmedSameNumber") !== "true" ||
        formValue(protectedForm.formData, "confirmedReference") !== "true"
      ) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      const note = formValue(protectedForm.formData, "note").trim();
      const issued = await runtime.auth.issuePhonePasswordReset(
        principal,
        requestId,
        {
          publicReference: formValue(protectedForm.formData, "studentReference"),
          whatsappReference: formValue(protectedForm.formData, "whatsappReference"),
          ...(note.length === 0 ? {} : { note }),
        },
        protectedForm.context,
      );
      const destination = new URL(`/${locale}/admin/password-resets/issued`, config.adminAppUrl);
      destination.searchParams.set("request", issued.request.id);
      destination.hash = new URLSearchParams({ token: issued.token }).toString();
      const response = NextResponse.redirect(destination, 303);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const destination = appUrl(
      config,
      `/${locale}/admin/approvals?tab=reset`,
      statusForAuthError(error),
      "admin",
    );
    destination.searchParams.set(
      "notice",
      error instanceof AuthenticationError && error.code === "TOKEN_EXPIRED" ? "expired" : "failed",
    );
    return NextResponse.redirect(destination, 303);
  }
}
