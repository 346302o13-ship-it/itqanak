import { NextResponse, type NextRequest } from "next/server";

import { CloudflareAccessError, verifyCloudflareAccessRequest } from "./lib/cloudflare-access";
import { maintenanceResponseForRequest } from "./lib/maintenance-gate";
import { utmCookieName, type UtmCookieValue } from "./lib/utm-cookie";

function csrfCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-itqanak_csrf" : "itqanak_dev_csrf";
}

/** First-touch ad attribution, so a request created days after the ad click
 *  still carries it (see `POST /api/student/requests`). Only ever set once
 *  per 30-day window — a later direct or organic visit must not overwrite the
 *  campaign that actually brought the student in. */
function utmCookieValue(request: NextRequest): string | undefined {
  const params = request.nextUrl.searchParams;
  const source = params.get("utm_source");
  if (source === null || source.trim() === "") return undefined;
  const value: UtmCookieValue = {
    s: source.slice(0, 80),
    m: (params.get("utm_medium") ?? "").slice(0, 80),
    c: (params.get("utm_campaign") ?? "").slice(0, 120),
  };
  return JSON.stringify(value);
}

function randomCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function trustedAppUrl(admin: boolean): URL {
  return new URL(
    admin
      ? (process.env.ADMIN_APP_URL ?? process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:8080")
      : (process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:8080"),
  );
}

function requestHostname(request: NextRequest): string {
  // `nextUrl` can contain the container's internal origin behind two reverse
  // proxies. The gateway deliberately preserves the original Host header, so
  // use it for canonical-host routing while comparing hostnames without ports.
  const forwardedHost = request.headers.get("host")?.split(",", 1)[0]?.trim();
  if (forwardedHost !== undefined && forwardedHost !== "") {
    try {
      return new URL(`http://${forwardedHost}`).hostname.toLowerCase();
    } catch {
      // Fall back to Next's parsed URL for malformed, untrusted Host values.
    }
  }
  return request.nextUrl.hostname.toLowerCase();
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const locale = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "ar";
  const adminPath = pathname === `/${locale}/admin` || pathname.startsWith(`/${locale}/admin/`);
  const adminUrl = trustedAppUrl(true);
  const onAdminHost = requestHostname(request) === adminUrl.hostname.toLowerCase();
  const adminApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  if (adminApi && !onAdminHost) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (onAdminHost) {
    try {
      await verifyCloudflareAccessRequest(request.headers);
    } catch (error: unknown) {
      if (error instanceof CloudflareAccessError) {
        return new NextResponse("Forbidden", {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        });
      }
      throw error;
    }
  }
  const maintenance = await maintenanceResponseForRequest({
    pathname,
    hostname: requestHostname(request),
    adminHostname: adminUrl.hostname,
  });
  if (maintenance !== undefined) return maintenance;
  const sessionName =
    process.env.NODE_ENV === "production" ? "__Host-itqanak_session" : "itqanak_dev_session";
  const csrfName = csrfCookieName();
  const existingCsrf = request.cookies.get(csrfName)?.value;
  const csrfToken = existingCsrf ?? randomCsrfToken();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-itqanak-locale", locale);
  if (existingCsrf === undefined) {
    // A newly issued cookie is not visible to the server component for this
    // request. Forward the same random value internally so its first form can
    // include a matching hidden token without trusting a client-supplied header.
    requestHeaders.set("x-itqanak-csrf-token", csrfToken);
  }
  let response: NextResponse;
  if (onAdminHost && pathname === "/") {
    response = NextResponse.redirect(new URL("/ar/admin", adminUrl), 307);
  } else if (onAdminHost && (pathname === "/ar" || pathname === "/en")) {
    response = NextResponse.redirect(new URL(`${pathname}/admin`, adminUrl), 307);
  } else if (adminPath && requestHostname(request) !== adminUrl.hostname.toLowerCase()) {
    const destination = new URL(`${pathname}${request.nextUrl.search}`, adminUrl);
    response = NextResponse.redirect(destination, 308);
  } else if (
    (pathname === `/${locale}/account` ||
      pathname.startsWith(`/${locale}/account/`) ||
      pathname === `/${locale}/admin` ||
      pathname.startsWith(`/${locale}/admin/`) ||
      pathname === `/${locale}/student` ||
      pathname.startsWith(`/${locale}/student/`)) &&
    request.cookies.get(sessionName) === undefined
  ) {
    const destination = new URL(`/${locale}/auth/login`, trustedAppUrl(adminPath || onAdminHost));
    destination.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    response = NextResponse.redirect(destination);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (existingCsrf === undefined) {
    response.cookies.set({
      name: csrfName,
      value: csrfToken,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }
  const utmName = utmCookieName();
  if (!onAdminHost && !pathname.startsWith("/api/") && request.cookies.get(utmName) === undefined) {
    const utmValue = utmCookieValue(request);
    if (utmValue !== undefined) {
      response.cookies.set({
        name: utmName,
        value: utmValue,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  }
  return response;
}

export const config = {
  matcher: ["/", "/ar/:path*", "/en/:path*", "/api/:path*"],
};
