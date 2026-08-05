import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/ar", disallow: ["/ar/admin", "/api/"] } };
}
