import { AuthenticationError, CsrfError } from "@itqanak/auth";
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
    const runtime = await createAuthRuntime(true);
    try {
      await runtime.auth.requestEmailVerification(formValue(formData, "email"), context);
      return redirectTo(config, "/ar/auth/resend-verification", "sent");
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    if (!(error instanceof CsrfError) && !(error instanceof AuthenticationError)) {
      // Do not let input validation identify whether an address exists.
      return redirectTo(config, "/ar/auth/resend-verification", "sent");
    }
    return redirectTo(config, "/ar/auth/resend-verification", statusForAuthError(error));
  }
}
