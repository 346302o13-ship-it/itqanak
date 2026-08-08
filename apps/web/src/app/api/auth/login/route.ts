import type { NextRequest } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
  sessionCookieName,
} from "@/lib/auth-runtime";
import { redirectTo, safeNext, setSessionCookie, statusForAuthError } from "@/lib/auth-responses";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let next = "/ar/account";
  try {
    const { formData, context } = await assertProtectedForm(request);
    next = safeNext(formValue(formData, "next"));
    const runtime = await createAuthRuntime(true);
    try {
      const existing = await runtime.auth.authenticateSession(
        request.cookies.get(sessionCookieName(config))?.value,
      );
      const session = await runtime.auth.login({
        ...context,
        email: formValue(formData, "email"),
        password: formValue(formData, "password"),
        ...(existing === undefined ? {} : { priorSessionId: existing.sessionId }),
      });
      const response = redirectTo(config, next);
      setSessionCookie(response, config, session.token, session.expiresAt);
      return response;
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const destination = `/ar/auth/login?next=${encodeURIComponent(next)}`;
    return redirectTo(config, destination, statusForAuthError(error));
  }
}
