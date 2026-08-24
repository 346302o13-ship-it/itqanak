import type { NextRequest } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
} from "@/lib/auth-runtime";
import { redirectTo, statusForAuthError } from "@/lib/auth-responses";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = "ar";
  try {
    const { formData, context } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    const password = formValue(formData, "password");
    if (password !== formValue(formData, "passwordConfirmation")) {
      return redirectTo(config, `/${locale}/auth/reset-password`, "failed");
    }
    const runtime = await createAuthRuntime(true);
    try {
      await runtime.auth.resetPassword({
        ...context,
        token: formValue(formData, "token"),
        password,
      });
      return redirectTo(config, `/${locale}/auth/login`, "password_reset");
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, `/${locale}/auth/reset-password`, statusForAuthError(error));
  }
}
