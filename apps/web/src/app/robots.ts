import type { MetadataRoute } from "next";

import { publicMetadataBase } from "@/lib/seo";

// Resolve PUBLIC_APP_URL at request time. Static generation happens inside the
// Docker build where runtime deployment URLs are intentionally unavailable.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = publicMetadataBase();
  return {
    rules: {
      userAgent: "*",
      allow: ["/ar", "/ar/services"],
      disallow: [
        "/ar/auth",
        "/ar/account",
        "/ar/admin",
        "/ar/student",
        "/en/auth",
        "/en/account",
        "/en/admin",
        "/en/student",
        "/api/",
      ],
    },
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
  };
}
