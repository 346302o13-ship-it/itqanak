import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { seedDevelopmentCatalog } from "@itqanak/catalog";
import type { AppConfig } from "@itqanak/config";
import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";
import type { ObjectStorage } from "@itqanak/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal, Permission } from "@itqanak/auth";

import { NotificationService } from "../src/notification-service.js";
import { ServiceQuoteService } from "../src/quote-service.js";
import { UnifiedConversationService } from "../src/unified-conversation-service.js";
import { UnifiedConversationAttachmentService } from "../src/unified-attachments.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;

const studentPermissions = [
  "conversations.read.own",
  "conversations.send.own",
  "quotes.respond.own",
  "notifications.read.own",
] as const satisfies readonly Permission[];
const adminPermissions = [
  "admin.conversations.read",
  "admin.conversations.send",
  "admin.quotes.manage",
  "notifications.read.own",
] as const satisfies readonly Permission[];

async function createPrincipal(
  database: DatabaseClient,
  role: "ADMIN" | "STUDENT",
): Promise<AuthenticatedPrincipal> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const email = `${role.toLowerCase()}-${randomUUID()}@example.test`;
  await database`
    INSERT INTO users (
      id, email, email_normalized, display_name, status, email_verified_at
    ) VALUES (
      ${userId}, ${email}, ${email}, ${role === "ADMIN" ? "Unified Admin" : "Unified Student"},
      'ACTIVE', now()
    )
  `;
  await database`INSERT INTO user_roles (user_id, role_code) VALUES (${userId}, ${role})`;
  await database`
    INSERT INTO user_sessions (
      id, user_id, selector, validator_hash, expires_at, idle_expires_at
    ) VALUES (
      ${sessionId}, ${userId}, ${randomUUID().replaceAll("-", "")}, ${"f".repeat(64)},
      now() + interval '1 day', now() + interval '1 day'
    )
  `;
  return {
    userId,
    sessionId,
    roles: [role],
    permissions: role === "ADMIN" ? adminPermissions : studentPermissions,
    displayName: role === "ADMIN" ? "Unified Admin" : "Unified Student",
    email,
    status: "ACTIVE",
  };
}

integrationDescribe.sequential("unified student conversation, quotes, and notifications", () => {
  let database: DatabaseClient;
  let admin: AuthenticatedPrincipal;
  let student: AuthenticatedPrincipal;
  let conversationService: UnifiedConversationService;
  let quoteService: ServiceQuoteService;
  let notifications: NotificationService;
  let conversationId: string;
  let requestId: string;

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
    await seedDevelopmentCatalog(database, "test");
    admin = await createPrincipal(database, "ADMIN");
    student = await createPrincipal(database, "STUDENT");
    conversationService = new UnifiedConversationService({
      database,
      config: { nodeEnv: "test" },
    });
    quoteService = new ServiceQuoteService({ database, conversations: conversationService });
    notifications = new NotificationService({ database });
    conversationId = (await conversationService.getOrCreateOwnConversation(student)).id;
    const services = await database<{ readonly id: string }[]>`
      SELECT id FROM services WHERE active = true ORDER BY sort_order, id LIMIT 1
    `;
    if (services[0] === undefined) throw new Error("Expected seeded service.");
    const requests = await database<{ readonly id: string }[]>`
      INSERT INTO service_requests (
        student_user_id, service_id, status, title, description, urgency,
        submission_key, submission_fingerprint, academic_integrity_version,
        academic_integrity_accepted_at, submitted_at
      ) VALUES (
        ${student.userId}, ${services[0].id}, 'SUBMITTED', 'Unified quote request',
        'A complete integration request for the unified quote workflow.', 'NORMAL',
        ${randomUUID()}, ${"a".repeat(64)}, '2026-08', now(), now()
      ) RETURNING id
    `;
    if (requests[0] === undefined) throw new Error("Expected request fixture.");
    requestId = requests[0].id;
  });

  afterAll(async () => {
    if (database !== undefined && admin !== undefined) {
      await database`DELETE FROM user_roles WHERE user_id = ${admin.userId} AND role_code = 'ADMIN'`;
      await closeDatabase(database);
    }
  });

  it("does not break pending registration and creates the conversation on activation", async () => {
    const userId = randomUUID();
    const email = `pending-${randomUUID()}@example.test`;
    await database`
      INSERT INTO users (id, email, email_normalized, display_name, status)
      VALUES (${userId}, ${email}, ${email}, 'Pending Unified Student', 'PENDING_VERIFICATION')
    `;
    await expect(
      database`INSERT INTO user_roles (user_id, role_code) VALUES (${userId}, 'STUDENT')`,
    ).resolves.toBeDefined();
    expect(
      await database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count FROM support_conversations WHERE student_user_id = ${userId}
      `,
    ).toEqual([{ count: "0" }]);
    await database`
      UPDATE users SET status = 'ACTIVE', email_verified_at = now(), updated_at = now()
      WHERE id = ${userId}
    `;
    expect(
      await database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count FROM support_conversations WHERE student_user_id = ${userId}
      `,
    ).toEqual([{ count: "1" }]);
    const registrationEventId = randomUUID();
    await database`
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, idempotency_key, payload
      ) VALUES (
        ${registrationEventId}, 'ACCOUNT_REGISTRATION_CREATED', 'USER', ${userId},
        ${`account-registration-test:${userId}`},
        ${database.json({ schemaVersion: 1, userId })}
      )
    `;
    await database`
      INSERT INTO outbox_events (
        event_type, aggregate_type, aggregate_id, idempotency_key, payload
      ) VALUES (
        'ACCOUNT_REGISTRATION_CREATED', 'USER', ${userId},
        ${`account-registration-test:${userId}`},
        ${database.json({ schemaVersion: 1, userId })}
      ) ON CONFLICT (idempotency_key) DO NOTHING
    `;
    expect(
      await database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count FROM user_notifications
        WHERE recipient_user_id = ${admin.userId}
          AND kind = 'ACCOUNT_PENDING_APPROVAL'
          AND idempotency_key LIKE ${`account-registration:${registrationEventId}:%`}
      `,
    ).toEqual([{ count: "1" }]);
  });

  it("shows request summaries and delivers idempotent messages with notifications", async () => {
    await notifications.markAllRead(admin);
    const detail = await conversationService.getOrCreateOwnConversation(student);
    expect(detail.requests).toContainEqual(expect.objectContaining({ id: requestId }));
    const clientMessageId = randomUUID();
    const sent = await conversationService.sendMessage(student, conversationId, {
      contentType: "TEXT",
      body: "رسالة موحدة تشمل كل الطلبات.",
      clientMessageId,
    });
    const replay = await conversationService.sendMessage(student, conversationId, {
      contentType: "TEXT",
      body: "رسالة موحدة تشمل كل الطلبات.",
      clientMessageId,
    });
    expect(replay).toMatchObject({ idempotentReplay: true, message: { id: sent.message.id } });
    const adminInbox = await notifications.listNotifications(admin);
    expect(adminInbox.items).toContainEqual(
      expect.objectContaining({
        kind: "MESSAGE_RECEIVED",
        conversationId,
        actionHref: `/conversation?conversation=${conversationId}`,
      }),
    );
    await conversationService.markRead(admin, conversationId);
    expect(await notifications.getUnreadCount(admin)).toBe(0);

    await database`
      INSERT INTO service_request_events (
        request_id, event_type, actor_type, actor_user_id, request_version, metadata
      ) VALUES (
        ${requestId}, 'REQUEST_DETAILS_UPDATED', 'ADMIN', ${admin.userId}, 1, '{}'::jsonb
      )
    `;
    const adminConversations = await conversationService.listConversations(admin);
    expect(adminConversations.items.find((item) => item.id === conversationId)?.unreadCount).toBe(
      0,
    );
    const studentConversation = await conversationService.getOrCreateOwnConversation(student);
    expect(studentConversation.unreadCount).toBeGreaterThan(0);
  });

  it("withdraws an owned quote idempotently, then permits a replacement quote", async () => {
    const firstQuoteInput = {
      requestId,
      expectedRequestVersion: 1,
      amountMinor: 45_000,
      currency: "SAR",
      descriptionAr: "تنفيذ كامل وفق تفاصيل الطلب",
      descriptionEn: "Complete delivery based on the request details",
      expiresAt: new Date(Date.now() + 86_400_000),
      clientQuoteId: randomUUID(),
    } as const;
    const concurrentCreates = await Promise.all([
      quoteService.createQuote(admin, firstQuoteInput),
      quoteService.createQuote(admin, firstQuoteInput),
    ]);
    expect(concurrentCreates.map((item) => item.idempotentReplay).sort()).toEqual([false, true]);
    const created = concurrentCreates[0]!;
    expect(created.quote).toMatchObject({ status: "PENDING", version: 1 });

    const otherAdmin = { ...admin, userId: randomUUID(), sessionId: randomUUID() };
    await expect(
      quoteService.withdrawQuote(otherAdmin, created.quote.id, {
        expectedVersion: 1,
        expectedRequestVersion: 3,
        clientActionId: randomUUID(),
      }),
    ).rejects.toThrow("QUOTE_NOT_FOUND");

    const withdrawalActionId = randomUUID();
    const concurrentWithdrawals = await Promise.all([
      quoteService.withdrawQuote(admin, created.quote.id, {
        expectedVersion: 1,
        expectedRequestVersion: 3,
        clientActionId: withdrawalActionId,
      }),
      quoteService.withdrawQuote(admin, created.quote.id, {
        expectedVersion: 1,
        expectedRequestVersion: 3,
        clientActionId: withdrawalActionId,
      }),
    ]);
    expect(concurrentWithdrawals.map((item) => item.idempotentReplay).sort()).toEqual([
      false,
      true,
    ]);
    expect(concurrentWithdrawals[0]?.quote).toMatchObject({ status: "WITHDRAWN", version: 2 });
    expect(concurrentWithdrawals[0]?.message.body).toBe("SERVICE_QUOTE_WITHDRAWN");
    expect(
      await database<{ readonly status: string; readonly version: number }[]>`
        SELECT status, version FROM service_requests WHERE id = ${requestId}
      `,
    ).toEqual([{ status: "UNDER_REVIEW", version: 4 }]);
    expect(
      await database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count FROM security_audit_events
        WHERE event_type = 'service_quote.withdrawn' AND resource_id = ${created.quote.id}
      `,
    ).toEqual([{ count: "1" }]);
    expect(
      await database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count FROM user_notifications
        WHERE recipient_user_id = ${student.userId}
          AND quote_id = ${created.quote.id}
          AND kind = 'REQUEST_UPDATED'
      `,
    ).toEqual([{ count: "1" }]);

    const second = await quoteService.createQuote(admin, {
      requestId,
      expectedRequestVersion: 4,
      amountMinor: 44_000,
      currency: "SAR",
      descriptionAr: "عرض بديل بعد سحب العرض السابق",
      descriptionEn: "Replacement quote after withdrawing the previous quote",
      expiresAt: new Date(Date.now() + 86_400_000),
      clientQuoteId: randomUUID(),
    });
    const rejected = await quoteService.respondToQuote(student, second.quote.id, {
      expectedVersion: 1,
      decision: "REJECT",
      clientActionId: randomUUID(),
    });
    expect(rejected.quote.status).toBe("REJECTED");
    expect(
      await database<{ readonly status: string; readonly version: number }[]>`
        SELECT status, version FROM service_requests WHERE id = ${requestId}
      `,
    ).toEqual([{ status: "UNDER_REVIEW", version: 6 }]);

    const acceptedQuote = await quoteService.createQuote(admin, {
      requestId,
      expectedRequestVersion: 6,
      amountMinor: 42_000,
      currency: "SAR",
      descriptionAr: "عرض معدل بعد ملاحظات الطالب",
      descriptionEn: "Revised quote after the student's feedback",
      expiresAt: new Date(Date.now() + 86_400_000),
      clientQuoteId: randomUUID(),
    });
    const responseClientId = randomUUID();
    const accepted = await quoteService.respondToQuote(student, acceptedQuote.quote.id, {
      expectedVersion: 1,
      decision: "ACCEPT",
      clientActionId: responseClientId,
    });
    expect(accepted.quote.status).toBe("ACCEPTED");
    const replay = await quoteService.respondToQuote(student, acceptedQuote.quote.id, {
      expectedVersion: 1,
      decision: "ACCEPT",
      clientActionId: responseClientId,
    });
    expect(replay.idempotentReplay).toBe(true);
    const due = await database<
      { readonly status: string; readonly amount_minor: number | string; readonly count: string }[]
    >`
      SELECT min(dues.status)::text AS status, min(dues.amount_minor)::bigint AS amount_minor,
             count(*)::text AS count
      FROM service_quote_finance_dues AS mappings
      INNER JOIN finance_dues AS dues ON dues.id = mappings.due_id
      WHERE mappings.quote_id = ${acceptedQuote.quote.id}
    `;
    expect(due).toEqual([{ status: "UNPAID", amount_minor: "42000", count: "1" }]);
  });

  it("serializes upload reservations and scopes quotas to a request or a rolling general window", async () => {
    const values = Array.from({ length: 10 }, () => randomUUID());
    for (const attachmentId of values) {
      await database`
        INSERT INTO unified_conversation_attachments (
          id, conversation_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, declared_mime_type, size_bytes,
          storage_status, scan_status, created_at, updated_at
        ) VALUES (
          ${attachmentId}, ${conversationId}, ${student.userId}, 'local',
          ${`conversations/${conversationId}/${attachmentId}/${"b".repeat(32)}`},
          'old.txt', '.txt', 'text/plain', 10, 'PENDING_UPLOAD', 'NOT_REQUIRED',
          now() - interval '25 hours', now() - interval '25 hours'
        )
      `;
    }
    const requestAttachmentIds = Array.from({ length: 10 }, () => randomUUID());
    for (const attachmentId of requestAttachmentIds) {
      await database`
        INSERT INTO unified_conversation_attachments (
          id, conversation_id, request_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, declared_mime_type, size_bytes,
          storage_status, scan_status
        ) VALUES (
          ${attachmentId}, ${conversationId}, ${requestId}, ${student.userId}, 'local',
          ${`conversations/${conversationId}/${attachmentId}/${"c".repeat(32)}`},
          'request.txt', '.txt', 'text/plain', 10, 'PENDING_UPLOAD', 'NOT_REQUIRED'
        )
      `;
    }
    const config = {
      nodeEnv: "test",
      fileScanning: { mode: "disabled" },
      storage: {
        maxFileBytes: 20_971_520,
        maxFilesPerRequest: 10,
        maxTotalBytesPerRequest: 104_857_600,
      },
    } as unknown as AppConfig;
    const storedKeys = new Set<string>();
    const storage: ObjectStorage = {
      provider: "local",
      put: async (key, input, metadata) => {
        let received = 0;
        const stream = input instanceof Readable ? input : Readable.from([input]);
        for await (const chunk of stream) {
          received += Buffer.isBuffer(chunk) ? chunk.length : Buffer.from(chunk).length;
        }
        expect(received).toBe(metadata.contentLength);
        storedKeys.add(key);
        return { key, checksumSha256: "d".repeat(64), contentLength: received };
      },
      open: async () => Readable.from([]),
      signDownload: async () => "https://invalid.test/private",
      exists: async (key) => storedKeys.has(key),
      remove: async (key) => {
        storedKeys.delete(key);
      },
    };
    const attachments = new UnifiedConversationAttachmentService({ database, config, storage });
    await expect(
      attachments.assertUploadAdmission(student, conversationId, 10),
    ).resolves.toBeUndefined();
    await expect(
      attachments.assertUploadAdmission(student, conversationId, 10, requestId),
    ).rejects.toMatchObject({ code: "MAX_FILES_EXCEEDED" });

    const bytes = Buffer.from("atomic quota", "utf8");
    const constrained = new UnifiedConversationAttachmentService({
      database,
      storage,
      config: {
        ...config,
        storage: { ...config.storage, maxFilesPerRequest: 2 },
      },
    });
    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, (_, index) =>
        constrained.addAttachment(student, conversationId, {
          filename: `concurrent-${index}.txt`,
          declaredMimeType: "text/plain",
          contentLength: bytes.length,
          header: bytes,
          body: Readable.from([bytes]),
        }),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(2);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      reason: { code: "MAX_FILES_EXCEEDED" },
    });
  });
});
