import type { Metadata } from "next";
import type { ReactNode } from "react";

import { webAppManifestHref } from "@/lib/pwa-manifest";

export const metadata: Metadata = { manifest: webAppManifestHref("ar", "public") };

export default function ArabicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
