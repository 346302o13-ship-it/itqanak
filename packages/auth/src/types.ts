import type { Role } from "@itqanak/core";

export const userStatuses = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DISABLED"] as const;
export type UserStatus = (typeof userStatuses)[number];

export const permissionCodes = [
  "account.profile.read",
  "account.profile.update",
  "account.sessions.read",
  "account.sessions.revoke",
  "admin.dashboard.view",
  "admin.users.read",
  "admin.users.manage",
  "admin.audit.read",
] as const;
export type Permission = (typeof permissionCodes)[number];

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly Role[];
  readonly permissions: readonly Permission[];
  readonly displayName: string;
  readonly email: string;
  readonly status: "ACTIVE";
}

export interface RequestAuditContext {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly userAgentSummary?: string;
  readonly ipHash?: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly idleExpiresAt: Date;
  readonly revokedAt?: Date;
  readonly revokedReason?: string;
  readonly userAgentSummary?: string;
  readonly current: boolean;
}

export interface PublicAccount {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly emailVerifiedAt?: Date;
  readonly createdAt: Date;
  readonly roles: readonly Role[];
}

export interface GeneratedOpaqueToken {
  readonly selector: string;
  readonly validator: string;
  readonly raw: string;
  readonly validatorHash: string;
}

export class AuthenticationError extends Error {
  public constructor(
    public readonly code:
      | "INVALID_CREDENTIALS"
      | "EMAIL_NOT_VERIFIED"
      | "ACCOUNT_UNAVAILABLE"
      | "INVALID_TOKEN"
      | "TOKEN_EXPIRED"
      | "TOKEN_USED"
      | "SESSION_INVALID"
      | "PASSWORD_REUSED"
      | "RATE_LIMITED"
      | "RATE_LIMIT_UNAVAILABLE",
  ) {
    super(code);
    this.name = "AuthenticationError";
  }
}

export class RegistrationError extends Error {
  public constructor(
    public readonly code:
      | "EMAIL_ALREADY_REGISTERED"
      | "EMAIL_DELIVERY_UNAVAILABLE"
      | "LEGAL_CONSENT_REQUIRED"
      | "LEGAL_CONSENT_VERSION_MISMATCH",
  ) {
    super(code);
    this.name = "RegistrationError";
  }
}

export class AuthorizationError extends Error {
  public constructor(public readonly required: readonly string[]) {
    super("The authenticated principal does not have the required permission.");
    this.name = "AuthorizationError";
  }
}
