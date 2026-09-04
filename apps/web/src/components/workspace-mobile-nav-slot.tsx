"use client";

import { useMobileWorkspaceNavVisible } from "@/lib/mobile-workspace-nav";

import { AdminMobileNavigation } from "./admin-navigation";

export function AdminWorkspaceMobileNavSlot({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const visible = useMobileWorkspaceNavVisible();
  return visible ? <AdminMobileNavigation locale={locale} /> : null;
}
