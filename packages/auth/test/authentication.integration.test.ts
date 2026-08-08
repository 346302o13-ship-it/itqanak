import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppConfig } from "@itqanak/config";
import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";

import { AuthEmailOutboxProcessor, TestAuthEmailSender } from "../src/auth-email.js";
import { requireAdmin } from "../src/authorization.js";
import { decryptAuthEmailPayload } from "../src/email-payload.js";
import type { RateLimiter } from "../src/rate-limit.js";
import { AuthService } from "../src/service.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const payloadKey = Buffer.alloc(32, 23).toString("base64");

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.test`;
}

function config(databaseUrl: string): AppConfig {
  return {
    nodeEnv: "test",
    serviceName: "auth-integration",
    appName: "ITQANAK",
    defaultLocale: "ar",
    publicAppUrl: "https://app.itqanak.test",
    adminAppUrl: "https://admin.itqanak.test/ar/admin",
    migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    logLevel: "error",
    whatsapp: { mode: "disabled" },
    storage: { driver: "local", maxUploadBytes: 26_214_400 },
    auth: {
      studentSessionAbsoluteTtlSeconds: 2_592_000,
      studentSessionIdleTtlSeconds: 604_800,
      adminSessionAbsoluteTtlSeconds: 43_200,
      adminSessionIdleTtlSeconds: 7_200,
      emailVerificationTtlSeconds: 86_400,
      passwordResetTtlSeconds: 1_800,
      rateLimitEnabled: true,
      emailDeliveryMode: "test",
      termsVersion: "2026-08",
      privacyVersion: "2026-08",
      emailPayloadKey: payloadKey,
    },
    databaseUrl,
  };
}

async function newestPayload(database: DatabaseClient, userId: string, kind: string) {
  const rows = await database<
    {
      readonly encrypted_payload: string;
      readonly status: string;
      readonly validator_hash: string;
    }[]
  >`
    SELECT auth_email_outbox.encrypted_payload, auth_email_outbox.status, email_verification_tokens.validator_hash
    FROM auth_email_outbox
    JOIN email_verification_tokens ON email_verification_tokens.user_id = auth_email_outbox.user_id
    WHERE auth_email_outbox.user_id = ${userId} AND auth_email_outbox.email_kind = ${kind}
    ORDER BY auth_email_outbox.created_at DESC LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected authentication email payload was not found.");
  }
  return row;
}

integrationDescribe("authentication service integration", () => {
  let database: DatabaseClient;
  let service: AuthService;
  let appConfig: AppConfig;

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    appConfig = config(integrationDatabaseUrl!);
    await runMigrations(database, { migrationsDirectory: appConfig.migrationsDirectory });
    service = new AuthService({ database, config: appConfig });
  });

  afterAll(async () => {
    await closeDatabase(database);
  });

  it("registers only a pending STUDENT, keeps the verification token encrypted, and rejects duplicates", async () => {
    await expect(
      service.registerStudent({
        email: uniqueEmail("stale-legal-version"),
        displayName: "طالب بنسخة قديمة",
        password: "stale legal version passphrase 2026",
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsVersion: "superseded-version",
        privacyVersion: "2026-08",
      }),
    ).rejects.toMatchObject({ code: "LEGAL_CONSENT_VERSION_MISMATCH" });

    const email = uniqueEmail("student");
    await expect(
      service.registerStudent({
        email,
        displayName: "طالب اختبار",
        password: "correct horse battery staple 2026",
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsVersion: "2026-08",
        privacyVersion: "2026-08",
        ipHash: "test-ip-hash",
      }),
    ).resolves.toEqual({ created: true });

    const userRows = await database<
      { readonly id: string; readonly status: string; readonly role_code: string }[]
    >`
      SELECT users.id, users.status, user_roles.role_code
      FROM users JOIN user_roles ON user_roles.user_id = users.id
      WHERE users.email_normalized = ${email}
    `;
    expect(userRows).toHaveLength(1);
    expect(userRows[0]).toMatchObject({ status: "PENDING_VERIFICATION", role_code: "STUDENT" });
    const user = userRows[0]!;

    const delivery = await newestPayload(database, user.id, "VERIFY_EMAIL");
    const payload = decryptAuthEmailPayload(delivery.encrypted_payload, payloadKey);
    expect(payload.token).toBeDefined();
    expect(delivery.encrypted_payload).not.toContain(payload.token!);
    expect(delivery.validator_hash).not.toBe(payload.token);

    await expect(
      service.registerStudent({
        email: email.toUpperCase(),
        displayName: "طالب آخر",
        password: "different secure passphrase 2026",
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsVersion: "2026-08",
        privacyVersion: "2026-08",
      }),
    ).resolves.toEqual({ created: false });

    const concurrentEmail = uniqueEmail("concurrent-student");
    const concurrentRegistrations = await Promise.all([
      service.registerStudent({
        email: concurrentEmail,
        displayName: "طالب متزامن أول",
        password: "first concurrent registration passphrase 2026",
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsVersion: "2026-08",
        privacyVersion: "2026-08",
      }),
      service.registerStudent({
        email: concurrentEmail.toUpperCase(),
        displayName: "طالب متزامن ثان",
        password: "second concurrent registration passphrase 2026",
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsVersion: "2026-08",
        privacyVersion: "2026-08",
      }),
    ]);
    expect(concurrentRegistrations.map((result) => result.created).sort()).toEqual([false, true]);

    await expect(
      service.login({ email, password: "correct horse battery staple 2026" }),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });

  it("verifies once, stores only a session hash, and supports logout and password reset revocation", async () => {
    const email = uniqueEmail("verified");
    await service.registerStudent({
      email,
      displayName: "طالب موثق",
      password: "correct horse battery staple 2026",
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsVersion: "2026-08",
      privacyVersion: "2026-08",
    });
    const userRows = await database<{ readonly id: string }[]>`
      SELECT id FROM users WHERE email_normalized = ${email}
    `;
    const userId = userRows[0]?.id;
    if (userId === undefined) {
      throw new Error("Expected student was not created.");
    }
    const verification = await newestPayload(database, userId, "VERIFY_EMAIL");
    const verificationToken = decryptAuthEmailPayload(
      verification.encrypted_payload,
      payloadKey,
    ).token;
    if (verificationToken === undefined) {
      throw new Error("Expected verification token was not present.");
    }

    await service.verifyEmail(verificationToken, { ipHash: "verify-ip" });
    await expect(
      service.verifyEmail(verificationToken, { ipHash: "verify-ip" }),
    ).rejects.toMatchObject({
      code: "TOKEN_USED",
    });
    const verificationFailures = await database<{ readonly count: string }[]>`
      SELECT count(*)::text AS count FROM security_audit_events
      WHERE target_user_id = ${userId} AND event_type = 'auth.email_verification_failed'
    `;
    expect(Number(verificationFailures[0]?.count ?? "0")).toBeGreaterThan(0);

    const login = await service.login({
      email,
      password: "correct horse battery staple 2026",
      ipHash: "login-ip",
    });
    expect(login.principal.roles).toContain("STUDENT");
    const sessionRows = await database<{ readonly validator_hash: string }[]>`
      SELECT validator_hash FROM user_sessions WHERE id = ${login.sessionId}
    `;
    expect(sessionRows[0]?.validator_hash).not.toBe(login.token);
    expect(await service.authenticateSession(login.token)).toMatchObject({
      userId,
      sessionId: login.sessionId,
    });

    await service.logout(login.token, { ipHash: "logout-ip" });
    await expect(service.authenticateSession(login.token)).resolves.toBeUndefined();

    await service.requestPasswordReset(email, { ipHash: "reset-ip" });
    const resetRows = await database<{ readonly encrypted_payload: string }[]>`
      SELECT encrypted_payload FROM auth_email_outbox
      WHERE user_id = ${userId} AND email_kind = 'PASSWORD_RESET'
      ORDER BY created_at DESC LIMIT 1
    `;
    const resetToken = decryptAuthEmailPayload(resetRows[0]!.encrypted_payload, payloadKey).token;
    if (resetToken === undefined) {
      throw new Error("Expected reset token was not present.");
    }
    await service.resetPassword({
      token: resetToken,
      password: "a new correct horse battery staple 2026",
      ipHash: "reset-confirm-ip",
    });
    const consumedResetEmails = await database<
      { readonly status: string; readonly encrypted_payload: string | null }[]
    >`
      SELECT status, encrypted_payload FROM auth_email_outbox
      WHERE user_id = ${userId} AND email_kind = 'PASSWORD_RESET'
    `;
    expect(consumedResetEmails).not.toHaveLength(0);
    expect(consumedResetEmails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "DEAD", encrypted_payload: null }),
      ]),
    );
    await expect(
      service.resetPassword({
        token: resetToken,
        password: "another correct horse battery staple 2026",
        ipHash: "reset-confirm-ip",
      }),
    ).rejects.toMatchObject({ code: "TOKEN_USED" });
    await expect(
      service.login({ email, password: "a new correct horse battery staple 2026" }),
    ).resolves.toMatchObject({ principal: { userId } });
  });

  it("rejects expired verification tokens and applies IP plus identity rate-limit scopes", async () => {
    const email = uniqueEmail("expired-verification");
    await service.registerStudent({
      email,
      displayName: "طالب برابط منتهٍ",
      password: "expired verification passphrase 2026",
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsVersion: "2026-08",
      privacyVersion: "2026-08",
    });
    const users = await database<{ readonly id: string }[]>`
      SELECT id FROM users WHERE email_normalized = ${email}
    `;
    const userId = users[0]?.id;
    if (userId === undefined) {
      throw new Error("Expected expiring-token student was not created.");
    }
    const delivery = await newestPayload(database, userId, "VERIFY_EMAIL");
    const token = decryptAuthEmailPayload(delivery.encrypted_payload, payloadKey).token;
    if (token === undefined) {
      throw new Error("Expected expiring verification token was not present.");
    }
    await database`
      UPDATE email_verification_tokens
      SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
      WHERE user_id = ${userId} AND used_at IS NULL AND revoked_at IS NULL
    `;
    await expect(service.verifyEmail(token, { ipHash: "expired-token-ip" })).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });

    const scopes: string[] = [];
    const recordingLimiter: RateLimiter = {
      enforce: async (rule) => {
        scopes.push(rule.scope);
        return { allowed: true, remaining: rule.limit - 1 };
      },
    };
    const limitedService = new AuthService({
      database,
      config: appConfig,
      rateLimiter: recordingLimiter,
    });
    await expect(
      limitedService.requestPasswordReset(uniqueEmail("unknown-reset"), {
        ipHash: "rate-limit-ip",
      }),
    ).resolves.toBeUndefined();
    expect(scopes).toEqual(["reset-ip", "reset-email"]);
  });

  it("applies ADMIN permission checks and test-processes encrypted email outbox work once", async () => {
    const adminEmail = uniqueEmail("admin");
    await service.createAdmin({
      email: adminEmail,
      displayName: "مدير اختبار",
      password: "correct horse battery staple 2026",
    });
    const adminLogin = await service.login({
      email: adminEmail,
      password: "correct horse battery staple 2026",
    });
    expect(() => requireAdmin(adminLogin.principal)).not.toThrow();

    const sender = new TestAuthEmailSender();
    const processor = new AuthEmailOutboxProcessor(
      database,
      appConfig,
      sender,
      createLogger({ service: "auth-integration", environment: "test", level: "error" }),
      "integration-worker",
    );
    const processed = await processor.processBatch(50);
    expect(processed).toBeGreaterThan(0);
    expect(sender.messages.length).toBeGreaterThan(0);
    expect(sender.messages.length).toBeLessThanOrEqual(processed);
    expect(sender.messages.every((message) => message.idempotencyKey !== undefined)).toBe(true);
    expect(new Set(sender.messages.map((message) => message.idempotencyKey)).size).toBe(
      sender.messages.length,
    );
    await expect(processor.processBatch(50)).resolves.toBe(0);
    const remaining = await database<{ readonly count: string }[]>`
      SELECT count(*)::text AS count FROM auth_email_outbox
      WHERE status = 'PENDING' AND encrypted_payload IS NOT NULL
    `;
    expect(remaining[0]?.count).toBe("0");
  });
});
