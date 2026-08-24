import type { ReactNode } from "react";

import { privateSectionMetadata } from "@/lib/seo";
import { webAppManifestHref } from "@/lib/pwa-manifest";

export const metadata = {
  ...privateSectionMetadata,
  manifest: webAppManifestHref("en", "admin"),
};

export default function EnglishAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
