import type { AuthenticatedPrincipal } from "@itqanak/auth";
import type { NextRequest } from "next/server";

import { sessionCookieName, type AuthRuntime } from "./auth-runtime";

export async function principalForRequest(
  runtime: AuthRuntime,
  request: NextRequest,
): Promise<AuthenticatedPrincipal | undefined> {
  return runtime.auth.authenticateSession(
    request.cookies.get(sessionCookieName(runtime.config))?.value,
  );
}
