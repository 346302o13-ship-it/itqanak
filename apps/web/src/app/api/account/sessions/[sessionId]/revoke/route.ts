import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, createAuthRuntime, loadWebConfig } from "@/lib/auth-runtime";
import { clearSessionCookie, loginUrl, redirectTo, statusForAuthError } from "@/lib/auth-responses";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const config = loadWebConfig();
  try {
    const { context: auditContext } = await assertProtectedForm(request);
    const { sessionId } = await context.params;
    const runtime = await createAuthRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return NextResponse.redirect(loginUrl(config, "/ar/account/sessions"), 303);
      }
      await runtime.auth.revokeSession(principal, sessionId, auditContext);
      if (sessionId === principal.sessionId) {
        const response = redirectTo(config, "/ar/auth/login", "logged_out");
        clearSessionCookie(response, config);
        return response;
      }
      return redirectTo(config, "/ar/account/sessions", "session_revoked");
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, "/ar/account/sessions", statusForAuthError(error));
  }
}
