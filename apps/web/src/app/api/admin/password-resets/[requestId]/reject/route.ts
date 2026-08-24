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
    const fallback = `/${locale}/admin/password-resets`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined)
        return requestFormUnauthorizedResponse(
          request,
          "password-reset-reject",
          fallback,
          config.adminAppUrl,
        );
      await runtime.auth.rejectPhonePasswordReset(
        principal,
        requestId,
        { reason: formValue(protectedForm.formData, "reason") },
        protectedForm.context,
      );
      const destination = appUrl(config, fallback, undefined, "admin");
      destination.searchParams.set("notice", "rejected");
      return NextResponse.redirect(destination, 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const destination = appUrl(
      config,
      `/${locale}/admin/password-resets`,
      statusForAuthError(error),
      "admin",
    );
    destination.searchParams.set("notice", "failed");
    return NextResponse.redirect(destination, 303);
  }
}
