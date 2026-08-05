import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:8080";
  return [{ url: new URL("/ar", baseUrl).toString(), lastModified: new Date() }];
}
