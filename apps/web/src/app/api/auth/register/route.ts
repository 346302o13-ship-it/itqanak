import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  CsrfError,
  RegistrationError,
  isPhoneCountryCode,
} from "@itqanak/auth";
import type { AppConfig } from "@itqanak/config";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
} from "@/lib/auth-runtime";
import { appUrl, redirectTo } from "@/lib/auth-responses";
import type { RegisterErrorCode } from "@/lib/register-form-errors";

interface TypedValues {
  readonly displayName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly countryCode?: string;
}

/**
 * Send the visitor back to the form with a specific error code and the
 * non-secret values they already typed, so nothing has to be re-entered.
 * Passwords are never echoed.
 */
function registerFailure(
  config: AppConfig,
  locale: "ar" | "en",
  code: RegisterErrorCode,
  values: TypedValues,
): NextResponse {
  const url = appUrl(config, `/${locale}/auth/register`);
  url.searchParams.set("e", code);
  if (values.displayName) url.searchParams.set("n", values.displayName.slice(0, 120));
  if (values.email) url.searchParams.set("m", values.email.slice(0, 320));
  if (values.phone) url.searchParams.set("p", values.phone.slice(0, 24));
  if (values.countryCode) url.searchParams.set("c", values.countryCode.slice(0, 8));
  return NextResponse.redirect(url, 303);
}

function codeForRegistrationError(error: RegistrationError): RegisterErrorCode {
  switch (error.code) {
    case "INVALID_EMAIL":
      return "email";
    case "EMAIL_ALREADY_REGISTERED":
      return "email_taken";
    case "INVALID_PHONE":
      return "phone";
    case "LEGAL_CONSENT_REQUIRED":
    case "LEGAL_CONSENT_VERSION_MISMATCH":
      return "consent";
    default:
      return "failed";
  }
}

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = request.nextUrl.searchParams.get("locale") === "en" ? "en" : "ar";
  let values: TypedValues = {};
  try {
    const { formData, context } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    const displayName = formValue(formData, "displayName");
    const email = formValue(formData, "email");
    const phone = formValue(formData, "phone");
    const countryValue = formValue(formData, "countryCode");
    values = { displayName, email, phone, countryCode: countryValue };

    const password = formValue(formData, "password");
    if (password.length < 12 || password.length > 128) {
      return registerFailure(config, locale, "pw_weak", values);
    }
    if (password !== formValue(formData, "passwordConfirmation")) {
      return registerFailure(config, locale, "pw_mismatch", values);
    }
    if (email.trim().length === 0) {
      return registerFailure(config, locale, "email", values);
    }
    if (phone.trim().length === 0) {
      return registerFailure(config, locale, "phone", values);
    }
    if (!isPhoneCountryCode(countryValue)) {
      return registerFailure(config, locale, "country", values);
    }
    if (
      formValue(formData, "acceptedTerms") !== "on" ||
      formValue(formData, "acceptedPrivacy") !== "on"
    ) {
      return registerFailure(config, locale, "consent", values);
    }

    const runtime = await createAuthRuntime(true);
    try {
      const result = await runtime.auth.registerStudent({
        ...context,
        displayName,
        email,
        phone,
        countryCode: countryValue,
        password,
        acceptedTerms: true,
        acceptedPrivacy: true,
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
    if (error instanceof CsrfError) {
      return registerFailure(config, locale, "csrf", values);
    }
    if (error instanceof RegistrationError) {
      return registerFailure(config, locale, codeForRegistrationError(error), values);
    }
    if (
      error instanceof AuthenticationError &&
      (error.code === "RATE_LIMITED" || error.code === "RATE_LIMIT_UNAVAILABLE")
    ) {
      return registerFailure(config, locale, "rate", values);
    }
    return registerFailure(config, locale, "failed", values);
  }
}
