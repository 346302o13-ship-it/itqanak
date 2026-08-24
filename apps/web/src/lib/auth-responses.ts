import { AuthenticationError, CsrfError, RegistrationError, safeInternalPath } from "@itqanak/auth";
import type { AppConfig } from "@itqanak/config";
import { NextResponse } from "next/server";

import { sessionCookieName, sessionCookieOptions } from "./auth-runtime";

export type AuthStatus =
  | "account_created"
  | "csrf"
  | "failed"
  | "invalid"
  | "logged_out"
  | "password_changed"
  | "password_reset"
  | "pending_verification"
  | "profile_saved"
  | "rate_limited"
  | "sent"
  | "session_revoked"
  | "sessions_revoked"
  | "unverified"
  | "verified";

export function appUrl(
  config: AppConfig,
  path: string,
  status?: AuthStatus,
  application: "public" | "admin" = "public",
): URL {
  const url = new URL(path, application === "admin" ? config.adminAppUrl : config.publicAppUrl);
  if (status !== undefined) {
    url.searchParams.set("status", status);
  }
  return url;
}

export function redirectTo(
  config: AppConfig,
  path: string,
  status?: AuthStatus,
  application: "public" | "admin" = "public",
): NextResponse {
  return NextResponse.redirect(appUrl(config, path, status, application), 303);
}

export function safeNext(value: string | null | undefined, fallback = "/ar/account"): string {
  return safeInternalPath(value, fallback);
}

export function loginUrl(config: AppConfig, next: string): URL {
  const url = appUrl(config, "/ar/auth/login");
  url.searchParams.set("next", safeNext(next));
  return url;
}

export function setSessionCookie(
  response: NextResponse,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set({
    name: sessionCookieName(config),
    value: token,
    ...sessionCookieOptions(config, expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse, config: AppConfig): void {
  response.cookies.set({
    name: sessionCookieName(config),
    value: "",
    ...sessionCookieOptions(config, new Date(0)),
    maxAge: 0,
  });
}

export function statusForAuthError(error: unknown): AuthStatus {
  if (error instanceof CsrfError) {
    return "csrf";
  }
  if (error instanceof RegistrationError) {
    return "failed";
  }
  if (error instanceof AuthenticationError) {
    if (error.code === "PHONE_NOT_VERIFIED") {
      return "pending_verification";
    }
    if (error.code === "EMAIL_NOT_VERIFIED") {
      return "unverified";
    }
    if (error.code === "RATE_LIMITED" || error.code === "RATE_LIMIT_UNAVAILABLE") {
      return "rate_limited";
    }
    if (
      error.code === "INVALID_TOKEN" ||
      error.code === "TOKEN_EXPIRED" ||
      error.code === "TOKEN_USED"
    ) {
      return "invalid";
    }
  }
  return "failed";
}
