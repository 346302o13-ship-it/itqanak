import { randomBytes, randomUUID } from "node:crypto";

import type { AppConfig } from "@itqanak/config";
import type { Role } from "@itqanak/core";
import type { DatabaseClient } from "@itqanak/db";

import { recordAuditEvent } from "./audit.js";
import { requireAdmin, requireAuthenticatedUser, requirePermission } from "./authorization.js";
import { encryptAuthEmailPayload } from "./email-payload.js";
import {
  isPhoneCountryCode,
  normalizeDisplayName,
  normalizeEmail,
  normalizePhone,
  type PhoneCountryCode,
} from "./identity.js";
import { assertPasswordPolicy, hashPassword, verifyPassword } from "./password.js";
import {
  authRateLimitRules,
  hashRateLimitSubject,
  requireWithinRateLimit,
  type RateLimiter,
} from "./rate-limit.js";
import { generateOpaqueToken, parseOpaqueToken, validatorsMatch } from "./tokens.js";
import {
  AuthenticationError,
  type AdminCreatedStudent,
  type AdminStudentListInput,
  type AdminStudentListResult,
  AuthorizationError,
  type AuthenticatedPrincipal,
  type Permission,
  permissionCodes,
  type PendingPhoneVerification,
  type IssuedPhonePasswordReset,
  type PhonePasswordResetReference,
  type PhonePasswordResetRequest,
  type PhonePasswordResetStatus,
  type PhoneVerificationStatus,
  type PublicAccount,
  RegistrationError,
  type RequestAuditContext,
  type SessionSummary,
  type UserStatus,
} from "./types.js";

interface UserRow {
  readonly id: string;
  readonly email: string | null;
  readonly email_normalized: string | null;
  readonly phone_e164: string | null;
  readonly country_code: PhoneCountryCode | null;
  readonly phone_verified_at: Date | null;
  readonly phone_verification_status: PhoneVerificationStatus;
  readonly phone_verification_requested_at: Date | null;
  readonly display_name: string;
  readonly status: UserStatus;
  readonly email_verified_at: Date | null;
  readonly created_at: Date;
}

interface CredentialRow {
  readonly password_hash: string;
}

interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly validator_hash: string;
  readonly created_at: Date;
  readonly last_seen_at: Date;
  readonly expires_at: Date;
  readonly idle_expires_at: Date;
  readonly revoked_at: Date | null;
  readonly revoked_reason: string | null;
  readonly user_agent_summary: string | null;
}

interface TokenRow {
  readonly id: string;
  readonly user_id: string;
  readonly validator_hash: string;
  readonly expires_at: Date;
  readonly used_at: Date | null;
  readonly revoked_at: Date | null;
}

interface PhonePasswordResetRow {
  readonly id: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly phone_e164: string;
  readonly country_code: PhoneCountryCode;
  readonly public_reference: string;
  readonly status: PhonePasswordResetStatus;
  readonly requested_at: Date | string;
  readonly expires_at: Date | string;
  readonly reset_token_expires_at?: Date | string | null;
  readonly reviewed_at: Date | string | null;
  readonly reviewed_by_user_id: string | null;
  readonly whatsapp_reference: string | null;
  readonly review_note: string | null;
  readonly completed_at: Date | string | null;
}

type AuthEmailKind = "VERIFY_EMAIL" | "PASSWORD_RESET" | "PASSWORD_CHANGED";

interface AuthenticatedUserRow extends UserRow {
  readonly session_id: string;
  readonly selector: string;
  readonly validator_hash: string;
  readonly session_created_at: Date;
  readonly session_last_seen_at: Date;
  readonly session_expires_at: Date;
  readonly session_idle_expires_at: Date;
  readonly session_revoked_at: Date | null;
}

export interface AuthServiceOptions {
  readonly database: DatabaseClient;
  readonly config: AppConfig;
  readonly rateLimiter?: RateLimiter;
}

export interface RegisterStudentInput extends RequestAuditContext {
  /** Required contact/login address. Phone remains the activation identity. */
  readonly email: string;
  /** Omit only for legacy email-registration callers. */
  readonly phone?: string;
  readonly countryCode?: PhoneCountryCode;
  readonly displayName: string;
  readonly password: string;
  readonly acceptedTerms: boolean;
  readonly acceptedPrivacy: boolean;
  readonly termsVersion: string;
  readonly privacyVersion: string;
}

export interface LoginInput extends RequestAuditContext {
  /** E.164 mobile number or email address. */
  readonly identity?: string;
  /** Backwards-compatible alias used by existing integrations. */
  readonly email?: string;
  readonly password: string;
  readonly priorSessionId?: string;
}

export interface ConfirmPhoneVerificationInput {
  /** WhatsApp conversation/message reference retained as verification evidence. */
  readonly reference: string;
  readonly note?: string;
}

export interface AdminCreateStudentInput {
  readonly displayName: string;
  readonly phone: string;
  readonly countryCode: PhoneCountryCode;
  /** Auditable evidence from the inbound conversation on the registered number. */
  readonly whatsappReference: string;
  readonly note?: string;
}

export interface RequestPhonePasswordResetInput extends RequestAuditContext {
  readonly phone: string;
  readonly countryCode: PhoneCountryCode;
}

export interface IssuePhonePasswordResetInput {
  readonly publicReference: string;
  readonly whatsappReference: string;
  readonly note?: string;
}

export interface RejectPhonePasswordResetInput {
  readonly reason: string;
}

export interface CreateSessionInput extends RequestAuditContext {
  readonly userId: string;
  readonly roles: readonly Role[];
  readonly createdBySessionId?: string;
}

export interface CreatedSession {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export interface ResetPasswordInput extends RequestAuditContext {
  readonly token: string;
  readonly password: string;
}

export interface ChangePasswordInput extends RequestAuditContext {
  readonly principal: AuthenticatedPrincipal;
  readonly currentPassword: string;
  readonly newPassword: string;
}

const sessionTouchIntervalMs = 5 * 60 * 1_000;
const resendMinimumIntervalMs = 60 * 1_000;
const phonePasswordResetRequestTtlSeconds = 2 * 60 * 60;
const supportEvidenceReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/u;
const dummyPasswordHashPromise = hashPassword("ITQANAK non-user password sentinel 2026");

function phonePasswordResetReference(): string {
  return `PR-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function toPhonePasswordResetRequest(row: PhonePasswordResetRow): PhonePasswordResetRequest {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    phoneE164: row.phone_e164,
    countryCode: row.country_code,
    publicReference: row.public_reference,
    status: row.status,
    requestedAt: asDate(row.requested_at),
    expiresAt: asDate(row.expires_at),
    ...(row.reset_token_expires_at === undefined || row.reset_token_expires_at === null
      ? {}
      : { resetTokenExpiresAt: asDate(row.reset_token_expires_at) }),
    ...(row.reviewed_at === null ? {} : { reviewedAt: asDate(row.reviewed_at) }),
    ...(row.reviewed_by_user_id === null ? {} : { reviewedByUserId: row.reviewed_by_user_id }),
    ...(row.whatsapp_reference === null ? {} : { whatsappReference: row.whatsapp_reference }),
    ...(row.review_note === null ? {} : { reviewNote: row.review_note }),
    ...(row.completed_at === null ? {} : { completedAt: asDate(row.completed_at) }),
  };
}

function isRole(value: string): value is Role {
  return value === "STUDENT" || value === "ADMIN" || value === "SYSTEM" || value === "VISITOR";
}

function isPermission(value: string): value is Permission {
  return (permissionCodes as readonly string[]).includes(value);
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1_000);
}

function userAgent(context: RequestAuditContext): string | undefined {
  return context.userAgentSummary?.slice(0, 180);
}

function ensurePayloadKey(config: AppConfig): string {
  if (config.auth.emailPayloadKey === undefined) {
    throw new RegistrationError("EMAIL_DELIVERY_UNAVAILABLE");
  }
  return config.auth.emailPayloadKey;
}

function hasVerifiedIdentity(user: UserRow): boolean {
  return user.email_verified_at !== null || user.phone_verified_at !== null;
}

function requiredEmail(value: string): {
  readonly email: string;
  readonly normalizedEmail: string;
} {
  if (typeof value !== "string") {
    throw new RegistrationError("INVALID_EMAIL");
  }
  const email = value.trim();
  try {
    return { email, normalizedEmail: normalizeEmail(email) };
  } catch {
    throw new RegistrationError("INVALID_EMAIL");
  }
}

function loginIdentity(input: LoginInput): {
  readonly normalized: string;
  readonly kind: "email" | "phone";
} {
  const raw = (input.identity ?? input.email ?? "").trim();
  if (raw.includes("@")) {
    return { normalized: normalizeEmail(raw), kind: "email" };
  }
  return { normalized: normalizePhone(raw).e164, kind: "phone" };
}

function genericTokenFailure(
  row: TokenRow | undefined,
  rawToken: string,
): AuthenticationError | undefined {
  if (row === undefined) {
    return new AuthenticationError("INVALID_TOKEN");
  }
  const parsed = parseOpaqueToken(rawToken);
  if (parsed === undefined || !validatorsMatch(row.validator_hash, parsed.validator)) {
    return new AuthenticationError("INVALID_TOKEN");
  }
  if (row.used_at !== null) {
    return new AuthenticationError("TOKEN_USED");
  }
  if (row.revoked_at !== null) {
    return new AuthenticationError("INVALID_TOKEN");
  }
  if (asDate(row.expires_at).getTime() <= Date.now()) {
    return new AuthenticationError("TOKEN_EXPIRED");
  }
  return undefined;
}

export class AuthService {
  private readonly database: DatabaseClient;
  private readonly config: AppConfig;
  private readonly rateLimiter: RateLimiter | undefined;

  public constructor(options: AuthServiceOptions) {
    this.database = options.database;
    this.config = options.config;
    this.rateLimiter = options.rateLimiter;
  }

  public async registerStudent(input: RegisterStudentInput): Promise<{
    readonly created: boolean;
    readonly verificationMethod: "PHONE" | "EMAIL";
  }> {
    let phoneIdentity:
      | { readonly e164: string; readonly countryCode: PhoneCountryCode }
      | undefined;
    if ((input.phone?.trim().length ?? 0) > 0) {
      if (input.countryCode === undefined || !isPhoneCountryCode(input.countryCode)) {
        throw new RegistrationError("INVALID_PHONE");
      }
      try {
        phoneIdentity = normalizePhone(input.phone ?? "", input.countryCode);
      } catch {
        throw new RegistrationError("INVALID_PHONE");
      }
    }
    // The address is retained as a normalized, unique contact/login identity,
    // but phone-first accounts are still activated exclusively by the audited
    // administrator confirmation of the registered WhatsApp number. No email
    // verification token or delivery is created for that flow.
    const { email, normalizedEmail } = requiredEmail(input.email);
    const verificationMethod = phoneIdentity === undefined ? "EMAIL" : "PHONE";
    const displayName = normalizeDisplayName(input.displayName);
    if (!input.acceptedTerms || !input.acceptedPrivacy) {
      throw new RegistrationError("LEGAL_CONSENT_REQUIRED");
    }
    if (
      input.termsVersion !== this.config.auth.termsVersion ||
      input.privacyVersion !== this.config.auth.privacyVersion
    ) {
      throw new RegistrationError("LEGAL_CONSENT_VERSION_MISMATCH");
    }
    const payloadKey = verificationMethod === "EMAIL" ? ensurePayloadKey(this.config) : undefined;
    await this.enforceRate(authRateLimitRules.registerByIp, input.ipHash ?? "unknown");
    if (phoneIdentity !== undefined) {
      await this.enforceRate(authRateLimitRules.registerByPhone, phoneIdentity.e164);
    }
    await this.enforceRate(authRateLimitRules.registerByEmail, normalizedEmail);
    const passwordHash = await hashPassword(input.password);

    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const identityLocks = [phoneIdentity?.e164, normalizedEmail]
        .filter((value): value is string => value !== undefined)
        .sort();
      for (const identity of identityLocks) {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
      }
      const existing = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users
        WHERE email_normalized = ${normalizedEmail}
           OR (${phoneIdentity?.e164 ?? null}::text IS NOT NULL AND phone_e164 = ${phoneIdentity?.e164 ?? null})
        FOR UPDATE
      `;
      if (existing.length > 0) {
        return { created: false, verificationMethod };
      }

      const users = await tx<UserRow[]>`
        INSERT INTO users (
          email, email_normalized, phone_e164, country_code, display_name, status,
          phone_verification_status, phone_verification_requested_at
        ) VALUES (
          ${email}, ${normalizedEmail}, ${phoneIdentity?.e164 ?? null},
          ${phoneIdentity?.countryCode ?? null}, ${displayName}, 'PENDING_VERIFICATION',
          ${phoneIdentity === undefined ? "NOT_REQUIRED" : "PENDING"},
          ${phoneIdentity === undefined ? null : new Date()}
        )
        RETURNING id, email, email_normalized, phone_e164, country_code, phone_verified_at,
                  phone_verification_status, phone_verification_requested_at,
                  display_name, status, email_verified_at, created_at
      `;
      const user = users[0];
      if (user === undefined) {
        throw new Error("User creation did not return a row.");
      }
      await tx`
        INSERT INTO user_credentials (user_id, password_hash)
        VALUES (${user.id}, ${passwordHash})
      `;
      await tx`
        INSERT INTO user_roles (user_id, role_code) VALUES (${user.id}, 'STUDENT')
      `;
      await tx`
        INSERT INTO legal_acceptances (user_id, document_type, version)
        VALUES
          (${user.id}, 'TERMS', ${this.config.auth.termsVersion}),
          (${user.id}, 'PRIVACY', ${this.config.auth.privacyVersion})
      `;
      if (verificationMethod === "EMAIL") {
        if (user.email === null || payloadKey === undefined) {
          throw new RegistrationError("EMAIL_DELIVERY_UNAVAILABLE");
        }
        const token = generateOpaqueToken();
        const expiresAt = addSeconds(new Date(), this.config.auth.emailVerificationTtlSeconds);
        await tx`
          INSERT INTO email_verification_tokens (user_id, selector, validator_hash, expires_at)
          VALUES (${user.id}, ${token.selector}, ${token.validatorHash}, ${expiresAt})
        `;
        await this.enqueueAuthEmail(tx, {
          userId: user.id,
          kind: "VERIFY_EMAIL",
          recipientEmail: user.email,
          displayName: user.display_name,
          token: token.raw,
          expiresAt,
          payloadKey,
        });
      }
      await recordAuditEvent(tx, {
        ...input,
        eventType: "auth.registration_created",
        outcome: "SUCCESS",
        actorUserId: user.id,
        targetUserId: user.id,
      });
      await tx`
        INSERT INTO outbox_events (
          event_type, aggregate_type, aggregate_id, idempotency_key, payload
        ) VALUES (
          'ACCOUNT_REGISTRATION_CREATED', 'USER', ${user.id},
          ${`user:${user.id}:registration-created`},
          ${tx.json({ schemaVersion: 1, userId: user.id })}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `;
      await recordAuditEvent(tx, {
        ...input,
        eventType:
          verificationMethod === "PHONE"
            ? "auth.phone_verification_requested"
            : "auth.email_verification_requested",
        outcome: "SUCCESS",
        actorUserId: user.id,
        targetUserId: user.id,
      });
      return { created: true, verificationMethod };
    });
  }

  public async requestEmailVerification(
    emailInput: string,
    context: RequestAuditContext,
  ): Promise<void> {
    const normalizedEmail = normalizeEmail(emailInput);
    const payloadKey = ensurePayloadKey(this.config);
    await this.enforceRate(authRateLimitRules.resendByIp, context.ipHash ?? "unknown");
    await this.enforceRate(authRateLimitRules.resendByEmail, normalizedEmail);

    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      const user = rows[0];
      if (
        user === undefined ||
        user.email === null ||
        user.status !== "PENDING_VERIFICATION" ||
        user.phone_verification_status === "PENDING"
      ) {
        return;
      }
      const recent = await tx<{ readonly created_at: Date }[]>`
        SELECT created_at FROM email_verification_tokens
        WHERE user_id = ${user.id} AND used_at IS NULL AND revoked_at IS NULL
        ORDER BY created_at DESC LIMIT 1
      `;
      if (
        recent[0] !== undefined &&
        Date.now() - asDate(recent[0].created_at).getTime() < resendMinimumIntervalMs
      ) {
        return;
      }
      await tx`
        UPDATE email_verification_tokens SET revoked_at = now()
        WHERE user_id = ${user.id} AND used_at IS NULL AND revoked_at IS NULL
      `;
      await this.cancelPendingAuthEmails(tx, user.id, "VERIFY_EMAIL");
      const token = generateOpaqueToken();
      const expiresAt = addSeconds(new Date(), this.config.auth.emailVerificationTtlSeconds);
      await tx`
        INSERT INTO email_verification_tokens (user_id, selector, validator_hash, expires_at)
        VALUES (${user.id}, ${token.selector}, ${token.validatorHash}, ${expiresAt})
      `;
      await this.enqueueAuthEmail(tx, {
        userId: user.id,
        kind: "VERIFY_EMAIL",
        recipientEmail: user.email,
        displayName: user.display_name,
        token: token.raw,
        expiresAt,
        payloadKey,
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.email_verification_requested",
        outcome: "SUCCESS",
        actorUserId: user.id,
        targetUserId: user.id,
      });
    });
  }

  public async verifyEmail(tokenValue: string, context: RequestAuditContext): Promise<void> {
    await this.enforceRate(authRateLimitRules.verifyByIp, context.ipHash ?? "unknown");
    const parsed = parseOpaqueToken(tokenValue);
    if (parsed === undefined) {
      await recordAuditEvent(this.database, {
        ...context,
        eventType: "auth.email_verification_failed",
        outcome: "FAILURE",
      });
      throw new AuthenticationError("INVALID_TOKEN");
    }
    await this.enforceRate(authRateLimitRules.verifyByToken, parsed.selector);
    const failure = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<TokenRow[]>`
        SELECT id, user_id, validator_hash, expires_at, used_at, revoked_at
        FROM email_verification_tokens WHERE selector = ${parsed.selector} FOR UPDATE
      `;
      const token = rows[0];
      const tokenFailure = genericTokenFailure(token, tokenValue);
      if (tokenFailure !== undefined) {
        await recordAuditEvent(tx, {
          ...context,
          eventType: "auth.email_verification_failed",
          outcome: "FAILURE",
          ...(token === undefined ? {} : { targetUserId: token.user_id }),
        });
        return tokenFailure;
      }
      if (token === undefined) {
        throw new AuthenticationError("INVALID_TOKEN");
      }
      await tx`UPDATE email_verification_tokens SET used_at = now() WHERE id = ${token.id}`;
      await tx`
        UPDATE email_verification_tokens SET revoked_at = now()
        WHERE user_id = ${token.user_id} AND id <> ${token.id} AND used_at IS NULL AND revoked_at IS NULL
      `;
      await this.cancelPendingAuthEmails(tx, token.user_id, "VERIFY_EMAIL");
      await tx`
        UPDATE users
        SET status = 'ACTIVE', email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
        WHERE id = ${token.user_id} AND status = 'PENDING_VERIFICATION'
          AND phone_verification_status <> 'PENDING'
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.email_verified",
        outcome: "SUCCESS",
        actorUserId: token.user_id,
        targetUserId: token.user_id,
      });
      return undefined;
    });
    if (failure !== undefined) {
      throw failure;
    }
  }

  public async login(
    input: LoginInput,
  ): Promise<CreatedSession & { readonly principal: AuthenticatedPrincipal }> {
    const identity = loginIdentity(input);
    await this.enforceRate(authRateLimitRules.loginByIp, input.ipHash ?? "unknown");
    await this.enforceRate(authRateLimitRules.loginByEmail, identity.normalized);
    const users = await this.database<UserRow[]>`
      SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
             phone_verification_status, phone_verification_requested_at,
             display_name, status, email_verified_at, created_at
      FROM users
      WHERE (${identity.kind} = 'email' AND email_normalized = ${identity.normalized})
         OR (${identity.kind} = 'phone' AND phone_e164 = ${identity.normalized})
    `;
    const user = users[0];
    const credentials =
      user === undefined
        ? []
        : await this.database<CredentialRow[]>`
            SELECT password_hash FROM user_credentials WHERE user_id = ${user.id}
          `;
    const credential = credentials[0];
    const passwordHash = credential?.password_hash ?? (await dummyPasswordHashPromise);
    const passwordMatches = await verifyPassword(passwordHash, input.password);

    if (user === undefined || credential === undefined || !passwordMatches) {
      await recordAuditEvent(this.database, {
        ...input,
        eventType: "auth.login_failed",
        outcome: "FAILURE",
        metadata: { identity_hash: hashRateLimitSubject(identity.normalized) },
      });
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    if (user.status === "PENDING_VERIFICATION" || !hasVerifiedIdentity(user)) {
      await recordAuditEvent(this.database, {
        ...input,
        eventType: "auth.login_failed",
        outcome: "DENIED",
        targetUserId: user.id,
      });
      throw new AuthenticationError(
        user.phone_verification_status === "PENDING" ? "PHONE_NOT_VERIFIED" : "EMAIL_NOT_VERIFIED",
      );
    }
    if (user.status !== "ACTIVE") {
      await recordAuditEvent(this.database, {
        ...input,
        eventType: "auth.login_failed",
        outcome: "DENIED",
        targetUserId: user.id,
      });
      throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
    }
    await this.enforceRate(authRateLimitRules.sessionCreateByUser, user.id);

    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const lockedUsers = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE id = ${user.id} FOR UPDATE
      `;
      const lockedUser = lockedUsers[0];
      const lockedCredentials = await tx<CredentialRow[]>`
        SELECT password_hash FROM user_credentials WHERE user_id = ${user.id} FOR UPDATE
      `;
      if (
        lockedUser === undefined ||
        lockedCredentials[0]?.password_hash !== credential.password_hash
      ) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.login_failed",
          outcome: "FAILURE",
          targetUserId: user.id,
        });
        return {
          success: false as const,
          error: new AuthenticationError("INVALID_CREDENTIALS"),
        };
      }
      if (lockedUser.status === "PENDING_VERIFICATION" || !hasVerifiedIdentity(lockedUser)) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.login_failed",
          outcome: "DENIED",
          targetUserId: lockedUser.id,
        });
        return {
          success: false as const,
          error: new AuthenticationError(
            lockedUser.phone_verification_status === "PENDING"
              ? "PHONE_NOT_VERIFIED"
              : "EMAIL_NOT_VERIFIED",
          ),
        };
      }
      if (lockedUser.status !== "ACTIVE") {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.login_failed",
          outcome: "DENIED",
          targetUserId: lockedUser.id,
        });
        return {
          success: false as const,
          error: new AuthenticationError("ACCOUNT_UNAVAILABLE"),
        };
      }
      const roles = await this.getRoles(tx, lockedUser.id);
      if (roles.includes("SYSTEM")) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.login_failed",
          outcome: "DENIED",
          targetUserId: lockedUser.id,
        });
        return {
          success: false as const,
          error: new AuthenticationError("ACCOUNT_UNAVAILABLE"),
        };
      }
      if (input.priorSessionId !== undefined) {
        await tx`
          UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'ROTATED_AFTER_LOGIN'
          WHERE id = ${input.priorSessionId} AND user_id = ${lockedUser.id} AND revoked_at IS NULL
        `;
      }
      const created = await this.createSession(tx, {
        userId: lockedUser.id,
        roles,
        ...input,
      });
      const principal = await this.principalForUser(tx, lockedUser, created.sessionId, roles);
      await tx`UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = ${lockedUser.id}`;
      await recordAuditEvent(tx, {
        ...input,
        eventType: "auth.login_succeeded",
        outcome: "SUCCESS",
        actorUserId: lockedUser.id,
        targetUserId: lockedUser.id,
        sessionId: created.sessionId,
      });
      return { success: true as const, value: { ...created, principal } };
    });
    if (!result.success) {
      throw result.error;
    }
    return result.value;
  }

  public async authenticateSession(
    tokenValue: string | undefined,
  ): Promise<AuthenticatedPrincipal | undefined> {
    if (tokenValue === undefined) {
      return undefined;
    }
    const parsed = parseOpaqueToken(tokenValue);
    if (parsed === undefined) {
      return undefined;
    }
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<AuthenticatedUserRow[]>`
        SELECT
          users.id, users.email, users.email_normalized, users.phone_e164,
          users.country_code, users.phone_verified_at, users.phone_verification_status,
          users.phone_verification_requested_at, users.display_name, users.status,
          users.email_verified_at, users.created_at,
          user_sessions.id AS session_id, user_sessions.selector, user_sessions.validator_hash,
          user_sessions.created_at AS session_created_at, user_sessions.last_seen_at AS session_last_seen_at,
          user_sessions.expires_at AS session_expires_at, user_sessions.idle_expires_at AS session_idle_expires_at,
          user_sessions.revoked_at AS session_revoked_at
        FROM user_sessions JOIN users ON users.id = user_sessions.user_id
        WHERE user_sessions.selector = ${parsed.selector}
        FOR SHARE OF users
      `;
      const row = rows[0];
      if (
        row === undefined ||
        !validatorsMatch(row.validator_hash, parsed.validator) ||
        row.session_revoked_at !== null ||
        asDate(row.session_expires_at).getTime() <= Date.now() ||
        asDate(row.session_idle_expires_at).getTime() <= Date.now() ||
        row.status !== "ACTIVE" ||
        !hasVerifiedIdentity(row)
      ) {
        return undefined;
      }
      const roles = await this.getRoles(tx, row.id);
      if (roles.includes("SYSTEM")) {
        return undefined;
      }
      const principal = await this.principalForUser(tx, row, row.session_id, roles);
      if (Date.now() - asDate(row.session_last_seen_at).getTime() >= sessionTouchIntervalMs) {
        const idleTtl = roles.includes("ADMIN")
          ? this.config.auth.adminSessionIdleTtlSeconds
          : this.config.auth.studentSessionIdleTtlSeconds;
        await tx`
          UPDATE user_sessions
          SET last_seen_at = now(), idle_expires_at = LEAST(expires_at, now() + (${idleTtl} * interval '1 second'))
          WHERE id = ${row.session_id} AND revoked_at IS NULL
        `;
      }
      return principal;
    });
  }

  public async logout(tokenValue: string | undefined, context: RequestAuditContext): Promise<void> {
    const principal = await this.authenticateSession(tokenValue);
    if (principal === undefined) {
      return;
    }
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      await tx`
        UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'LOGOUT'
        WHERE id = ${principal.sessionId} AND user_id = ${principal.userId} AND revoked_at IS NULL
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.logout",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
      });
    });
  }

  public async listSessions(principal: AuthenticatedPrincipal): Promise<readonly SessionSummary[]> {
    requirePermission(principal, "account.sessions.read");
    const rows = await this.database<SessionRow[]>`
      SELECT id, user_id, validator_hash, created_at, last_seen_at, expires_at, idle_expires_at,
             revoked_at, revoked_reason, user_agent_summary
      FROM user_sessions WHERE user_id = ${principal.userId}
      ORDER BY created_at DESC
    `;
    return rows.map((row) => ({
      id: row.id,
      createdAt: asDate(row.created_at),
      lastSeenAt: asDate(row.last_seen_at),
      expiresAt: asDate(row.expires_at),
      idleExpiresAt: asDate(row.idle_expires_at),
      ...(row.revoked_at === null ? {} : { revokedAt: asDate(row.revoked_at) }),
      ...(row.revoked_reason === null ? {} : { revokedReason: row.revoked_reason }),
      ...(row.user_agent_summary === null ? {} : { userAgentSummary: row.user_agent_summary }),
      current: row.id === principal.sessionId,
    }));
  }

  public async revokeSession(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    context: RequestAuditContext,
  ): Promise<boolean> {
    requirePermission(principal, "account.sessions.revoke");
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<{ readonly id: string }[]>`
        UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'USER_REVOKED'
        WHERE id = ${sessionId} AND user_id = ${principal.userId} AND revoked_at IS NULL
        RETURNING id
      `;
      if (rows.length === 0) {
        return false;
      }
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.session_revoked",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId,
      });
      return true;
    });
    return result;
  }

  public async revokeAllSessions(
    principal: AuthenticatedPrincipal,
    context: RequestAuditContext,
    exceptSessionId?: string,
  ): Promise<number> {
    requirePermission(principal, "account.sessions.revoke");
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<{ readonly id: string }[]>`
        UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'LOGOUT_ALL'
        WHERE user_id = ${principal.userId} AND revoked_at IS NULL
          AND (${exceptSessionId ?? null}::uuid IS NULL OR id <> ${exceptSessionId ?? null}::uuid)
        RETURNING id
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.logout_all",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
        sessionId: principal.sessionId,
        metadata: { revoked_count: rows.length },
      });
      return rows.length;
    });
  }

  public async updateDisplayName(
    principal: AuthenticatedPrincipal,
    displayNameInput: string,
    context: RequestAuditContext = {},
  ): Promise<string> {
    requirePermission(principal, "account.profile.update");
    await this.enforceRate(authRateLimitRules.accountSensitiveByUser, principal.userId);
    const displayName = normalizeDisplayName(displayNameInput);
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      await tx`
        UPDATE users SET display_name = ${displayName}, updated_at = now()
        WHERE id = ${principal.userId} AND status = 'ACTIVE'
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "account.profile_updated",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        targetUserId: principal.userId,
      });
    });
    return displayName;
  }

  public async getAccount(principal: AuthenticatedPrincipal): Promise<PublicAccount> {
    requirePermission(principal, "account.profile.read");
    const rows = await this.database<UserRow[]>`
      SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
             phone_verification_status, phone_verification_requested_at,
             display_name, status, email_verified_at, created_at
      FROM users WHERE id = ${principal.userId} AND status = 'ACTIVE'
    `;
    const user = rows[0];
    if (user === undefined || !hasVerifiedIdentity(user)) {
      throw new AuthenticationError("SESSION_INVALID");
    }
    const roles = await this.getRoles(this.database, user.id);
    return {
      id: user.id,
      ...(user.email === null ? {} : { email: user.email }),
      ...(user.phone_e164 === null ? {} : { phoneE164: user.phone_e164 }),
      ...(user.country_code === null ? {} : { countryCode: user.country_code }),
      ...(user.phone_verified_at === null
        ? {}
        : { phoneVerifiedAt: asDate(user.phone_verified_at) }),
      phoneVerificationStatus: user.phone_verification_status,
      displayName: user.display_name,
      status: user.status,
      ...(user.email_verified_at === null
        ? {}
        : { emailVerifiedAt: asDate(user.email_verified_at) }),
      createdAt: asDate(user.created_at),
      roles,
    };
  }

  public async listPendingPhoneVerifications(
    admin: AuthenticatedPrincipal,
    limit = 100,
    context: RequestAuditContext = {},
  ): Promise<readonly PendingPhoneVerification[]> {
    requirePermission(requireAdmin(admin), "admin.users.manage");
    const boundedLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 100;
    const rows = await this.database<
      Array<{
        readonly id: string;
        readonly display_name: string;
        readonly email: string | null;
        readonly phone_e164: string;
        readonly country_code: PhoneCountryCode;
        readonly phone_verification_requested_at: Date;
        readonly created_at: Date;
      }>
    >`
      SELECT id, display_name, email, phone_e164, country_code,
             phone_verification_requested_at, created_at
      FROM users
      WHERE phone_verification_status = 'PENDING'
      ORDER BY phone_verification_requested_at ASC, id ASC
      LIMIT ${boundedLimit}
    `;
    const result = rows.map((row) => ({
      userId: row.id,
      displayName: row.display_name,
      phoneE164: row.phone_e164,
      countryCode: row.country_code,
      ...(row.email === null ? {} : { email: row.email }),
      requestedAt: asDate(row.phone_verification_requested_at),
      createdAt: asDate(row.created_at),
    }));
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "auth.phone_verifications_listed",
      outcome: "SUCCESS",
      actorUserId: admin.userId,
      targetUserId: admin.userId,
      sessionId: admin.sessionId,
      metadata: { result_count: result.length },
    });
    return result;
  }

  public async listStudents(
    admin: AuthenticatedPrincipal,
    input: AdminStudentListInput = {},
    context: RequestAuditContext = {},
  ): Promise<AdminStudentListResult> {
    requirePermission(requireAdmin(admin), "admin.users.read");
    const page =
      Number.isSafeInteger(input.page) && (input.page ?? 0) >= 1 ? Math.floor(input.page ?? 1) : 1;
    const pageSize =
      Number.isSafeInteger(input.pageSize) && (input.pageSize ?? 0) >= 1
        ? Math.min(Math.floor(input.pageSize ?? 20), 100)
        : 20;
    const offset = (page - 1) * pageSize;
    const search = input.search?.trim().slice(0, 100);
    const searchPattern =
      search === undefined || search.length === 0 ? null : `%${escapeLike(search)}%`;
    const activeOnly = input.activeOnly === true;
    const parameters = [searchPattern, activeOnly, pageSize, offset];
    const [counts, rows] = await Promise.all([
      this.database.unsafe<Array<{ readonly count: string }>>(
        `SELECT count(*)::text AS count
         FROM users
         INNER JOIN user_roles ON user_roles.user_id = users.id
           AND user_roles.role_code = 'STUDENT'
         WHERE users.phone_e164 IS NOT NULL
           AND ($1::text IS NULL OR users.display_name ILIKE $1 ESCAPE E'\\\\'
             OR users.phone_e164 ILIKE $1 ESCAPE E'\\\\')
           AND (NOT $2::boolean OR users.status = 'ACTIVE')`,
        parameters.slice(0, 2),
      ),
      this.database.unsafe<
        Array<{
          readonly id: string;
          readonly display_name: string;
          readonly phone_e164: string;
          readonly country_code: PhoneCountryCode;
          readonly phone_verified_at: Date | string | null;
          readonly status: UserStatus;
          readonly created_at: Date | string;
        }>
      >(
        `SELECT users.id, users.display_name, users.phone_e164, users.country_code,
                users.phone_verified_at, users.status, users.created_at
         FROM users
         INNER JOIN user_roles ON user_roles.user_id = users.id
           AND user_roles.role_code = 'STUDENT'
         WHERE users.phone_e164 IS NOT NULL
           AND ($1::text IS NULL OR users.display_name ILIKE $1 ESCAPE E'\\\\'
             OR users.phone_e164 ILIKE $1 ESCAPE E'\\\\')
           AND (NOT $2::boolean OR users.status = 'ACTIVE')
         ORDER BY users.created_at DESC, users.id DESC
         LIMIT $3 OFFSET $4`,
        parameters,
      ),
    ]);
    const total = Number(counts[0]?.count ?? "0");
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Student list returned an invalid count.");
    }
    const result: AdminStudentListResult = {
      items: rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        phoneE164: row.phone_e164,
        countryCode: row.country_code,
        phoneVerified: row.phone_verified_at !== null,
        status: row.status,
        createdAt: asDate(row.created_at),
      })),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "auth.students_listed_by_admin",
      outcome: "SUCCESS",
      actorUserId: admin.userId,
      targetUserId: admin.userId,
      sessionId: admin.sessionId,
      metadata: { result_count: result.items.length },
    });
    return result;
  }

  public async createStudentByAdmin(
    admin: AuthenticatedPrincipal,
    input: AdminCreateStudentInput,
    context: RequestAuditContext = {},
  ): Promise<AdminCreatedStudent> {
    requirePermission(requireAdmin(admin), "admin.users.manage");
    const displayName = normalizeDisplayName(input.displayName);
    const phone = normalizePhone(input.phone, input.countryCode);
    const whatsappReference = input.whatsappReference.trim();
    const note = input.note?.trim();
    if (
      !supportEvidenceReferencePattern.test(whatsappReference) ||
      (note !== undefined && note.length > 0 && note.length < 3) ||
      (note?.length ?? 0) > 1000
    ) {
      throw new RegistrationError("PHONE_VERIFICATION_REFERENCE_REQUIRED");
    }

    // No administrator-selected password is retained or disclosed. The random
    // credential is unreachable, and the returned one-time link lets the
    // student establish their own password after the WhatsApp identity check.
    const inaccessiblePasswordHash = await hashPassword(randomBytes(32).toString("base64url"));
    const token = generateOpaqueToken();
    const publicReference = phonePasswordResetReference();
    const now = new Date();
    const tokenExpiresAt = addSeconds(now, this.config.auth.passwordResetTtlSeconds);
    const requestExpiresAt = addSeconds(
      now,
      Math.max(phonePasswordResetRequestTtlSeconds, this.config.auth.passwordResetTtlSeconds + 60),
    );

    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${phone.e164}, 0))`;
      const existing = await tx<{ readonly id: string }[]>`
        SELECT id FROM users WHERE phone_e164 = ${phone.e164} FOR UPDATE
      `;
      if (existing[0] !== undefined) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      const users = await tx<UserRow[]>`
        INSERT INTO users (
          email, email_normalized, phone_e164, country_code, display_name, status,
          phone_verified_at, phone_verification_status, phone_verification_requested_at,
          phone_verification_confirmed_at, phone_verification_confirmed_by_user_id,
          phone_verification_reference, phone_verification_note
        ) VALUES (
          NULL, NULL, ${phone.e164}, ${phone.countryCode}, ${displayName}, 'ACTIVE',
          ${now}, 'VERIFIED', ${now}, ${now}, ${admin.userId}, ${whatsappReference},
          ${note === undefined || note.length === 0 ? null : note}
        )
        RETURNING id, email, email_normalized, phone_e164, country_code, phone_verified_at,
                  phone_verification_status, phone_verification_requested_at,
                  display_name, status, email_verified_at, created_at
      `;
      const user = users[0];
      if (user === undefined || user.phone_e164 === null || user.country_code === null) {
        throw new Error("Administrative student creation did not return a phone identity.");
      }
      await tx`
        INSERT INTO user_credentials (user_id, password_hash)
        VALUES (${user.id}, ${inaccessiblePasswordHash})
      `;
      await tx`
        INSERT INTO user_roles (user_id, role_code, granted_by_user_id)
        VALUES (${user.id}, 'STUDENT', ${admin.userId})
      `;
      const resetTokens = await tx<{ readonly id: string }[]>`
        INSERT INTO password_reset_tokens (user_id, selector, validator_hash, expires_at)
        VALUES (${user.id}, ${token.selector}, ${token.validatorHash}, ${tokenExpiresAt})
        RETURNING id
      `;
      const resetTokenId = resetTokens[0]?.id;
      if (resetTokenId === undefined) {
        throw new Error("Administrative student setup token insert did not return an id.");
      }
      const recoveryRows = await tx<{ readonly id: string }[]>`
        INSERT INTO phone_password_reset_requests (
          user_id, phone_e164, public_reference, status, requested_at, expires_at,
          reviewed_at, reviewed_by_user_id, whatsapp_reference, review_note,
          password_reset_token_id
        ) VALUES (
          ${user.id}, ${phone.e164}, ${publicReference}, 'APPROVED', ${now},
          ${requestExpiresAt}, ${now}, ${admin.userId}, ${whatsappReference},
          ${note === undefined || note.length === 0 ? null : note}, ${resetTokenId}
        )
        RETURNING id
      `;
      const recoveryId = recoveryRows[0]?.id;
      if (recoveryId === undefined) {
        throw new Error("Administrative student recovery request insert did not return an id.");
      }
      await tx`
        INSERT INTO outbox_events (
          event_type, aggregate_type, aggregate_id, idempotency_key, payload
        ) VALUES (
          'ACCOUNT_REGISTRATION_CREATED', 'USER', ${user.id},
          ${`user:${user.id}:registration-created`},
          ${tx.json({ schemaVersion: 1, source: "ADMIN" })}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.student_created_by_admin",
        outcome: "SUCCESS",
        actorUserId: admin.userId,
        targetUserId: user.id,
        sessionId: admin.sessionId,
        resourceType: "user",
        resourceId: user.id,
        metadata: { countryCode: phone.countryCode, setup_link_issued: true },
      });
      const student = {
        id: user.id,
        displayName: user.display_name,
        phoneE164: user.phone_e164,
        countryCode: user.country_code,
        phoneVerified: true,
        status: user.status,
        createdAt: asDate(user.created_at),
      };
      return {
        student,
        recovery: {
          request: {
            id: recoveryId,
            userId: user.id,
            displayName: user.display_name,
            phoneE164: user.phone_e164,
            countryCode: user.country_code,
            publicReference,
            status: "APPROVED",
            requestedAt: now,
            expiresAt: requestExpiresAt,
            resetTokenExpiresAt: tokenExpiresAt,
            reviewedAt: now,
            reviewedByUserId: admin.userId,
            whatsappReference,
            ...(note === undefined || note.length === 0 ? {} : { reviewNote: note }),
          },
          token: token.raw,
          tokenExpiresAt,
        },
      };
    });
  }

  public async confirmPhoneVerification(
    admin: AuthenticatedPrincipal,
    userId: string,
    input: ConfirmPhoneVerificationInput,
    context: RequestAuditContext = {},
  ): Promise<boolean> {
    requirePermission(requireAdmin(admin), "admin.users.manage");
    const normalizedUserId = userId.trim().toLowerCase();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        normalizedUserId,
      )
    ) {
      throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
    }
    const reference = input.reference.trim();
    const note = input.note?.trim();
    if (reference.length < 3 || reference.length > 160 || (note?.length ?? 0) > 1000) {
      throw new RegistrationError("PHONE_VERIFICATION_REFERENCE_REQUIRED");
    }

    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const users = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE id = ${normalizedUserId} FOR UPDATE
      `;
      const user = users[0];
      if (user === undefined) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      if (user.phone_verification_status === "VERIFIED") {
        return false;
      }
      if (
        user.phone_verification_status !== "PENDING" ||
        user.phone_e164 === null ||
        user.country_code === null
      ) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      const confirmedAt = new Date();
      const updated = await tx<{ readonly id: string }[]>`
        UPDATE users
        SET phone_verified_at = ${confirmedAt}, phone_verification_status = 'VERIFIED',
            phone_verification_confirmed_at = ${confirmedAt},
            phone_verification_confirmed_by_user_id = ${admin.userId},
            phone_verification_reference = ${reference},
            phone_verification_note = ${note === undefined || note.length === 0 ? null : note},
            status = CASE WHEN status = 'PENDING_VERIFICATION' THEN 'ACTIVE' ELSE status END,
            updated_at = now()
        WHERE id = ${user.id} AND phone_verification_status = 'PENDING'
        RETURNING id
      `;
      if (updated.length !== 1) {
        return false;
      }
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.phone_verification_confirmed",
        outcome: "SUCCESS",
        actorUserId: admin.userId,
        targetUserId: user.id,
        sessionId: admin.sessionId,
        metadata: { verification_reference: reference },
      });
      return true;
    });
  }

  /**
   * Creates an expiring, non-secret reference for the WhatsApp support check.
   * Unknown and ineligible phone numbers receive the same shaped response so
   * this public endpoint cannot be used for account enumeration.
   */
  public async requestPhonePasswordReset(
    input: RequestPhonePasswordResetInput,
  ): Promise<PhonePasswordResetReference> {
    const phone = normalizePhone(input.phone, input.countryCode);
    await this.enforceRate(authRateLimitRules.phoneResetByIp, input.ipHash ?? "unknown");
    await this.enforceRate(authRateLimitRules.phoneResetByPhone, phone.e164);
    const now = new Date();
    const synthetic: PhonePasswordResetReference = {
      reference: phonePasswordResetReference(),
      expiresAt: addSeconds(now, phonePasswordResetRequestTtlSeconds),
    };

    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const users = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE phone_e164 = ${phone.e164} FOR UPDATE
      `;
      const user = users[0];
      if (
        user === undefined ||
        user.status !== "ACTIVE" ||
        user.phone_verified_at === null ||
        user.phone_verification_status !== "VERIFIED"
      ) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.phone_password_reset_requested",
          outcome: "SUCCESS",
          metadata: { identity_hash: hashRateLimitSubject(phone.e164) },
        });
        return synthetic;
      }

      // Every public submission receives the freshly generated reference,
      // including repeat submissions for a real account. Keep older unexpired
      // references valid until one is approved: this avoids both enumeration
      // by comparing responses and denial-of-service by reference rotation.

      const inserted = await tx<
        {
          readonly id: string;
          readonly public_reference: string;
          readonly expires_at: Date | string;
        }[]
      >`
        INSERT INTO phone_password_reset_requests (
          user_id, phone_e164, public_reference, expires_at
        ) VALUES (
          ${user.id}, ${phone.e164}, ${synthetic.reference}, ${synthetic.expiresAt}
        )
        RETURNING id, public_reference, expires_at
      `;
      const created = inserted[0];
      if (created === undefined) {
        throw new Error("Phone password reset request insert did not return a row.");
      }
      await recordAuditEvent(tx, {
        ...input,
        eventType: "auth.phone_password_reset_requested",
        outcome: "SUCCESS",
        targetUserId: user.id,
        resourceType: "phone_password_reset_request",
        resourceId: created.id,
      });
      return {
        reference: created.public_reference,
        expiresAt: asDate(created.expires_at),
      };
    });
  }

  public async listPhonePasswordResetRequests(
    admin: AuthenticatedPrincipal,
    limit = 100,
    context: RequestAuditContext = {},
  ): Promise<readonly PhonePasswordResetRequest[]> {
    requirePermission(requireAdmin(admin), "admin.passwordresets.read");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
    }
    const rows = await this.database<PhonePasswordResetRow[]>`
      SELECT requests.id, requests.user_id, users.display_name, requests.phone_e164,
             users.country_code, requests.public_reference, requests.status,
             requests.requested_at, requests.expires_at, requests.reviewed_at,
             requests.reviewed_by_user_id, requests.whatsapp_reference,
             requests.review_note, requests.completed_at
      FROM phone_password_reset_requests AS requests
      INNER JOIN users ON users.id = requests.user_id
      WHERE requests.status = 'PENDING' AND requests.expires_at > now()
      ORDER BY requests.requested_at ASC, requests.id ASC
      LIMIT ${limit}
    `;
    const result = rows.map(toPhonePasswordResetRequest);
    await recordAuditEvent(this.database, {
      ...context,
      eventType: "auth.phone_password_resets_listed",
      outcome: "SUCCESS",
      actorUserId: admin.userId,
      targetUserId: admin.userId,
      sessionId: admin.sessionId,
      metadata: { result_count: result.length },
    });
    return result;
  }

  public async getPhonePasswordResetRequest(
    admin: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<PhonePasswordResetRequest> {
    requirePermission(requireAdmin(admin), "admin.passwordresets.read");
    const normalizedId = this.normalizedUuid(requestId);
    const rows = await this.database<PhonePasswordResetRow[]>`
      SELECT requests.id, requests.user_id, users.display_name, requests.phone_e164,
             users.country_code, requests.public_reference, requests.status,
             requests.requested_at, requests.expires_at, requests.reviewed_at,
             requests.reviewed_by_user_id, requests.whatsapp_reference,
             requests.review_note, requests.completed_at,
             reset_tokens.expires_at AS reset_token_expires_at
      FROM phone_password_reset_requests AS requests
      INNER JOIN users ON users.id = requests.user_id
      LEFT JOIN password_reset_tokens AS reset_tokens
        ON reset_tokens.id = requests.password_reset_token_id
      WHERE requests.id = ${normalizedId}
      LIMIT 1
    `;
    if (rows[0] === undefined) {
      throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
    }
    return toPhonePasswordResetRequest(rows[0]);
  }

  public async issuePhonePasswordReset(
    admin: AuthenticatedPrincipal,
    requestId: string,
    input: IssuePhonePasswordResetInput,
    context: RequestAuditContext = {},
  ): Promise<IssuedPhonePasswordReset> {
    requirePermission(requireAdmin(admin), "admin.passwordresets.manage");
    const normalizedId = this.normalizedUuid(requestId);
    const publicReference = input.publicReference.trim().toUpperCase();
    const whatsappReference = input.whatsappReference.trim();
    const note = input.note?.trim();
    if (
      !/^PR-[A-F0-9]{10}$/u.test(publicReference) ||
      !supportEvidenceReferencePattern.test(whatsappReference) ||
      (note !== undefined && note.length > 0 && note.length < 3) ||
      (note !== undefined && note.length > 1000)
    ) {
      throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
    }
    const token = generateOpaqueToken();
    const result = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const candidates = await tx<PhonePasswordResetRow[]>`
        SELECT requests.id, requests.user_id, users.display_name, requests.phone_e164,
               users.country_code, requests.public_reference, requests.status,
               requests.requested_at, requests.expires_at, requests.reviewed_at,
               requests.reviewed_by_user_id, requests.whatsapp_reference,
               requests.review_note, requests.completed_at
        FROM phone_password_reset_requests AS requests
        INNER JOIN users ON users.id = requests.user_id
        WHERE requests.id = ${normalizedId}
        LIMIT 1
      `;
      const candidate = candidates[0];
      if (candidate === undefined) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      // The user row is the root lock for every password-reset operation.
      // Lock it before request/token rows so issuing and consuming links cannot
      // acquire the same resources in opposite order.
      const eligible = await tx<{ readonly id: string }[]>`
        SELECT id FROM users
        WHERE id = ${candidate.user_id} AND status = 'ACTIVE'
          AND phone_e164 = ${candidate.phone_e164}
          AND phone_verified_at IS NOT NULL
          AND phone_verification_status = 'VERIFIED'
        LIMIT 1
        FOR UPDATE
      `;
      if (eligible[0] === undefined) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      const rows = await tx<PhonePasswordResetRow[]>`
        SELECT requests.id, requests.user_id, users.display_name, requests.phone_e164,
               users.country_code, requests.public_reference, requests.status,
               requests.requested_at, requests.expires_at, requests.reviewed_at,
               requests.reviewed_by_user_id, requests.whatsapp_reference,
               requests.review_note, requests.completed_at
        FROM phone_password_reset_requests AS requests
        INNER JOIN users ON users.id = requests.user_id
        WHERE requests.id = ${normalizedId}
        LIMIT 1
        FOR UPDATE OF requests
      `;
      const pending = rows[0];
      if (pending === undefined || pending.status !== "PENDING") {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      if (pending.public_reference !== publicReference) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      if (asDate(pending.expires_at).getTime() <= Date.now()) {
        await tx`
          UPDATE phone_password_reset_requests
          SET status = 'EXPIRED'
          WHERE id = ${pending.id} AND status = 'PENDING'
        `;
        await recordAuditEvent(tx, {
          ...context,
          eventType: "auth.phone_password_reset_expired",
          outcome: "DENIED",
          actorUserId: admin.userId,
          targetUserId: pending.user_id,
          sessionId: admin.sessionId,
          resourceType: "phone_password_reset_request",
          resourceId: pending.id,
        });
        return new AuthenticationError("TOKEN_EXPIRED");
      }
      await tx`
        UPDATE phone_password_reset_requests
        SET status = 'EXPIRED'
        WHERE user_id = ${pending.user_id} AND status = 'PENDING' AND id <> ${pending.id}
      `;
      const reviewedAt = new Date();
      const tokenExpiresAt = addSeconds(reviewedAt, this.config.auth.passwordResetTtlSeconds);
      await this.expireApprovedPhonePasswordResets(tx, pending.user_id);
      await tx`
        UPDATE password_reset_tokens SET revoked_at = now()
        WHERE user_id = ${pending.user_id} AND used_at IS NULL AND revoked_at IS NULL
      `;
      await this.cancelPendingAuthEmails(tx, pending.user_id, "PASSWORD_RESET");
      const resetRows = await tx<{ readonly id: string }[]>`
        INSERT INTO password_reset_tokens (user_id, selector, validator_hash, expires_at)
        VALUES (${pending.user_id}, ${token.selector}, ${token.validatorHash}, ${tokenExpiresAt})
        RETURNING id
      `;
      const resetTokenId = resetRows[0]?.id;
      if (resetTokenId === undefined) {
        throw new Error("Phone password reset token insert did not return an id.");
      }
      await tx`
        UPDATE phone_password_reset_requests
        SET status = 'APPROVED', reviewed_at = ${reviewedAt},
            reviewed_by_user_id = ${admin.userId},
            whatsapp_reference = ${whatsappReference},
            review_note = ${note === undefined || note.length === 0 ? null : note},
            password_reset_token_id = ${resetTokenId}
        WHERE id = ${pending.id} AND status = 'PENDING'
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.phone_password_reset_issued",
        outcome: "SUCCESS",
        actorUserId: admin.userId,
        targetUserId: pending.user_id,
        sessionId: admin.sessionId,
        resourceType: "phone_password_reset_request",
        resourceId: pending.id,
        metadata: { whatsapp_reference_recorded: true },
      });
      return {
        request: {
          ...toPhonePasswordResetRequest(pending),
          status: "APPROVED" as const,
          reviewedAt,
          reviewedByUserId: admin.userId,
          whatsappReference,
          resetTokenExpiresAt: tokenExpiresAt,
          ...(note === undefined || note.length === 0 ? {} : { reviewNote: note }),
        },
        token: token.raw,
        tokenExpiresAt,
      };
    });
    if (result instanceof AuthenticationError) {
      throw result;
    }
    return result;
  }

  public async rejectPhonePasswordReset(
    admin: AuthenticatedPrincipal,
    requestId: string,
    input: RejectPhonePasswordResetInput,
    context: RequestAuditContext = {},
  ): Promise<void> {
    requirePermission(requireAdmin(admin), "admin.passwordresets.manage");
    const normalizedId = this.normalizedUuid(requestId);
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 1000) {
      throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
    }
    const failure = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<PhonePasswordResetRow[]>`
        SELECT requests.id, requests.user_id, users.display_name, requests.phone_e164,
               users.country_code, requests.public_reference, requests.status,
               requests.requested_at, requests.expires_at, requests.reviewed_at,
               requests.reviewed_by_user_id, requests.whatsapp_reference,
               requests.review_note, requests.completed_at
        FROM phone_password_reset_requests AS requests
        INNER JOIN users ON users.id = requests.user_id
        WHERE requests.id = ${normalizedId}
        LIMIT 1
        FOR UPDATE OF requests
      `;
      const pending = rows[0];
      if (pending === undefined || pending.status !== "PENDING") {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      if (asDate(pending.expires_at).getTime() <= Date.now()) {
        await tx`
          UPDATE phone_password_reset_requests
          SET status = 'EXPIRED'
          WHERE id = ${pending.id} AND status = 'PENDING'
        `;
        await recordAuditEvent(tx, {
          ...context,
          eventType: "auth.phone_password_reset_expired",
          outcome: "DENIED",
          actorUserId: admin.userId,
          targetUserId: pending.user_id,
          sessionId: admin.sessionId,
          resourceType: "phone_password_reset_request",
          resourceId: pending.id,
        });
        return new AuthenticationError("TOKEN_EXPIRED");
      }
      await tx`
        UPDATE phone_password_reset_requests
        SET status = 'REJECTED', reviewed_at = now(),
            reviewed_by_user_id = ${admin.userId}, review_note = ${reason}
        WHERE id = ${pending.id} AND status = 'PENDING'
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.phone_password_reset_rejected",
        outcome: "SUCCESS",
        actorUserId: admin.userId,
        targetUserId: pending.user_id,
        sessionId: admin.sessionId,
        resourceType: "phone_password_reset_request",
        resourceId: pending.id,
        metadata: { reason_recorded: true },
      });
      return undefined;
    });
    if (failure !== undefined) {
      throw failure;
    }
  }

  public async requestPasswordReset(
    emailInput: string,
    context: RequestAuditContext,
  ): Promise<void> {
    const normalizedEmail = normalizeEmail(emailInput);
    const payloadKey = ensurePayloadKey(this.config);
    await this.enforceRate(authRateLimitRules.resetByIp, context.ipHash ?? "unknown");
    await this.enforceRate(authRateLimitRules.resetByEmail, normalizedEmail);
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      const user = rows[0];
      if (
        user === undefined ||
        user.email === null ||
        user.status !== "ACTIVE" ||
        user.email_verified_at === null
      ) {
        await recordAuditEvent(tx, {
          ...context,
          eventType: "auth.password_reset_requested",
          outcome: "SUCCESS",
          metadata: { identity_hash: hashRateLimitSubject(normalizedEmail) },
        });
        return;
      }
      await this.expireApprovedPhonePasswordResets(tx, user.id);
      await tx`
        UPDATE password_reset_tokens SET revoked_at = now()
        WHERE user_id = ${user.id} AND used_at IS NULL AND revoked_at IS NULL
      `;
      await this.cancelPendingAuthEmails(tx, user.id, "PASSWORD_RESET");
      const token = generateOpaqueToken();
      const expiresAt = addSeconds(new Date(), this.config.auth.passwordResetTtlSeconds);
      await tx`
        INSERT INTO password_reset_tokens (user_id, selector, validator_hash, expires_at)
        VALUES (${user.id}, ${token.selector}, ${token.validatorHash}, ${expiresAt})
      `;
      await this.enqueueAuthEmail(tx, {
        userId: user.id,
        kind: "PASSWORD_RESET",
        recipientEmail: user.email,
        displayName: user.display_name,
        token: token.raw,
        expiresAt,
        payloadKey,
      });
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.password_reset_requested",
        outcome: "SUCCESS",
        actorUserId: user.id,
        targetUserId: user.id,
      });
    });
  }

  public async resetPassword(input: ResetPasswordInput): Promise<void> {
    await this.enforceRate(authRateLimitRules.resetConfirmByIp, input.ipHash ?? "unknown");
    const parsed = parseOpaqueToken(input.token);
    if (parsed === undefined) {
      await recordAuditEvent(this.database, {
        ...input,
        eventType: "auth.password_reset_failed",
        outcome: "FAILURE",
      });
      throw new AuthenticationError("INVALID_TOKEN");
    }
    await this.enforceRate(authRateLimitRules.resetConfirmByToken, parsed.selector);
    const passwordHash = await hashPassword(input.password);
    const failure = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      // Read without a row lock only to discover the owning user. The token is
      // re-read and validated after locking the user, establishing one lock
      // order (users -> password_reset_tokens) shared with token issuers.
      const candidateRows = await tx<TokenRow[]>`
        SELECT id, user_id, validator_hash, expires_at, used_at, revoked_at
        FROM password_reset_tokens WHERE selector = ${parsed.selector}
      `;
      const candidate = candidateRows[0];
      const tokenFailure = genericTokenFailure(candidate, input.token);
      if (tokenFailure !== undefined) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.password_reset_failed",
          outcome: "FAILURE",
          ...(candidate === undefined ? {} : { targetUserId: candidate.user_id }),
        });
        return tokenFailure;
      }
      if (candidate === undefined) {
        throw new AuthenticationError("INVALID_TOKEN");
      }
      const users = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE id = ${candidate.user_id} FOR UPDATE
      `;
      const user = users[0];
      if (user === undefined || user.status !== "ACTIVE") {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.password_reset_failed",
          outcome: "DENIED",
          targetUserId: candidate.user_id,
        });
        return new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      const lockedRows = await tx<TokenRow[]>`
        SELECT id, user_id, validator_hash, expires_at, used_at, revoked_at
        FROM password_reset_tokens WHERE selector = ${parsed.selector} FOR UPDATE
      `;
      const token = lockedRows[0];
      const lockedFailure = genericTokenFailure(token, input.token);
      if (lockedFailure !== undefined || token?.user_id !== user.id) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.password_reset_failed",
          outcome: "FAILURE",
          targetUserId: user.id,
        });
        return lockedFailure ?? new AuthenticationError("INVALID_TOKEN");
      }
      await tx`
        UPDATE user_credentials
        SET password_hash = ${passwordHash}, password_changed_at = now(), updated_at = now()
        WHERE user_id = ${user.id}
      `;
      await tx`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${token.id}`;
      const completedPhoneRequests = await tx<{ readonly id: string }[]>`
        UPDATE phone_password_reset_requests
        SET status = 'COMPLETED', completed_at = now(), password_reset_token_id = NULL
        WHERE password_reset_token_id = ${token.id} AND status = 'APPROVED'
        RETURNING id
      `;
      await this.expireApprovedPhonePasswordResets(tx, user.id);
      await tx`
        UPDATE password_reset_tokens SET revoked_at = now()
        WHERE user_id = ${user.id} AND id <> ${token.id} AND used_at IS NULL AND revoked_at IS NULL
      `;
      await this.cancelPendingAuthEmails(tx, user.id, "PASSWORD_RESET");
      await tx`
        UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'PASSWORD_RESET'
        WHERE user_id = ${user.id} AND revoked_at IS NULL
      `;
      await recordAuditEvent(tx, {
        ...input,
        eventType: "auth.password_reset_completed",
        outcome: "SUCCESS",
        actorUserId: user.id,
        targetUserId: user.id,
      });
      const completedPhoneRequest = completedPhoneRequests[0];
      if (completedPhoneRequest !== undefined) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.phone_password_reset_completed",
          outcome: "SUCCESS",
          actorUserId: user.id,
          targetUserId: user.id,
          resourceType: "phone_password_reset_request",
          resourceId: completedPhoneRequest.id,
        });
      }
      if (this.config.auth.emailPayloadKey !== undefined && user.email !== null) {
        await this.enqueueAuthEmail(tx, {
          userId: user.id,
          kind: "PASSWORD_CHANGED",
          recipientEmail: user.email,
          displayName: user.display_name,
          payloadKey: this.config.auth.emailPayloadKey,
        });
      }
      return undefined;
    });
    if (failure !== undefined) {
      throw failure;
    }
  }

  public async changePassword(input: ChangePasswordInput): Promise<CreatedSession> {
    requireAuthenticatedUser(input.principal);
    await this.enforceRate(authRateLimitRules.accountSensitiveByUser, input.principal.userId);
    assertPasswordPolicy(input.newPassword);
    const rows = await this.database<CredentialRow[]>`
      SELECT password_hash FROM user_credentials WHERE user_id = ${input.principal.userId}
    `;
    const credential = rows[0];
    if (
      credential === undefined ||
      !(await verifyPassword(credential.password_hash, input.currentPassword))
    ) {
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    if (await verifyPassword(credential.password_hash, input.newPassword)) {
      throw new AuthenticationError("PASSWORD_REUSED");
    }
    const newHash = await hashPassword(input.newPassword);
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const users = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE id = ${input.principal.userId} FOR UPDATE
      `;
      const user = users[0];
      if (user === undefined || user.status !== "ACTIVE" || !hasVerifiedIdentity(user)) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      const lockedCredentials = await tx<CredentialRow[]>`
        SELECT password_hash FROM user_credentials
        WHERE user_id = ${input.principal.userId} FOR UPDATE
      `;
      if (lockedCredentials[0]?.password_hash !== credential.password_hash) {
        throw new AuthenticationError("INVALID_CREDENTIALS");
      }
      const updated = await tx<{ readonly user_id: string }[]>`
        UPDATE user_credentials
        SET password_hash = ${newHash}, password_changed_at = now(), updated_at = now()
        WHERE user_id = ${input.principal.userId} AND password_hash = ${credential.password_hash}
        RETURNING user_id
      `;
      if (updated.length !== 1) {
        throw new AuthenticationError("INVALID_CREDENTIALS");
      }
      await this.expireApprovedPhonePasswordResets(tx, user.id);
      await tx`
        UPDATE password_reset_tokens SET revoked_at = now()
        WHERE user_id = ${user.id} AND used_at IS NULL AND revoked_at IS NULL
      `;
      await tx`
        UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'PASSWORD_CHANGED'
        WHERE user_id = ${input.principal.userId} AND revoked_at IS NULL
      `;
      const roles = await this.getRoles(tx, user.id);
      if (roles.includes("SYSTEM")) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      const created = await this.createSession(tx, {
        userId: input.principal.userId,
        roles,
        createdBySessionId: input.principal.sessionId,
        ...input,
      });
      await recordAuditEvent(tx, {
        ...input,
        eventType: "auth.password_changed",
        outcome: "SUCCESS",
        actorUserId: input.principal.userId,
        targetUserId: input.principal.userId,
        sessionId: created.sessionId,
      });
      if (this.config.auth.emailPayloadKey !== undefined && user.email !== null) {
        await this.enqueueAuthEmail(tx, {
          userId: user.id,
          kind: "PASSWORD_CHANGED",
          recipientEmail: user.email,
          displayName: user.display_name,
          payloadKey: this.config.auth.emailPayloadKey,
        });
      }
      return created;
    });
  }

  public async createAdmin(input: {
    readonly email: string;
    readonly displayName: string;
    readonly password: string;
    readonly context?: RequestAuditContext;
  }): Promise<string> {
    const email = input.email.trim();
    const normalizedEmail = normalizeEmail(email);
    const displayName = normalizeDisplayName(input.displayName);
    const passwordHash = await hashPassword(input.password);
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('itqanak:auth:admin-role-mutation', 0))`;
      const currentAdministrators = await tx<{ readonly user_id: string }[]>`
        SELECT user_id FROM user_roles WHERE role_code = 'ADMIN' FOR UPDATE
      `;
      if (currentAdministrators.length > 0) {
        throw new RegistrationError("ADMIN_ALREADY_EXISTS");
      }
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedEmail}, 0))`;
      const existing = await tx<{ readonly id: string }[]>`
        SELECT id FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      if (existing.length > 0) {
        throw new RegistrationError("EMAIL_ALREADY_REGISTERED");
      }
      const rows = await tx<UserRow[]>`
        INSERT INTO users (email, email_normalized, display_name, status, email_verified_at)
        VALUES (${email}, ${normalizedEmail}, ${displayName}, 'ACTIVE', now())
        RETURNING id, email, email_normalized, phone_e164, country_code, phone_verified_at,
                  phone_verification_status, phone_verification_requested_at,
                  display_name, status, email_verified_at, created_at
      `;
      const user = rows[0];
      if (user === undefined) {
        throw new Error("Administrator creation did not return a row.");
      }
      await tx`INSERT INTO user_credentials (user_id, password_hash) VALUES (${user.id}, ${passwordHash})`;
      await tx`INSERT INTO user_roles (user_id, role_code) VALUES (${user.id}, 'ADMIN')`;
      await recordAuditEvent(tx, {
        ...(input.context ?? {}),
        eventType: "auth.admin_created",
        outcome: "SUCCESS",
        actorUserId: user.id,
        targetUserId: user.id,
      });
      return user.id;
    });
  }

  public async grantRole(
    emailInput: string,
    role: Exclude<Role, "VISITOR">,
    context: RequestAuditContext = {},
  ): Promise<void> {
    if (role === "SYSTEM") {
      throw new AuthorizationError(["operator-only SYSTEM role assignment"]);
    }
    const normalizedEmail = normalizeEmail(emailInput);
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      if (role === "ADMIN") {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended('itqanak:auth:admin-role-mutation', 0))`;
      }
      const users = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      const user = users[0];
      if (user === undefined) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      if (role === "ADMIN") {
        const currentAdministrators = await tx<{ readonly user_id: string }[]>`
          SELECT user_id FROM user_roles WHERE role_code = 'ADMIN' FOR UPDATE
        `;
        if (
          currentAdministrators[0] !== undefined &&
          currentAdministrators[0].user_id !== user.id
        ) {
          throw new RegistrationError("ADMIN_ALREADY_EXISTS");
        }
      }
      await tx`
        INSERT INTO user_roles (user_id, role_code) VALUES (${user.id}, ${role})
        ON CONFLICT (user_id, role_code) DO NOTHING
      `;
      await tx`
        UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'ROLE_CHANGED'
        WHERE user_id = ${user.id} AND revoked_at IS NULL
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.role_granted",
        outcome: "SUCCESS",
        targetUserId: user.id,
        metadata: { role },
      });
    });
  }

  public async revokeRole(
    emailInput: string,
    role: Exclude<Role, "VISITOR">,
    context: RequestAuditContext = {},
  ): Promise<void> {
    const normalizedEmail = normalizeEmail(emailInput);
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      if (role === "ADMIN") {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended('itqanak:auth:admin-role-mutation', 0))`;
      }
      const users = await tx<UserRow[]>`
        SELECT id, email, email_normalized, phone_e164, country_code, phone_verified_at,
               phone_verification_status, phone_verification_requested_at,
               display_name, status, email_verified_at, created_at
        FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      const user = users[0];
      if (user === undefined) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      if (role === "ADMIN") {
        const admins = await tx<{ readonly count: string }[]>`
          SELECT count(*)::text AS count
          FROM user_roles JOIN users ON users.id = user_roles.user_id
          WHERE user_roles.role_code = 'ADMIN' AND user_roles.user_id <> ${user.id}
            AND users.status = 'ACTIVE'
            AND (users.email_verified_at IS NOT NULL OR users.phone_verified_at IS NOT NULL)
            AND NOT EXISTS (
              SELECT 1 FROM user_roles AS system_roles
              WHERE system_roles.user_id = users.id AND system_roles.role_code = 'SYSTEM'
            )
        `;
        if (Number(admins[0]?.count ?? "0") < 1) {
          throw new AuthorizationError(["at least one ADMIN role"]);
        }
      }
      const result = await tx<{ readonly user_id: string }[]>`
        DELETE FROM user_roles WHERE user_id = ${user.id} AND role_code = ${role} RETURNING user_id
      `;
      if (result.length === 0) {
        return;
      }
      await tx`
        UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'ROLE_CHANGED'
        WHERE user_id = ${user.id} AND revoked_at IS NULL
      `;
      await recordAuditEvent(tx, {
        ...context,
        eventType: "auth.role_revoked",
        outcome: "SUCCESS",
        targetUserId: user.id,
        metadata: { role },
      });
    });
  }

  public async cleanupExpired(): Promise<{
    readonly sessions: number;
    readonly verificationTokens: number;
    readonly resetTokens: number;
    readonly sentPayloads: number;
  }> {
    const results = await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const sessions = await tx<{ readonly id: string }[]>`
        DELETE FROM user_sessions
        WHERE (expires_at < now() OR idle_expires_at < now() OR revoked_at < now() - interval '30 days')
        RETURNING id
      `;
      const verificationTokens = await tx<{ readonly id: string }[]>`
        DELETE FROM email_verification_tokens
        WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'
        RETURNING id
      `;
      await tx`
        UPDATE phone_password_reset_requests
        SET status = 'EXPIRED'
        WHERE status = 'PENDING' AND expires_at < now()
      `;
      await tx`
        UPDATE phone_password_reset_requests AS requests
        SET status = 'LINK_EXPIRED', password_reset_token_id = NULL
        FROM password_reset_tokens AS tokens
        WHERE requests.password_reset_token_id = tokens.id
          AND requests.status = 'APPROVED'
          AND (tokens.expires_at < now() OR tokens.revoked_at IS NOT NULL)
      `;
      const resetTokens = await tx<{ readonly id: string }[]>`
        DELETE FROM password_reset_tokens
        WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'
        RETURNING id
      `;
      const sentPayloads = await tx<{ readonly id: string }[]>`
        UPDATE auth_email_outbox
        SET encrypted_payload = NULL, updated_at = now()
        WHERE status IN ('SENT', 'SKIPPED_TEST') AND encrypted_payload IS NOT NULL
        RETURNING id
      `;
      return {
        sessions: sessions.length,
        verificationTokens: verificationTokens.length,
        resetTokens: resetTokens.length,
        sentPayloads: sentPayloads.length,
      };
    });
    return results;
  }

  private async enforceRate(
    rule: (typeof authRateLimitRules)[keyof typeof authRateLimitRules],
    subject: string,
  ): Promise<void> {
    if (this.rateLimiter !== undefined) {
      await requireWithinRateLimit(this.rateLimiter, rule, subject);
    }
  }

  private async expireApprovedPhonePasswordResets(
    database: DatabaseClient,
    userId: string,
  ): Promise<void> {
    await database`
      UPDATE phone_password_reset_requests
      SET status = 'LINK_EXPIRED', password_reset_token_id = NULL
      WHERE user_id = ${userId} AND status = 'APPROVED'
    `;
  }

  private normalizedUuid(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)
    ) {
      throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
    }
    return normalized;
  }

  private async getRoles(database: DatabaseClient, userId: string): Promise<readonly Role[]> {
    const rows = await database<{ readonly role_code: string }[]>`
      SELECT role_code FROM user_roles WHERE user_id = ${userId} ORDER BY role_code ASC
    `;
    return rows.map((row) => row.role_code).filter(isRole);
  }

  private async getPermissions(
    database: DatabaseClient,
    roles: readonly Role[],
  ): Promise<readonly Permission[]> {
    if (roles.length === 0) {
      return [];
    }
    const rows = await database<{ readonly permission_code: string }[]>`
      SELECT DISTINCT permission_code FROM role_permissions WHERE role_code = ANY(${roles})
      ORDER BY permission_code ASC
    `;
    return rows.map((row) => row.permission_code).filter(isPermission);
  }

  private async principalForUser(
    database: DatabaseClient,
    user: UserRow,
    sessionId: string,
    roles: readonly Role[],
  ): Promise<AuthenticatedPrincipal> {
    const permissions = await this.getPermissions(database, roles);
    return {
      userId: user.id,
      sessionId,
      roles,
      permissions,
      displayName: user.display_name,
      ...(user.email === null ? {} : { email: user.email }),
      ...(user.phone_e164 === null ? {} : { phoneE164: user.phone_e164 }),
      ...(user.country_code === null ? {} : { countryCode: user.country_code }),
      status: "ACTIVE",
    };
  }

  private async createSession(
    database: DatabaseClient,
    input: CreateSessionInput,
  ): Promise<CreatedSession> {
    const token = generateOpaqueToken();
    const now = new Date();
    const admin = input.roles.includes("ADMIN");
    const expiresAt = addSeconds(
      now,
      admin
        ? this.config.auth.adminSessionAbsoluteTtlSeconds
        : this.config.auth.studentSessionAbsoluteTtlSeconds,
    );
    const idleExpiresAt = addSeconds(
      now,
      admin
        ? this.config.auth.adminSessionIdleTtlSeconds
        : this.config.auth.studentSessionIdleTtlSeconds,
    );
    const rows = await database<{ readonly id: string }[]>`
      INSERT INTO user_sessions (
        user_id, selector, validator_hash, expires_at, idle_expires_at,
        user_agent_summary, ip_hash, created_by_session_id
      ) VALUES (
        ${input.userId}, ${token.selector}, ${token.validatorHash}, ${expiresAt}, ${idleExpiresAt},
        ${userAgent(input) ?? null}, ${input.ipHash ?? null}, ${input.createdBySessionId ?? null}
      ) RETURNING id
    `;
    const session = rows[0];
    if (session === undefined) {
      throw new Error("Session creation did not return a row.");
    }
    return { token: token.raw, sessionId: session.id, expiresAt };
  }

  private async enqueueAuthEmail(
    database: DatabaseClient,
    input: {
      readonly userId: string;
      readonly kind: AuthEmailKind;
      readonly recipientEmail: string;
      readonly displayName: string;
      readonly token?: string;
      readonly expiresAt?: Date;
      readonly payloadKey: string;
    },
  ): Promise<void> {
    const encryptedPayload = encryptAuthEmailPayload(
      {
        kind: input.kind,
        recipientEmail: input.recipientEmail,
        displayName: input.displayName,
        ...(input.token === undefined ? {} : { token: input.token }),
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt.toISOString() }),
      },
      input.payloadKey,
    );
    await database`
      INSERT INTO auth_email_outbox (
        user_id, email_kind, recipient_email, idempotency_key, encrypted_payload, payload_metadata
      ) VALUES (
        ${input.userId}, ${input.kind}, ${input.recipientEmail}, ${randomUUID()},
        ${encryptedPayload}, jsonb_build_object('kind', ${input.kind}::text)
      )
    `;
  }

  private async cancelPendingAuthEmails(
    database: DatabaseClient,
    userId: string,
    kind: Exclude<AuthEmailKind, "PASSWORD_CHANGED">,
  ): Promise<void> {
    await database`
      UPDATE auth_email_outbox
      SET status = 'DEAD', encrypted_payload = NULL,
          last_error_code = 'TOKEN_SUPERSEDED', updated_at = now()
      WHERE user_id = ${userId} AND email_kind = ${kind}
        AND status IN ('PENDING', 'FAILED')
    `;
  }
}
