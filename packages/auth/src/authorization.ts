import { roleCanAccessAdmin, type Role } from "@itqanak/core";

export interface AuthenticatedPrincipal {
  readonly subjectId: string;
  readonly roles: readonly Role[];
  readonly sessionId?: string;
}

export class AuthorizationError extends Error {
  public readonly requiredRoles: readonly Role[];

  public constructor(requiredRoles: readonly Role[]) {
    super("The authenticated principal does not have the required permission.");
    this.name = "AuthorizationError";
    this.requiredRoles = requiredRoles;
  }
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

export function hasAdminAccess(principal: AuthenticatedPrincipal | null | undefined): boolean {
  return principal?.roles.some(roleCanAccessAdmin) ?? false;
}

export function requireRole(
  principal: AuthenticatedPrincipal | null | undefined,
  role: Role,
): void {
  if (!hasRole(principal, role)) {
    throw new AuthorizationError([role]);
  }
}

export function requireAnyRole(
  principal: AuthenticatedPrincipal | null | undefined,
  requiredRoles: readonly Role[],
): void {
  if (!hasAnyRole(principal, requiredRoles)) {
    throw new AuthorizationError(requiredRoles);
  }
}

export function requireAdmin(principal: AuthenticatedPrincipal | null | undefined): void {
  if (!hasAdminAccess(principal)) {
    throw new AuthorizationError(["ADMIN", "SYSTEM"]);
  }
}
