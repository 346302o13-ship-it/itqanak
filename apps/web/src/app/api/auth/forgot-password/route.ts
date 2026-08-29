import { isPhoneCountryCode } from "@itqanak/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
} from "@/lib/auth-runtime";
import { appUrl, statusForAuthError, type AuthStatus } from "@/lib/auth-responses";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = "ar";
  let phone = "";
  let countryCode = "";
  const back = (status: AuthStatus): NextResponse => {
    const destination = appUrl(config, `/${locale}/auth/forgot-password`, status);
    if (countryCode) destination.searchParams.set("c", countryCode.slice(0, 8));
    if (phone.trim()) destination.searchParams.set("p", phone.trim().slice(0, 24));
    return NextResponse.redirect(destination, 303);
  };
  try {
    const { formData, context } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    countryCode = formValue(formData, "countryCode");
    phone = formValue(formData, "phone");
    if (!isPhoneCountryCode(countryCode)) {
      return back("invalid");
    }
    const runtime = await createAuthRuntime(true);
    try {
      const result = await runtime.auth.requestPhonePasswordReset({
        ...context,
        phone,
        countryCode,
      });
      const destination = appUrl(config, `/${locale}/auth/forgot-password`, "sent");
      destination.searchParams.set("reference", result.reference);
      return NextResponse.redirect(destination, 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return back(statusForAuthError(error));
  }
}
