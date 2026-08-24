import type { ReactNode } from "react";

import { privateSectionMetadata } from "@/lib/seo";

export const metadata = privateSectionMetadata;

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
