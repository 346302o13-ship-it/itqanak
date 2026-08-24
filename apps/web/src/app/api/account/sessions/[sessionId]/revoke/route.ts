import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
} from "@/lib/auth-runtime";
import { clearSessionCookie, loginUrl, redirectTo, statusForAuthError } from "@/lib/auth-responses";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = "ar";
  try {
    const { context: auditContext, formData } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    const sessionsPath = `/${locale}/account/sessions`;
    const { sessionId } = await context.params;
    const runtime = await createAuthRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return NextResponse.redirect(loginUrl(config, sessionsPath), 303);
      }
      await runtime.auth.revokeSession(principal, sessionId, auditContext);
      if (sessionId === principal.sessionId) {
        const response = redirectTo(config, `/${locale}/auth/login`, "logged_out");
        clearSessionCookie(response, config);
        return response;
      }
      return redirectTo(config, sessionsPath, "session_revoked");
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, `/${locale}/account/sessions`, statusForAuthError(error));
  }
}
