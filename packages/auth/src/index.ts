/**
 * Authorization primitives only. Credential storage, password verification,
 * and session persistence are deliberately deferred to the authentication
 * phase; no browser storage or token transport is defined here.
 */
export {
  AuthorizationError,
  hasAdminAccess,
  hasAnyRole,
  hasRole,
  requireAdmin,
  requireAnyRole,
  requireRole,
  type AuthenticatedPrincipal,
} from "./authorization.js";
export { type Role } from "@itqanak/core";
