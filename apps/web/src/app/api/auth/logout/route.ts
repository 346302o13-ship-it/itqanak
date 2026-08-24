import type { NextRequest } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
  sessionCookieName,
} from "@/lib/auth-runtime";
import { clearSessionCookie, redirectTo, statusForAuthError } from "@/lib/auth-responses";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = "ar";
  let application: "public" | "admin" = "public";
  try {
    const { context, formData } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    application = formValue(formData, "application") === "admin" ? "admin" : "public";
    const runtime = await createAuthRuntime();
    try {
      await runtime.auth.logout(request.cookies.get(sessionCookieName(config))?.value, context);
      const response = redirectTo(config, `/${locale}/auth/login`, "logged_out", application);
      clearSessionCookie(response, config);
      return response;
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, `/${locale}/auth/login`, statusForAuthError(error), application);
  }
}
