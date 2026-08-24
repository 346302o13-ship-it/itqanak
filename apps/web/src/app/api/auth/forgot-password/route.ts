import { isPhoneCountryCode } from "@itqanak/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
} from "@/lib/auth-runtime";
import { appUrl, statusForAuthError } from "@/lib/auth-responses";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = "ar";
  try {
    const { formData, context } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    const countryCode = formValue(formData, "countryCode");
    if (!isPhoneCountryCode(countryCode)) {
      return NextResponse.redirect(
        appUrl(config, `/${locale}/auth/forgot-password`, "invalid"),
        303,
      );
    }
    const runtime = await createAuthRuntime(true);
    try {
      const result = await runtime.auth.requestPhonePasswordReset({
        ...context,
        phone: formValue(formData, "phone"),
        countryCode,
      });
      const destination = appUrl(config, `/${locale}/auth/forgot-password`, "sent");
      destination.searchParams.set("reference", result.reference);
      return NextResponse.redirect(destination, 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    const destination = appUrl(
      config,
      `/${locale}/auth/forgot-password`,
      statusForAuthError(error),
    );
    return NextResponse.redirect(destination, 303);
  }
}
