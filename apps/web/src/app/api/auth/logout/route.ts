import type { NextRequest } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  loadWebConfig,
  sessionCookieName,
} from "@/lib/auth-runtime";
import { clearSessionCookie, redirectTo, statusForAuthError } from "@/lib/auth-responses";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  try {
    const { context } = await assertProtectedForm(request);
    const runtime = await createAuthRuntime();
    try {
      await runtime.auth.logout(request.cookies.get(sessionCookieName(config))?.value, context);
      const response = redirectTo(config, "/ar/auth/login", "logged_out");
      clearSessionCookie(response, config);
      return response;
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, "/ar/auth/login", statusForAuthError(error));
  }
}
