import { AuthorizationError, CsrfError } from "@itqanak/auth";
import { MessagingSettingsError } from "@itqanak/operations";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function messagingErrorStatus(error: unknown): number {
  if (error instanceof CsrfError || error instanceof AuthorizationError) return 403;
  if (!(error instanceof MessagingSettingsError)) return 500;
  if (error.code === "VERSION_CONFLICT") return 409;
  if (error.code === "SETTINGS_UNAVAILABLE") return 503;
  return 400;
}

export function messagingErrorRedirect(
  error: unknown,
  fallbackPath: string,
  adminAppUrl: string,
): NextResponse {
  const status = messagingErrorStatus(error);
  const notice =
    error instanceof CsrfError
      ? "csrf"
      : status === 409
        ? "conflict"
        : status === 403
          ? "forbidden"
          : status === 503
            ? "unavailable"
            : status === 400
              ? "invalid"
              : "failed";
  const destination = new URL(fallbackPath, adminAppUrl);
  destination.searchParams.set("notice", notice);
  return NextResponse.redirect(destination, 303);
}

export function acceptsJson(request: NextRequest): boolean {
  return request.headers.get("accept")?.toLowerCase().includes("application/json") === true;
}
