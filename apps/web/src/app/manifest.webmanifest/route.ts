import type { NextRequest } from "next/server";

import { webAppManifestForContext } from "@/lib/pwa-manifest";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Response {
  const locale = request.nextUrl.searchParams.get("locale") === "en" ? "en" : "ar";
  const requestedSurface = request.nextUrl.searchParams.get("surface");
  const surface =
    requestedSurface === "student" || requestedSurface === "admin" ? requestedSurface : "public";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Response.json(webAppManifestForContext(host, locale, surface), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/manifest+json; charset=utf-8",
      Vary: "Host, X-Forwarded-Host",
    },
  });
}
