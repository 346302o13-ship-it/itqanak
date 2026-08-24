import {
  AuthorizationError,
  requirePermission,
  type AuthenticatedPrincipal,
  type Permission,
} from "@itqanak/auth";
import { forbidden, redirect } from "next/navigation";

import { currentPrincipal } from "./auth-runtime";

export async function requireStudentPagePrincipal(
  next: string,
  permission: Permission,
  locale: "ar" | "en" = "ar",
): Promise<AuthenticatedPrincipal> {
  const principal = await currentPrincipal();
  if (principal === undefined) {
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(next)}`);
  }
  try {
    return requirePermission(principal, permission);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      forbidden();
    }
    throw error;
  }
}
