import { NextResponse, type NextRequest } from "next/server";

function csrfCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-itqanak_csrf" : "itqanak_dev_csrf";
}

function randomCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function trustedAppUrl(): URL {
  return new URL(process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:8080");
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const sessionName =
    process.env.NODE_ENV === "production" ? "__Host-itqanak_session" : "itqanak_dev_session";
  const csrfName = csrfCookieName();
  const existingCsrf = request.cookies.get(csrfName)?.value;
  const csrfToken = existingCsrf ?? randomCsrfToken();
  const requestHeaders = new Headers(request.headers);
  if (existingCsrf === undefined) {
    // A newly issued cookie is not visible to the server component for this
    // request. Forward the same random value internally so its first form can
    // include a matching hidden token without trusting a client-supplied header.
    requestHeaders.set("x-itqanak-csrf-token", csrfToken);
  }
  let response: NextResponse;
  if (
    (pathname.startsWith("/ar/account") || pathname.startsWith("/ar/admin")) &&
    request.cookies.get(sessionName) === undefined
  ) {
    const destination = new URL("/ar/auth/login", trustedAppUrl());
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
  return response;
}

export const config = {
  matcher: ["/ar/:path*"],
};
