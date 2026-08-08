export {
  hasAdminAccess,
  hasAnyRole,
  hasPermission,
  hasRole,
  requireAdmin,
  requireAuthenticatedUser,
  requireAnyRole,
  requirePermission,
  requireRole,
} from "./authorization.js";
export {
  recordAuditEvent,
  summarizeUserAgent,
  type AuditEventInput,
  type AuditOutcome,
} from "./audit.js";
export {
  createAuthEmailSender,
  AuthEmailOutboxProcessor,
  TestAuthEmailSender,
} from "./auth-email.js";
export {
  assertCsrfToken,
  assertExpectedFormContentType,
  assertTrustedHost,
  assertTrustedOrigin,
  CsrfError,
} from "./csrf.js";
export {
  decryptAuthEmailPayload,
  encryptAuthEmailPayload,
  AuthEmailPayloadError,
  type AuthEmailPayload,
} from "./email-payload.js";
export { maskEmailForDisplay, normalizeDisplayName, normalizeEmail } from "./identity.js";
export {
  argon2idOptions,
  assertPasswordPolicy,
  hashPassword,
  passwordSchema,
  verifyPassword,
} from "./password.js";
export {
  authRateLimitRules,
  hashRateLimitSubject,
  RedisRateLimiter,
  requireWithinRateLimit,
  type RateLimiter,
  type RateLimitResult,
  type RateLimitRule,
} from "./rate-limit.js";
export { safeInternalPath } from "./redirects.js";
export {
  AuthService,
  type AuthServiceOptions,
  type ChangePasswordInput,
  type CreatedSession,
  type CreateSessionInput,
  type LoginInput,
  type RegisterStudentInput,
  type ResetPasswordInput,
} from "./service.js";
export { generateOpaqueToken, hashValidator, parseOpaqueToken, validatorsMatch } from "./tokens.js";
export {
  AuthenticationError,
  AuthorizationError,
  permissionCodes,
  RegistrationError,
  userStatuses,
  type AuthenticatedPrincipal,
  type GeneratedOpaqueToken,
  type Permission,
  type PublicAccount,
  type RequestAuditContext,
  type SessionSummary,
  type UserStatus,
} from "./types.js";
export { type Role } from "@itqanak/core";
