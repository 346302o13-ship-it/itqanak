import type { NextRequest } from "next/server";

import {
  assertProtectedForm,
  createAuthRuntime,
  formValue,
  loadWebConfig,
  sessionCookieName,
} from "@/lib/auth-runtime";
import { redirectTo, safeNext, setSessionCookie, statusForAuthError } from "@/lib/auth-responses";
import {
  CloudflareAccessError,
  cloudflareIdentityMatchesAdmin,
  type CloudflareAccessIdentity,
  verifyCloudflareAccessRequest,
} from "@/lib/cloudflare-access";

export async function POST(request: NextRequest) {
  const config = loadWebConfig();
  let next = "/ar/account";
  let locale: "ar" | "en" = request.nextUrl.searchParams.get("locale") === "en" ? "en" : "ar";
  let application: "public" | "admin" = "public";
  let cloudflareIdentity: CloudflareAccessIdentity | undefined;
  try {
    const { formData, context } = await assertProtectedForm(request);
    locale = formValue(formData, "locale") === "en" ? "en" : "ar";
    next = safeNext(formValue(formData, "next"));
    application =
      next === "/ar/admin" ||
      next.startsWith("/ar/admin/") ||
      next === "/en/admin" ||
      next.startsWith("/en/admin/")
        ? "admin"
        : "public";
    if (application === "admin") {
      cloudflareIdentity = await verifyCloudflareAccessRequest(request.headers);
    }
    const runtime = await createAuthRuntime(true);
    try {
      const existing = await runtime.auth.authenticateSession(
        request.cookies.get(sessionCookieName(config))?.value,
      );
      const session = await runtime.auth.login({
        ...context,
        identity: formValue(formData, "identity") || formValue(formData, "email"),
        password: formValue(formData, "password"),
        ...(existing === undefined ? {} : { priorSessionId: existing.sessionId }),
      });
      if (
        application === "admin" &&
        cloudflareIdentity !== undefined &&
        !cloudflareIdentityMatchesAdmin(cloudflareIdentity, session.principal)
      ) {
        await runtime.auth.logout(session.token, context);
        throw new CloudflareAccessError("IDENTITY_DENIED");
      }
      const response = redirectTo(config, next, undefined, application);
      setSessionCookie(response, config, session.token, session.expiresAt);
      return response;
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    if (error instanceof CloudflareAccessError) {
      return new Response("Forbidden", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const destination = `/${locale}/auth/login?next=${encodeURIComponent(next)}`;
    return redirectTo(config, destination, statusForAuthError(error), application);
  }
}
