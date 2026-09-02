import type { MetadataRoute } from "next";

import { createCatalogRuntime } from "@/lib/catalog-runtime";
import { publicMetadataBase } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = publicMetadataBase();
  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: new URL("/ar", baseUrl).toString(), lastModified },
    { url: new URL("/ar/install", baseUrl).toString(), lastModified },
    { url: new URL("/ar/privacy", baseUrl).toString(), lastModified },
    { url: new URL("/ar/services", baseUrl).toString(), lastModified },
    { url: new URL("/ar/terms", baseUrl).toString(), lastModified },
    { url: new URL("/en", baseUrl).toString(), lastModified },
    { url: new URL("/en/install", baseUrl).toString(), lastModified },
    { url: new URL("/en/privacy", baseUrl).toString(), lastModified },
    { url: new URL("/en/services", baseUrl).toString(), lastModified },
    { url: new URL("/en/terms", baseUrl).toString(), lastModified },
  ];
  const runtime = createCatalogRuntime();
  try {
    const categories = await runtime.catalog.listPublicCatalog();
    for (const category of categories) {
      for (const service of category.services) {
        entries.push({
          url: new URL(`/ar/services/${service.slug}`, baseUrl).toString(),
          lastModified,
        });
        entries.push({
          url: new URL(`/en/services/${service.slug}`, baseUrl).toString(),
          lastModified,
        });
      }
    }
  } catch {
    // A temporary database outage must not leak internals from this public
    // metadata endpoint. Static public entries remain useful and valid.
  } finally {
    await runtime.close();
  }
  return entries;
}
