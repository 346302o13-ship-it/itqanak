import type { NextRequest } from "next/server";

import { isPhoneCountryCode } from "@itqanak/auth";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
} from "@/lib/auth-runtime";
import { redirectTo, statusForAuthError } from "@/lib/auth-responses";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = request.nextUrl.searchParams.get("locale") === "en" ? "en" : "ar";
  try {
    const { formData, context } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    const password = formValue(formData, "password");
    if (password !== formValue(formData, "passwordConfirmation")) {
      return redirectTo(config, `/${locale}/auth/register`, "failed");
    }
    const email = formValue(formData, "email");
    const phone = formValue(formData, "phone");
    if (email.trim().length === 0 || phone.trim().length === 0) {
      return redirectTo(config, `/${locale}/auth/register`, "failed");
    }
    const countryValue = formValue(formData, "countryCode");
    if (!isPhoneCountryCode(countryValue)) {
      return redirectTo(config, `/${locale}/auth/register`, "failed");
    }
    const runtime = await createAuthRuntime(true);
    try {
      const result = await runtime.auth.registerStudent({
        ...context,
        displayName: formValue(formData, "displayName"),
        email,
        phone,
        countryCode: countryValue,
        password,
        acceptedTerms: formValue(formData, "acceptedTerms") === "on",
        acceptedPrivacy: formValue(formData, "acceptedPrivacy") === "on",
        termsVersion: formValue(formData, "termsVersion"),
        privacyVersion: formValue(formData, "privacyVersion"),
      });
      // Intentionally identical for a newly created or already registered identity.
      return result.verificationMethod === "PHONE"
        ? redirectTo(config, `/${locale}/auth/pending-phone-verification`, "account_created")
        : redirectTo(config, `/${locale}/auth/login`, "account_created");
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, `/${locale}/auth/register`, statusForAuthError(error));
  }
}
