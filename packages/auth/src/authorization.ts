import type { Role } from "@itqanak/core";

import { AuthorizationError, type AuthenticatedPrincipal, type Permission } from "./types.js";

export function requireAuthenticatedUser(
  principal: AuthenticatedPrincipal | null | undefined,
): AuthenticatedPrincipal {
  if (principal === null || principal === undefined) {
    throw new AuthorizationError(["authenticated user"]);
  }
  return principal;
}

export function hasRole(principal: AuthenticatedPrincipal | null | undefined, role: Role): boolean {
  return principal?.roles.includes(role) ?? false;
}

export function hasAnyRole(
  principal: AuthenticatedPrincipal | null | undefined,
  requiredRoles: readonly Role[],
): boolean {
  return requiredRoles.some((role) => hasRole(principal, role));
}

export function hasPermission(
  principal: AuthenticatedPrincipal | null | undefined,
  permission: Permission,
): boolean {
  return principal?.permissions.includes(permission) ?? false;
}

export function requireRole(
  principal: AuthenticatedPrincipal | null | undefined,
  role: Role,
): AuthenticatedPrincipal {
  const authenticated = requireAuthenticatedUser(principal);
  if (!authenticated.roles.includes(role)) {
    throw new AuthorizationError([role]);
  }
  return authenticated;
}

export function requireAnyRole(
  principal: AuthenticatedPrincipal | null | undefined,
  requiredRoles: readonly Role[],
): AuthenticatedPrincipal {
  const authenticated = requireAuthenticatedUser(principal);
  if (!hasAnyRole(authenticated, requiredRoles)) {
    throw new AuthorizationError(requiredRoles);
  }
  return authenticated;
}

export function requirePermission(
  principal: AuthenticatedPrincipal | null | undefined,
  permission: Permission,
): AuthenticatedPrincipal {
  const authenticated = requireAuthenticatedUser(principal);
  if (!authenticated.permissions.includes(permission)) {
    throw new AuthorizationError([permission]);
  }
  return authenticated;
}

/** Browser administration is deliberately ADMIN-only; SYSTEM never gets a browser session. */
export function hasAdminAccess(principal: AuthenticatedPrincipal | null | undefined): boolean {
  return hasRole(principal, "ADMIN") && hasPermission(principal, "admin.dashboard.view");
}

export function requireAdmin(
  principal: AuthenticatedPrincipal | null | undefined,
): AuthenticatedPrincipal {
  return requirePermission(requireRole(principal, "ADMIN"), "admin.dashboard.view");
}
