import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
} from "@/lib/auth-runtime";
import { loginUrl, redirectTo, setSessionCookie, statusForAuthError } from "@/lib/auth-responses";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  try {
    const { formData, context } = await assertProtectedForm(request);
    const password = formValue(formData, "newPassword");
    if (password !== formValue(formData, "passwordConfirmation")) {
      return redirectTo(config, "/ar/account/security", "failed");
    }
    const runtime = await createAuthRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return NextResponse.redirect(loginUrl(config, "/ar/account/security"), 303);
      }
      const session = await runtime.auth.changePassword({
        ...context,
        principal,
        currentPassword: formValue(formData, "currentPassword"),
        newPassword: password,
      });
      const response = redirectTo(config, "/ar/account/security", "password_changed");
      setSessionCookie(response, config, session.token, session.expiresAt);
      return response;
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, "/ar/account/security", statusForAuthError(error));
  }
}
