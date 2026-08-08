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
      await runtime.auth.verifyEmail(formValue(formData, "token"), context);
      return redirectTo(config, "/ar/auth/login", "verified");
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return redirectTo(config, "/ar/auth/verify-email", statusForAuthError(error));
  }
}
