import type { AuthenticatedPrincipal } from "@itqanak/auth";
import { redirect } from "next/navigation";

import { currentPrincipal } from "./auth-runtime";

export async function requirePagePrincipal(
  next: string,
  locale: "ar" | "en" = "ar",
): Promise<AuthenticatedPrincipal> {
  const principal = await currentPrincipal();
  if (principal === undefined) {
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(next)}`);
  }
  return principal;
}

export function formatArabicDate(value: Date): string {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(
    value,
  );
}

export function formatEnglishDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
    value,
  );
}
