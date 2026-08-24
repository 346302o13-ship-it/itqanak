import {
  AuthorizationError,
  requireAdmin,
  requirePermission,
  type AuthenticatedPrincipal,
  type Permission,
} from "@itqanak/auth";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import { currentPrincipal } from "./auth-runtime";
import {
  CloudflareAccessError,
  cloudflareIdentityMatchesAdmin,
  type CloudflareAccessIdentity,
  verifyCloudflareAccessRequest,
} from "./cloudflare-access";

export async function requireAdminPagePrincipal(
  next: string,
  locale: "ar" | "en" = "ar",
  permission?: Permission,
): Promise<AuthenticatedPrincipal> {
  let accessIdentity: CloudflareAccessIdentity | undefined;
  try {
    accessIdentity = await verifyCloudflareAccessRequest(await headers());
  } catch (error: unknown) {
    if (error instanceof CloudflareAccessError) forbidden();
    throw error;
  }
  const principal = await currentPrincipal();
  if (principal === undefined) {
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(next)}`);
  }
  try {
    const admin = requireAdmin(principal);
    if (!cloudflareIdentityMatchesAdmin(accessIdentity, admin)) {
      forbidden();
    }
    return permission === undefined ? admin : requirePermission(admin, permission);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }
}
