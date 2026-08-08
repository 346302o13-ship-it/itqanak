import { randomUUID } from "node:crypto";

import type { AppConfig } from "@itqanak/config";
import type { Role } from "@itqanak/core";
import type { DatabaseClient } from "@itqanak/db";

import { recordAuditEvent } from "./audit.js";
import { requireAuthenticatedUser, requirePermission } from "./authorization.js";
import { encryptAuthEmailPayload } from "./email-payload.js";
import { normalizeDisplayName, normalizeEmail } from "./identity.js";
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
  AuthorizationError,
  type AuthenticatedPrincipal,
  type Permission,
  permissionCodes,
  type PublicAccount,
  RegistrationError,
  type RequestAuditContext,
  type SessionSummary,
  type UserStatus,
} from "./types.js";

interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly email_normalized: string;
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
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
  readonly acceptedTerms: boolean;
  readonly acceptedPrivacy: boolean;
  readonly termsVersion: string;
  readonly privacyVersion: string;
}

export interface LoginInput extends RequestAuditContext {
  readonly email: string;
  readonly password: string;
  readonly priorSessionId?: string;
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
const dummyPasswordHashPromise = hashPassword("ITQANAK non-user password sentinel 2026");

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

  public async registerStudent(
    input: RegisterStudentInput,
  ): Promise<{ readonly created: boolean }> {
    const email = input.email.trim();
    const normalizedEmail = normalizeEmail(email);
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
    const payloadKey = ensurePayloadKey(this.config);
    await this.enforceRate(authRateLimitRules.registerByIp, input.ipHash ?? "unknown");
    await this.enforceRate(authRateLimitRules.registerByEmail, normalizedEmail);
    const passwordHash = await hashPassword(input.password);

    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedEmail}, 0))`;
      const existing = await tx<UserRow[]>`
        SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
        FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      if (existing.length > 0) {
        return { created: false };
      }

      const users = await tx<UserRow[]>`
        INSERT INTO users (email, email_normalized, display_name, status)
        VALUES (${email}, ${normalizedEmail}, ${displayName}, 'PENDING_VERIFICATION')
        RETURNING id, email, email_normalized, display_name, status, email_verified_at, created_at
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
        ...input,
        eventType: "auth.registration_created",
        outcome: "SUCCESS",
        actorUserId: user.id,
        targetUserId: user.id,
      });
      await recordAuditEvent(tx, {
        ...input,
        eventType: "auth.email_verification_requested",
        outcome: "SUCCESS",
        actorUserId: user.id,
        targetUserId: user.id,
      });
      return { created: true };
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
        SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
        FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      const user = rows[0];
      if (user === undefined || user.status !== "PENDING_VERIFICATION") {
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
    const normalizedEmail = normalizeEmail(input.email);
    await this.enforceRate(authRateLimitRules.loginByIp, input.ipHash ?? "unknown");
    await this.enforceRate(authRateLimitRules.loginByEmail, normalizedEmail);
    const users = await this.database<UserRow[]>`
      SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
      FROM users WHERE email_normalized = ${normalizedEmail}
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
        metadata: { identity_hash: hashRateLimitSubject(normalizedEmail) },
      });
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    if (user.status === "PENDING_VERIFICATION" || user.email_verified_at === null) {
      await recordAuditEvent(this.database, {
        ...input,
        eventType: "auth.login_failed",
        outcome: "DENIED",
        targetUserId: user.id,
      });
      throw new AuthenticationError("EMAIL_NOT_VERIFIED");
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
        SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
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
      if (lockedUser.status === "PENDING_VERIFICATION" || lockedUser.email_verified_at === null) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.login_failed",
          outcome: "DENIED",
          targetUserId: lockedUser.id,
        });
        return {
          success: false as const,
          error: new AuthenticationError("EMAIL_NOT_VERIFIED"),
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
          users.id, users.email, users.email_normalized, users.display_name, users.status,
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
        row.email_verified_at === null
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
      SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
      FROM users WHERE id = ${principal.userId} AND status = 'ACTIVE'
    `;
    const user = rows[0];
    if (user === undefined || user.email_verified_at === null) {
      throw new AuthenticationError("SESSION_INVALID");
    }
    const roles = await this.getRoles(this.database, user.id);
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      status: user.status,
      emailVerifiedAt: asDate(user.email_verified_at),
      createdAt: asDate(user.created_at),
      roles,
    };
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
        SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
        FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      const user = rows[0];
      if (user === undefined || user.status !== "ACTIVE" || user.email_verified_at === null) {
        await recordAuditEvent(tx, {
          ...context,
          eventType: "auth.password_reset_requested",
          outcome: "SUCCESS",
          metadata: { identity_hash: hashRateLimitSubject(normalizedEmail) },
        });
        return;
      }
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
      const rows = await tx<TokenRow[]>`
        SELECT id, user_id, validator_hash, expires_at, used_at, revoked_at
        FROM password_reset_tokens WHERE selector = ${parsed.selector} FOR UPDATE
      `;
      const token = rows[0];
      const tokenFailure = genericTokenFailure(token, input.token);
      if (tokenFailure !== undefined) {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.password_reset_failed",
          outcome: "FAILURE",
          ...(token === undefined ? {} : { targetUserId: token.user_id }),
        });
        return tokenFailure;
      }
      if (token === undefined) {
        throw new AuthenticationError("INVALID_TOKEN");
      }
      const users = await tx<UserRow[]>`
        SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
        FROM users WHERE id = ${token.user_id} FOR UPDATE
      `;
      const user = users[0];
      if (user === undefined || user.status !== "ACTIVE") {
        await recordAuditEvent(tx, {
          ...input,
          eventType: "auth.password_reset_failed",
          outcome: "DENIED",
          targetUserId: token.user_id,
        });
        return new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      await tx`
        UPDATE user_credentials
        SET password_hash = ${passwordHash}, password_changed_at = now(), updated_at = now()
        WHERE user_id = ${user.id}
      `;
      await tx`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${token.id}`;
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
      if (this.config.auth.emailPayloadKey !== undefined) {
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
        SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
        FROM users WHERE id = ${input.principal.userId} FOR UPDATE
      `;
      const user = users[0];
      if (user === undefined || user.status !== "ACTIVE" || user.email_verified_at === null) {
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
      if (this.config.auth.emailPayloadKey !== undefined) {
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
        RETURNING id, email, email_normalized, display_name, status, email_verified_at, created_at
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
        SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
        FROM users WHERE email_normalized = ${normalizedEmail} FOR UPDATE
      `;
      const user = users[0];
      if (user === undefined) {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
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
        SELECT id, email, email_normalized, display_name, status, email_verified_at, created_at
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
            AND users.status = 'ACTIVE' AND users.email_verified_at IS NOT NULL
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
      email: user.email,
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
