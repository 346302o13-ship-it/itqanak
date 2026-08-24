import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "../src/index.js";

const upgradeDatabaseUrl = process.env.UPGRADE_TEST_DATABASE_URL;
const integrationDescribe = upgradeDatabaseUrl === undefined ? describe.skip : describe;

integrationDescribe.sequential("unified conversation historical upgrade", () => {
  let database: DatabaseClient;
  let legacyMigrationsDirectory: string;
  const migrationsDirectory = resolve(process.env.MIGRATIONS_DIR ?? "migrations");

  beforeAll(async () => {
    database = createDatabase(upgradeDatabaseUrl!);
    legacyMigrationsDirectory = await mkdtemp(join(tmpdir(), "itqanak-upgrade-018-"));
    const filenames = (await readdir(migrationsDirectory))
      .filter((filename) => /^(?:00[1-9]|01[0-8])_/u.test(filename))
      .sort();
    expect(filenames).toHaveLength(18);
    for (const filename of filenames) {
      await writeFile(
        join(legacyMigrationsDirectory, filename),
        await readFile(join(migrationsDirectory, filename)),
        { mode: 0o600 },
      );
    }
    await runMigrations(database, { migrationsDirectory: legacyMigrationsDirectory });
  });

  afterAll(async () => {
    await closeDatabase(database);
  });

  it("backdates a migration-016 conversation before copying older request messages", async () => {
    const studentId = randomUUID();
    const categoryId = randomUUID();
    const serviceId = randomUUID();
    const requestId = randomUUID();
    const oldCreatedAt = new Date("2026-01-10T10:00:00.000Z");
    const oldMessageAt = new Date("2026-01-10T11:00:00.000Z");

    await database`
      INSERT INTO users (id, email, email_normalized, display_name, status, email_verified_at)
      VALUES (
        ${studentId}, ${`upgrade-${studentId}@example.test`},
        ${`upgrade-${studentId}@example.test`}, 'Upgrade Student', 'ACTIVE', now()
      )
    `;
    await database`INSERT INTO user_roles (user_id, role_code) VALUES (${studentId}, 'STUDENT')`;
    await database`
      INSERT INTO support_conversations (student_user_id, created_by_user_id)
      VALUES (${studentId}, ${studentId})
    `;
    await database`
      INSERT INTO service_categories (
        id, slug, name_ar, description_ar, name_en, description_en
      ) VALUES (
        ${categoryId}, ${`upgrade-${categoryId.slice(0, 8)}`}, 'فئة ترقية',
        'وصف عربي صالح لاختبار ترقية المحادثة التاريخية.', 'Upgrade category',
        'A valid category used for the historical conversation upgrade test.'
      )
    `;
    await database`
      INSERT INTO services (
        id, category_id, slug, name_ar, short_description_ar, description_ar,
        name_en, short_description_en, description_en, pricing_model
      ) VALUES (
        ${serviceId}, ${categoryId}, ${`upgrade-service-${serviceId.slice(0, 8)}`},
        'خدمة ترقية', 'وصف مختصر صالح لخدمة اختبار الترقية.',
        'وصف عربي كامل صالح لخدمة اختبار ترقية سجل المحادثة التاريخي.',
        'Upgrade service', 'A valid short description for the upgrade service.',
        'A complete valid description for the historical conversation upgrade service.',
        'QUOTE_REQUIRED'
      )
    `;
    await database`
      INSERT INTO service_requests (
        id, student_user_id, service_id, status, title, description,
        submission_key, submission_fingerprint, academic_integrity_version,
        academic_integrity_accepted_at, submitted_at, created_at, updated_at
      ) VALUES (
        ${requestId}, ${studentId}, ${serviceId}, 'SUBMITTED', 'Historical request',
        'A historical request created before the support conversation existed.',
        ${randomUUID()}, ${"a".repeat(64)}, '2026-01', ${oldCreatedAt}, ${oldCreatedAt},
        ${oldCreatedAt}, ${oldCreatedAt}
      )
    `;
    const legacyConversations = await database<{ readonly id: string }[]>`
      SELECT id FROM service_request_conversations WHERE request_id = ${requestId}
    `;
    const legacyConversationId = legacyConversations[0]?.id;
    if (legacyConversationId === undefined) throw new Error("Legacy conversation was not created.");
    await database`
      INSERT INTO service_request_messages (
        conversation_id, sender_type, sender_user_id, content_type, body, sent_at
      ) VALUES (
        ${legacyConversationId}, 'STUDENT', ${studentId}, 'TEXT',
        'A historical student message.', ${oldMessageAt}
      )
    `;
    await database`
      INSERT INTO service_request_events (
        request_id, event_type, actor_type, actor_user_id, request_version, metadata, created_at
      ) VALUES (
        ${requestId}, 'REQUEST_SUBMITTED', 'STUDENT', ${studentId}, 1, '{}'::jsonb,
        ${oldCreatedAt}
      )
    `;
    const legacyAttachmentId = randomUUID();
    await database`
      INSERT INTO service_request_attachments (
        id, request_id, uploaded_by_user_id, storage_provider, original_filename,
        normalized_extension, declared_mime_type, size_bytes
      ) VALUES (
        ${legacyAttachmentId}, ${requestId}, ${studentId}, 'local', 'legacy.jpeg',
        '.jpeg', 'image/jpeg', 1
      )
    `;

    const before = await database<
      { readonly created_at: Date; readonly last_message_at: Date | null }[]
    >`
      SELECT created_at, last_message_at FROM support_conversations
      WHERE student_user_id = ${studentId}
    `;
    expect(before[0]?.created_at.getTime()).toBeGreaterThan(oldMessageAt.getTime());

    // A request owner without the STUDENT role must never be silently omitted
    // from the unified history backfill. Prove the migration fails closed, then
    // restore the valid legacy identity and complete the upgrade.
    await database`
      DELETE FROM user_roles
      WHERE user_id = ${studentId} AND role_code = 'STUDENT'
    `;
    await expect(runMigrations(database, { migrationsDirectory })).rejects.toMatchObject({
      name: "MigrationError",
      filename: "019_unified_student_conversations_quotes_notifications.sql",
    });
    expect(
      await database<{ readonly filename: string }[]>`
        SELECT filename FROM schema_migrations
        WHERE filename = '019_unified_student_conversations_quotes_notifications.sql'
      `,
    ).toEqual([]);
    await database`INSERT INTO user_roles (user_id, role_code) VALUES (${studentId}, 'STUDENT')`;

    const result = await runMigrations(database, { migrationsDirectory });
    expect(result.applied).toEqual([
      "019_unified_student_conversations_quotes_notifications.sql",
      "020_unscanned_attachment_delivery.sql",
    ]);

    const after = await database<
      { readonly created_at: Date; readonly last_message_at: Date | null; readonly count: string }[]
    >`
      SELECT conversations.created_at, conversations.last_message_at,
             count(messages.id)::text AS count
      FROM support_conversations AS conversations
      LEFT JOIN support_messages AS messages ON messages.conversation_id = conversations.id
      WHERE conversations.student_user_id = ${studentId}
      GROUP BY conversations.id
    `;
    expect(after[0]?.created_at.getTime()).toBeLessThanOrEqual(oldCreatedAt.getTime());
    expect(after[0]?.last_message_at?.getTime()).toBeGreaterThanOrEqual(oldCreatedAt.getTime());
    expect(Number(after[0]?.count)).toBeGreaterThanOrEqual(2);
    expect(
      await database<{ readonly normalized_extension: string }[]>`
        SELECT normalized_extension FROM service_request_attachments
        WHERE id = ${legacyAttachmentId}
      `,
    ).toEqual([{ normalized_extension: ".jpg" }]);
  });
});
