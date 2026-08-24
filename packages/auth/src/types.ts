import type { Role } from "@itqanak/core";

import type { PhoneCountryCode } from "./identity.js";

export const userStatuses = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DISABLED"] as const;
export type UserStatus = (typeof userStatuses)[number];

export const phoneVerificationStatuses = ["NOT_REQUIRED", "PENDING", "VERIFIED"] as const;
export type PhoneVerificationStatus = (typeof phoneVerificationStatuses)[number];

export const permissionCodes = [
  "account.profile.read",
  "account.profile.update",
  "account.sessions.read",
  "account.sessions.revoke",
  "admin.dashboard.view",
  "admin.users.read",
  "admin.users.manage",
  "admin.audit.read",
  "catalog.read",
  "requests.create",
  "requests.read.own",
  "requests.update.own",
  "requests.cancel.own",
  "requests.attachments.create.own",
  "requests.attachments.read.own",
  "requests.attachments.delete.own",
  "requests.chat.read.own",
  "requests.chat.send.own",
  "admin.requests.read",
  "admin.requests.manage",
  "admin.requests.assign",
  "admin.requests.chat.read",
  "admin.requests.chat.send",
  "admin.requests.attachments.create",
  "admin.requests.attachments.read",
  "admin.catalog.read",
  "admin.catalog.manage",
  "admin.content.read",
  "admin.content.manage",
  "admin.passwordresets.read",
  "admin.passwordresets.manage",
  "admin.operations.read",
  "admin.operations.manage",
  "support.chat.read.own",
  "support.chat.send.own",
  "admin.support.chat.read",
  "admin.support.chat.send",
  "conversations.read.own",
  "conversations.send.own",
  "admin.conversations.read",
  "admin.conversations.send",
  "quotes.respond.own",
  "admin.quotes.manage",
  "notifications.read.own",
  "finance.read.own",
  "admin.finance.read",
  "admin.finance.manage",
  "admin.finance.reports.read",
] as const;
export type Permission = (typeof permissionCodes)[number];

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly Role[];
  readonly permissions: readonly Permission[];
  readonly displayName: string;
  readonly email?: string;
  readonly phoneE164?: string;
  readonly countryCode?: PhoneCountryCode;
  readonly status: "ACTIVE";
}

export interface RequestAuditContext {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly userAgentSummary?: string;
  readonly ipHash?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
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
  readonly email?: string;
  readonly phoneE164?: string;
  readonly countryCode?: PhoneCountryCode;
  readonly phoneVerifiedAt?: Date;
  readonly phoneVerificationStatus: PhoneVerificationStatus;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly emailVerifiedAt?: Date;
  readonly createdAt: Date;
  readonly roles: readonly Role[];
}

export interface PendingPhoneVerification {
  readonly userId: string;
  readonly displayName: string;
  readonly phoneE164: string;
  readonly countryCode: PhoneCountryCode;
  readonly email?: string;
  readonly requestedAt: Date;
  readonly createdAt: Date;
}

export interface AdminStudentSummary {
  readonly id: string;
  readonly displayName: string;
  readonly phoneE164: string;
  readonly countryCode: PhoneCountryCode;
  readonly phoneVerified: boolean;
  readonly status: UserStatus;
  readonly createdAt: Date;
}

export interface AdminStudentListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly activeOnly?: boolean;
}

export interface AdminStudentListResult {
  readonly items: readonly AdminStudentSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export const phonePasswordResetStatuses = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "LINK_EXPIRED",
  "COMPLETED",
] as const;
export type PhonePasswordResetStatus = (typeof phonePasswordResetStatuses)[number];

export interface PhonePasswordResetReference {
  readonly reference: string;
  readonly expiresAt: Date;
}

export interface PhonePasswordResetRequest {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly phoneE164: string;
  readonly countryCode: PhoneCountryCode;
  readonly publicReference: string;
  readonly status: PhonePasswordResetStatus;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
  /** Actual expiry of the linked reset token while this request is approved. */
  readonly resetTokenExpiresAt?: Date;
  readonly reviewedAt?: Date;
  readonly reviewedByUserId?: string;
  readonly whatsappReference?: string;
  readonly reviewNote?: string;
  readonly completedAt?: Date;
}

export interface IssuedPhonePasswordReset {
  readonly request: PhonePasswordResetRequest;
  /** Returned exactly once to the approving administrator; only its hash is stored. */
  readonly token: string;
  readonly tokenExpiresAt: Date;
}

export interface AdminCreatedStudent {
  readonly student: AdminStudentSummary;
  readonly recovery: IssuedPhonePasswordReset;
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
      | "PHONE_NOT_VERIFIED"
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
      | "ADMIN_ALREADY_EXISTS"
      | "EMAIL_DELIVERY_UNAVAILABLE"
      | "INVALID_EMAIL"
      | "INVALID_PHONE"
      | "PHONE_VERIFICATION_REFERENCE_REQUIRED"
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
