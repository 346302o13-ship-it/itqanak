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

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
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
    academicIntegrityVersion: "2026-08",
    migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    logLevel: "error",
    whatsapp: { mode: "disabled", graphApiVersion: "v25.0", maxAttempts: 8 },
    storage: {
      driver: "local",
      localPath: "/tmp/itqanak-test-uploads",
      maxFileBytes: 20_971_520,
      maxFilesPerRequest: 10,
      maxTotalBytesPerRequest: 104_857_600,
    },
    fileScanning: {
      mode: "disabled",
      clamavHost: "clamav",
      clamavPort: 3310,
      connectTimeoutMs: 3_000,
      scanTimeoutMs: 30_000,
      maxAttempts: 5,
    },
    operationalControls: { maintenanceCacheTtlMs: 2_000 },
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
  let administratorId: string;
  const administratorEmail = uniqueEmail("single-integration-admin");
  const administratorPassword = "single integration admin passphrase 2026";

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    appConfig = config(integrationDatabaseUrl!);
    await runMigrations(database, { migrationsDirectory: appConfig.migrationsDirectory });
    service = new AuthService({ database, config: appConfig });
    administratorId = await service.createAdmin({
      email: administratorEmail,
      displayName: "مدير التكامل الوحيد",
      password: administratorPassword,
    });
  });

  afterAll(async () => {
    // Audit rows are append-only and intentionally retain the actor identity.
    // Release only the single ADMIN role so the next serial suite can create
    // its own administrator fixture without mutating audit history.
    await database`
      DELETE FROM user_roles
      WHERE user_id = ${administratorId} AND role_code = 'ADMIN'
    `;
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
    ).resolves.toEqual({ created: true, verificationMethod: "EMAIL" });

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
    ).resolves.toEqual({ created: false, verificationMethod: "EMAIL" });

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

  it("registers a phone-first student and requires audited ADMIN WhatsApp confirmation", async () => {
    const adminSession = await service.login({
      identity: administratorEmail,
      password: administratorPassword,
    });

    const phone = `+9665${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
    const email = uniqueEmail("phone-first-student");
    const password = "phone first student passphrase 2026";
    await expect(
      service.registerStudent({
        email: `  ${email.toUpperCase()}  `,
        phone,
        countryCode: "SA",
        displayName: "طالب تأكيد الجوال",
        password,
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsVersion: "2026-08",
        privacyVersion: "2026-08",
      }),
    ).resolves.toEqual({ created: true, verificationMethod: "PHONE" });

    const studentRows = await database<
      {
        readonly id: string;
        readonly email: string | null;
        readonly email_normalized: string | null;
        readonly email_verified_at: Date | null;
        readonly status: string;
        readonly verification_token_count: string;
        readonly verification_email_count: string;
      }[]
    >`
      SELECT users.id, users.email, users.email_normalized, users.email_verified_at, users.status,
             (SELECT count(*)::text FROM email_verification_tokens
              WHERE email_verification_tokens.user_id = users.id) AS verification_token_count,
             (SELECT count(*)::text FROM auth_email_outbox
              WHERE auth_email_outbox.user_id = users.id
                AND auth_email_outbox.email_kind = 'VERIFY_EMAIL') AS verification_email_count
      FROM users WHERE phone_e164 = ${phone}
    `;
    expect(studentRows[0]).toMatchObject({
      email: email.toUpperCase(),
      email_normalized: email,
      email_verified_at: null,
      status: "PENDING_VERIFICATION",
      verification_token_count: "0",
      verification_email_count: "0",
    });
    const studentId = studentRows[0]?.id;
    if (studentId === undefined) {
      throw new Error("Expected phone-first student was not created.");
    }
    const duplicateEmailPhone = `+9665${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
    await expect(
      service.registerStudent({
        email: email.toLowerCase(),
        phone: duplicateEmailPhone,
        countryCode: "SA",
        displayName: "طالب ببريد مكرر",
        password: "duplicate email phone registration passphrase 2026",
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsVersion: "2026-08",
        privacyVersion: "2026-08",
      }),
    ).resolves.toEqual({ created: false, verificationMethod: "PHONE" });
    const normalizedEmailUsers = await database<{ readonly count: string }[]>`
      SELECT count(*)::text AS count FROM users WHERE email_normalized = ${email}
    `;
    expect(normalizedEmailUsers[0]?.count).toBe("1");
    await expect(service.login({ identity: phone, password })).rejects.toMatchObject({
      code: "PHONE_NOT_VERIFIED",
    });

    const pending = await service.listPendingPhoneVerifications(adminSession.principal, 100, {
      requestId: "phone-list-test",
    });
    expect(pending).toContainEqual(
      expect.objectContaining({ userId: studentId, phoneE164: phone, countryCode: "SA" }),
    );

    await expect(
      service.confirmPhoneVerification(
        adminSession.principal,
        studentId,
        { reference: "wamid.integration-test", note: "Matched inbound WhatsApp sender." },
        { requestId: "phone-confirm-test" },
      ),
    ).resolves.toBe(true);
    await expect(
      service.confirmPhoneVerification(adminSession.principal, studentId, {
        reference: "wamid.integration-test-replay",
      }),
    ).resolves.toBe(false);
    await expect(service.login({ identity: phone, password })).resolves.toMatchObject({
      principal: { userId: studentId, phoneE164: phone, countryCode: "SA", status: "ACTIVE" },
    });

    const auditRows = await database<{ readonly event_type: string }[]>`
      SELECT event_type FROM security_audit_events
      WHERE request_id IN ('phone-list-test', 'phone-confirm-test')
      ORDER BY occurred_at ASC, id ASC
    `;
    expect(auditRows.map((row) => row.event_type)).toEqual([
      "auth.phone_verifications_listed",
      "auth.phone_verification_confirmed",
    ]);
  });

  it("creates a verified student administratively without leaking setup credentials", async () => {
    const adminSession = await service.login({
      identity: administratorEmail,
      password: administratorPassword,
    });
    const phone = `+9655${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
    const created = await service.createStudentByAdmin(
      adminSession.principal,
      {
        displayName: "طالب أنشأه المدير",
        phone,
        countryCode: "KW",
        whatsappReference: "wamid.admin-created-student",
        note: "Matched the inbound sender with the registered number.",
      },
      { requestId: "admin-student-create-test" },
    );
    expect(created.student).toMatchObject({
      displayName: "طالب أنشأه المدير",
      phoneE164: phone,
      countryCode: "KW",
      phoneVerified: true,
      status: "ACTIVE",
    });
    expect(created.recovery.token).toMatch(/^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/u);
    expect(created.recovery.request.resetTokenExpiresAt).toEqual(created.recovery.tokenExpiresAt);

    const listed = await service.listStudents(
      adminSession.principal,
      { search: phone.slice(-4), activeOnly: true },
      { requestId: "admin-student-list-test" },
    );
    expect(listed.items).toContainEqual(expect.objectContaining({ id: created.student.id }));
    const stored = await database<
      {
        readonly status: string;
        readonly role_code: string;
        readonly password_hash: string;
        readonly validator_hash: string;
      }[]
    >`
      SELECT users.status, user_roles.role_code, credentials.password_hash,
             reset_tokens.validator_hash
      FROM users
      INNER JOIN user_roles ON user_roles.user_id = users.id
      INNER JOIN user_credentials AS credentials ON credentials.user_id = users.id
      INNER JOIN phone_password_reset_requests AS recovery ON recovery.user_id = users.id
      INNER JOIN password_reset_tokens AS reset_tokens
        ON reset_tokens.id = recovery.password_reset_token_id
      WHERE users.id = ${created.student.id}
    `;
    expect(stored[0]).toMatchObject({ status: "ACTIVE", role_code: "STUDENT" });
    expect(stored[0]?.password_hash).not.toContain(created.recovery.token);
    expect(stored[0]?.validator_hash).not.toContain(created.recovery.token);

    const outbox = await database<
      {
        readonly event_type: string;
        readonly aggregate_type: string;
        readonly aggregate_id: string;
        readonly payload: unknown;
      }[]
    >`
      SELECT event_type, aggregate_type, aggregate_id, payload
      FROM outbox_events
      WHERE aggregate_id = ${created.student.id}
        AND event_type = 'ACCOUNT_REGISTRATION_CREATED'
    `;
    expect(outbox).toEqual([
      expect.objectContaining({
        event_type: "ACCOUNT_REGISTRATION_CREATED",
        aggregate_type: "USER",
        aggregate_id: created.student.id,
        payload: { schemaVersion: 1, source: "ADMIN" },
      }),
    ]);
    const audit = await database<{ readonly event_type: string; readonly metadata: unknown }[]>`
      SELECT event_type, metadata FROM security_audit_events
      WHERE request_id IN ('admin-student-create-test', 'admin-student-list-test')
      ORDER BY occurred_at ASC, id ASC
    `;
    expect(audit.map((row) => row.event_type)).toEqual([
      "auth.student_created_by_admin",
      "auth.students_listed_by_admin",
    ]);
    const evidence = JSON.stringify({ outbox, audit });
    expect(evidence).not.toContain(created.recovery.token);
    expect(evidence).not.toContain(phone);
    expect(evidence).not.toContain("wamid.admin-created-student");

    await expect(
      service.createStudentByAdmin(adminSession.principal, {
        displayName: "حساب مكرر",
        phone,
        countryCode: "KW",
        whatsappReference: "wamid.duplicate-student",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });

    const chosenPassword = "student selected setup passphrase 2026";
    await service.resetPassword({
      token: created.recovery.token,
      password: chosenPassword,
      ipHash: "admin-created-student-reset-ip",
    });
    await expect(
      service.login({ identity: phone, password: chosenPassword }),
    ).resolves.toMatchObject({ principal: { userId: created.student.id, roles: ["STUDENT"] } });
  });

  it("issues a one-time phone recovery link only after an audited administrator review", async () => {
    const adminSession = await service.login({
      identity: administratorEmail,
      password: administratorPassword,
    });
    const phone = `+9715${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
    const oldPassword = "phone recovery old passphrase 2026";
    const newPassword = "phone recovery new passphrase 2026";
    await service.registerStudent({
      email: uniqueEmail("phone-recovery-student"),
      phone,
      countryCode: "AE",
      displayName: "طالب استعادة الحساب",
      password: oldPassword,
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsVersion: "2026-08",
      privacyVersion: "2026-08",
    });
    const users = await database<{ readonly id: string }[]>`
      SELECT id FROM users WHERE phone_e164 = ${phone}
    `;
    const userId = users[0]?.id;
    if (userId === undefined) throw new Error("Expected phone recovery student was not created.");
    await service.confirmPhoneVerification(adminSession.principal, userId, {
      reference: "wa-phone-recovery-verification",
    });

    const unknown = await service.requestPhonePasswordReset({
      phone: "+971500000000",
      countryCode: "AE",
      ipHash: "phone-reset-unknown-ip",
    });
    expect(unknown.reference).toMatch(/^PR-[A-F0-9]{10}$/u);
    const unknownRows = await database<{ readonly count: string }[]>`
      SELECT count(*)::text AS count FROM phone_password_reset_requests
      WHERE public_reference = ${unknown.reference}
    `;
    expect(unknownRows[0]?.count).toBe("0");
    const unknownRepeated = await service.requestPhonePasswordReset({
      phone: "+971500000000",
      countryCode: "AE",
      ipHash: "phone-reset-unknown-replay-ip",
    });
    expect(unknownRepeated.reference).toMatch(/^PR-[A-F0-9]{10}$/u);
    expect(unknownRepeated.reference).not.toBe(unknown.reference);

    const requested = await service.requestPhonePasswordReset({
      phone,
      countryCode: "AE",
      ipHash: "phone-reset-request-ip",
      requestId: "phone-reset-request-test",
    });
    const repeated = await service.requestPhonePasswordReset({
      phone,
      countryCode: "AE",
      ipHash: "phone-reset-request-replay-ip",
    });
    expect(requested.reference).toMatch(/^PR-[A-F0-9]{10}$/u);
    expect(repeated.reference).toMatch(/^PR-[A-F0-9]{10}$/u);
    expect(repeated.reference).not.toBe(requested.reference);
    const staleRows = await database<{ readonly status: string }[]>`
      SELECT status FROM phone_password_reset_requests
      WHERE public_reference = ${requested.reference}
    `;
    expect(staleRows[0]?.status).toBe("PENDING");
    const pending = await service.listPhonePasswordResetRequests(adminSession.principal, 100, {
      requestId: "phone-reset-list-test",
    });
    const recovery = pending.find((item) => item.publicReference === repeated.reference);
    if (recovery === undefined) throw new Error("Expected pending phone recovery request.");

    await expect(
      service.issuePhonePasswordReset(adminSession.principal, recovery.id, {
        publicReference: "PR-0000000000",
        whatsappReference: "wa-mismatched-reference",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });

    const issued = await service.issuePhonePasswordReset(
      adminSession.principal,
      recovery.id,
      {
        publicReference: repeated.reference,
        whatsappReference: "wa-phone-recovery-review",
        note: "Reference and registered sender number matched.",
      },
      { requestId: "phone-reset-issue-test" },
    );
    expect(issued.request.status).toBe("APPROVED");
    const supersededRows = await database<{ readonly status: string }[]>`
      SELECT status FROM phone_password_reset_requests
      WHERE public_reference = ${requested.reference}
    `;
    expect(supersededRows[0]?.status).toBe("EXPIRED");
    expect(issued.token).toMatch(/^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/u);
    const [selector, validator] = issued.token.split(".");
    const tokenRows = await database<
      {
        readonly selector: string;
        readonly validator_hash: string;
        readonly password_hash: string;
        readonly expires_at: Date;
      }[]
    >`
      SELECT tokens.selector, tokens.validator_hash, tokens.expires_at,
             credentials.password_hash
      FROM phone_password_reset_requests AS requests
      INNER JOIN password_reset_tokens AS tokens ON tokens.id = requests.password_reset_token_id
      INNER JOIN user_credentials AS credentials ON credentials.user_id = requests.user_id
      WHERE requests.id = ${recovery.id}
    `;
    expect(tokenRows[0]?.selector).toBe(selector);
    expect(tokenRows[0]?.validator_hash).not.toBe(validator);
    expect(tokenRows[0]?.password_hash).not.toContain(oldPassword);
    expect(tokenRows[0]?.password_hash).not.toContain(newPassword);
    expect(issued.request.resetTokenExpiresAt).toEqual(issued.tokenExpiresAt);
    expect(tokenRows[0]?.expires_at).toEqual(issued.tokenExpiresAt);
    const approved = await service.getPhonePasswordResetRequest(
      adminSession.principal,
      recovery.id,
    );
    expect(approved.resetTokenExpiresAt).toEqual(tokenRows[0]?.expires_at);

    await service.resetPassword({
      token: issued.token,
      password: newPassword,
      ipHash: "phone-reset-confirm-ip",
      requestId: "phone-reset-complete-test",
    });
    await expect(
      service.resetPassword({
        token: issued.token,
        password: "phone recovery replay passphrase 2026",
        ipHash: "phone-reset-confirm-ip",
      }),
    ).rejects.toMatchObject({ code: "TOKEN_USED" });
    await expect(service.login({ identity: phone, password: oldPassword })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(service.login({ identity: phone, password: newPassword })).resolves.toMatchObject({
      principal: { userId },
    });
    const completed = await service.getPhonePasswordResetRequest(
      adminSession.principal,
      recovery.id,
    );
    expect(completed.status).toBe("COMPLETED");
    expect(completed.resetTokenExpiresAt).toBeUndefined();
    const audit = await database<{ readonly event_type: string; readonly metadata: unknown }[]>`
      SELECT event_type, metadata FROM security_audit_events
      WHERE request_id IN (
        'phone-reset-request-test', 'phone-reset-list-test', 'phone-reset-issue-test',
        'phone-reset-complete-test'
      )
      ORDER BY occurred_at ASC, id ASC
    `;
    expect(audit.map((row) => row.event_type)).toEqual(
      expect.arrayContaining([
        "auth.phone_password_reset_requested",
        "auth.phone_password_resets_listed",
        "auth.phone_password_reset_issued",
        "auth.password_reset_completed",
        "auth.phone_password_reset_completed",
      ]),
    );
    expect(JSON.stringify(audit)).not.toContain(oldPassword);
    expect(JSON.stringify(audit)).not.toContain(newPassword);
    expect(JSON.stringify(audit)).not.toContain(issued.token);
    const publicRequestAudit = await database<
      { readonly actor_user_id: string | null; readonly target_user_id: string | null }[]
    >`
      SELECT actor_user_id, target_user_id FROM security_audit_events
      WHERE request_id = 'phone-reset-request-test'
    `;
    expect(publicRequestAudit[0]).toMatchObject({ actor_user_id: null, target_user_id: userId });

    const expiring = await service.requestPhonePasswordReset({
      phone,
      countryCode: "AE",
      ipHash: "phone-reset-expiry-ip",
    });
    const expiringRows = await database<{ readonly id: string }[]>`
      SELECT id FROM phone_password_reset_requests
      WHERE public_reference = ${expiring.reference}
    `;
    const expiringId = expiringRows[0]?.id;
    if (expiringId === undefined) throw new Error("Expected expiring recovery request.");
    await database`
      UPDATE phone_password_reset_requests
      SET requested_at = now() - interval '3 hours', expires_at = now() - interval '1 hour'
      WHERE id = ${expiringId}
    `;
    await expect(
      service.rejectPhonePasswordReset(
        adminSession.principal,
        expiringId,
        { reason: "The submitted reference expired before review." },
        { requestId: "phone-reset-expiry-test" },
      ),
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    await expect(
      service.getPhonePasswordResetRequest(adminSession.principal, expiringId),
    ).resolves.toMatchObject({ status: "EXPIRED" });

    // Regression for the user-root lock order: consuming one token while an
    // administrator issues the next token for the same account must settle,
    // never deadlock. Depending on which transaction owns the user lock first,
    // the old token is either consumed or safely revoked by the new issue.
    const firstConcurrentReference = await service.requestPhonePasswordReset({
      phone,
      countryCode: "AE",
      ipHash: "phone-reset-concurrency-a-ip",
    });
    const firstConcurrentRequest = (
      await service.listPhonePasswordResetRequests(adminSession.principal, 100)
    ).find((item) => item.publicReference === firstConcurrentReference.reference);
    if (firstConcurrentRequest === undefined) throw new Error("Expected first concurrent request.");
    const firstConcurrentIssue = await service.issuePhonePasswordReset(
      adminSession.principal,
      firstConcurrentRequest.id,
      {
        publicReference: firstConcurrentReference.reference,
        whatsappReference: "wa-concurrency-first",
      },
    );
    const secondConcurrentReference = await service.requestPhonePasswordReset({
      phone,
      countryCode: "AE",
      ipHash: "phone-reset-concurrency-b-ip",
    });
    const secondConcurrentRequest = (
      await service.listPhonePasswordResetRequests(adminSession.principal, 100)
    ).find((item) => item.publicReference === secondConcurrentReference.reference);
    if (secondConcurrentRequest === undefined)
      throw new Error("Expected second concurrent request.");
    const concurrent = await Promise.allSettled([
      service.resetPassword({
        token: firstConcurrentIssue.token,
        password: "phone recovery concurrent passphrase 2026",
        ipHash: "phone-reset-concurrent-confirm-ip",
      }),
      service.issuePhonePasswordReset(adminSession.principal, secondConcurrentRequest.id, {
        publicReference: secondConcurrentReference.reference,
        whatsappReference: "wa-concurrency-second",
      }),
    ]);
    expect(concurrent[1]?.status).toBe("fulfilled");
    if (concurrent[0]?.status === "rejected") {
      expect(concurrent[0].reason).toMatchObject({ code: "INVALID_TOKEN" });
    }
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
    const adminLogin = await service.login({
      email: administratorEmail,
      password: administratorPassword,
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
