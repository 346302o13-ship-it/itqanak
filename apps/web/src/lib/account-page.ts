import type { AuthenticatedPrincipal } from "@itqanak/auth";
import { redirect } from "next/navigation";

import { currentPrincipal } from "./auth-runtime";

export async function requirePagePrincipal(next: string): Promise<AuthenticatedPrincipal> {
  const principal = await currentPrincipal();
  if (principal === undefined) {
    redirect(`/ar/auth/login?next=${encodeURIComponent(next)}`);
  }
  return principal;
}

export function formatArabicDate(value: Date): string {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(
    value,
  );
}
