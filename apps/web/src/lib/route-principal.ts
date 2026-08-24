import type { AuthenticatedPrincipal } from "@itqanak/auth";
import type { NextRequest } from "next/server";

import { sessionCookieName, type AuthRuntime } from "./auth-runtime";
import {
  CloudflareAccessError,
  cloudflareIdentityMatchesAdmin,
  verifyCloudflareAccessRequest,
} from "./cloudflare-access";

export async function principalForRequest(
  runtime: AuthRuntime,
  request: NextRequest,
): Promise<AuthenticatedPrincipal | undefined> {
  const principal = await runtime.auth.authenticateSession(
    request.cookies.get(sessionCookieName(runtime.config))?.value,
  );
  if (
    principal === undefined ||
    !(
      request.nextUrl.pathname === "/api/admin" ||
      request.nextUrl.pathname.startsWith("/api/admin/")
    )
  ) {
    return principal;
  }
  try {
    const identity = await verifyCloudflareAccessRequest(request.headers);
    if (!cloudflareIdentityMatchesAdmin(identity, principal)) {
      return undefined;
    }
    return principal;
  } catch (error: unknown) {
    if (error instanceof CloudflareAccessError) return undefined;
    throw error;
  }
}
