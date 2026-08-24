import type { Metadata } from "next";
import type { ReactNode } from "react";

import { webAppManifestHref } from "@/lib/pwa-manifest";

export const metadata: Metadata = { manifest: webAppManifestHref("en", "public") };

export default function EnglishLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
