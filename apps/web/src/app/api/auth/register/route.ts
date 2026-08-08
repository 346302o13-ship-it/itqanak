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
  try {
    const { formData, context } = await assertProtectedForm(request);
    const password = formValue(formData, "password");
    if (password !== formValue(formData, "passwordConfirmation")) {
      return redirectTo(config, "/ar/auth/register", "failed");
    }
    const runtime = await createAuthRuntime(true);
    try {
      await runtime.auth.registerStudent({
        ...context,
        displayName: formValue(formData, "displayName"),
        email: formValue(formData, "email"),
        password,
        acceptedTerms: formValue(formData, "acceptedTerms") === "on",
        acceptedPrivacy: formValue(formData, "acceptedPrivacy") === "on",
        termsVersion: formValue(formData, "termsVersion"),
        privacyVersion: formValue(formData, "privacyVersion"),
      });
      // Intentionally identical for a newly created or already registered address.
      return redirectTo(config, "/ar/auth/login", "account_created");
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, "/ar/auth/register", statusForAuthError(error));
  }
}
