import type { ReactNode } from "react";

import { privateSectionMetadata } from "@/lib/seo";
import { webAppManifestHref } from "@/lib/pwa-manifest";

export const metadata = {
  ...privateSectionMetadata,
  manifest: webAppManifestHref("ar", "admin"),
};

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
