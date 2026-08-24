import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
} from "@/lib/auth-runtime";
import { loginUrl, redirectTo, statusForAuthError } from "@/lib/auth-responses";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let locale: "ar" | "en" = "ar";
  try {
    const { formData, context } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    const accountPath = `/${locale}/account`;
    const runtime = await createAuthRuntime(true);
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return NextResponse.redirect(loginUrl(config, accountPath), 303);
      }
      await runtime.auth.updateDisplayName(principal, formValue(formData, "displayName"), context);
      return redirectTo(config, accountPath, "profile_saved");
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, `/${locale}/account`, statusForAuthError(error));
  }
}
