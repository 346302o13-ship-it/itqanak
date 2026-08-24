import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "../src/index.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const rollbackMarker = { adminSupportSchemaRollback: true } as const;

async function inRolledBackTransaction(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<void>,
): Promise<void> {
  try {
    await database.begin(async (transaction) => {
      await callback(transaction as DatabaseClient);
      throw rollbackMarker;
    });
    throw new Error("Administrative support schema transaction unexpectedly committed.");
  } catch (error: unknown) {
    if (error !== rollbackMarker) throw error;
  }
}

async function expectDatabaseRejection(
  transaction: DatabaseClient,
  mutation: () => Promise<unknown>,
): Promise<void> {
  await transaction.unsafe("SAVEPOINT admin_support_rejection_probe");
  let rejection: unknown;
  try {
    await mutation();
  } catch (error: unknown) {
    rejection = error;
  } finally {
    await transaction.unsafe("ROLLBACK TO SAVEPOINT admin_support_rejection_probe");
    await transaction.unsafe("RELEASE SAVEPOINT admin_support_rejection_probe");
  }
  expect(rejection).toBeInstanceOf(Error);
}

integrationDescribe.sequential("administrative support schema invariants", () => {
  let database: DatabaseClient;

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
  });

  afterAll(async () => {
    await closeDatabase(database);
  });

  it("enforces active-student ownership and immutable, role-correct support messages", async () => {
    await inRolledBackTransaction(database, async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "");
      const existingAdmins = await transaction<{ readonly id: string }[]>`
        SELECT users.id
        FROM users
        INNER JOIN user_roles ON user_roles.user_id = users.id
        WHERE user_roles.role_code = 'ADMIN'
        LIMIT 1
      `;
      let administratorId = existingAdmins[0]?.id;
      if (administratorId === undefined) {
        const rows = await transaction<{ readonly id: string }[]>`
          INSERT INTO users (
            email, email_normalized, display_name, status, email_verified_at
          ) VALUES (
            ${`support-schema-admin-${suffix}@example.test`},
            ${`support-schema-admin-${suffix}@example.test`},
            'Support schema admin', 'ACTIVE', now()
          )
          RETURNING id
        `;
        administratorId = rows[0]?.id;
        if (administratorId === undefined) throw new Error("Could not create an admin fixture.");
        await transaction`
          INSERT INTO user_roles (user_id, role_code) VALUES (${administratorId}, 'ADMIN')
        `;
      }

      const users = await transaction<{ readonly id: string; readonly display_name: string }[]>`
        INSERT INTO users (
          email, email_normalized, display_name, status, email_verified_at
        ) VALUES
          (${`support-schema-student-${suffix}@example.test`},
           ${`support-schema-student-${suffix}@example.test`},
           'Support schema student', 'ACTIVE', now()),
          (${`support-schema-other-${suffix}@example.test`},
           ${`support-schema-other-${suffix}@example.test`},
           'Support schema other', 'ACTIVE', now())
        RETURNING id, display_name
      `;
      const studentId = users.find((row) => row.display_name === "Support schema student")?.id;
      const otherStudentId = users.find((row) => row.display_name === "Support schema other")?.id;
      if (studentId === undefined || otherStudentId === undefined) {
        throw new Error("Could not create student fixtures.");
      }
      await transaction`
        INSERT INTO user_roles (user_id, role_code) VALUES
          (${studentId}, 'STUDENT'), (${otherStudentId}, 'STUDENT')
      `;
      const conversations = await transaction<{ readonly id: string }[]>`
        SELECT id FROM support_conversations WHERE student_user_id = ${studentId}
      `;
      const conversationId = conversations[0]?.id;
      if (conversationId === undefined) throw new Error("Could not create support conversation.");

      await expectDatabaseRejection(
        transaction,
        () => transaction`
          INSERT INTO support_conversations (student_user_id, created_by_user_id)
          VALUES (${studentId}, ${administratorId})
        `,
      );
      await expectDatabaseRejection(
        transaction,
        () => transaction`
          INSERT INTO support_messages (
            conversation_id, sender_type, sender_user_id, content_type, body
          ) VALUES (${conversationId}, 'STUDENT', ${otherStudentId}, 'TEXT', 'Cross-owner message')
        `,
      );
      await expectDatabaseRejection(
        transaction,
        () => transaction`
          INSERT INTO support_messages (
            conversation_id, sender_type, sender_user_id, content_type, body
          ) VALUES (${conversationId}, 'ADMIN', ${otherStudentId}, 'TEXT', 'Forged admin message')
        `,
      );
      const messages = await transaction<{ readonly id: string }[]>`
        INSERT INTO support_messages (
          conversation_id, sender_type, sender_user_id, content_type, body
        ) VALUES (${conversationId}, 'STUDENT', ${studentId}, 'TEXT', 'Valid support message')
        RETURNING id
      `;
      const messageId = messages[0]?.id;
      if (messageId === undefined) throw new Error("Could not create support message.");
      await expectDatabaseRejection(
        transaction,
        () => transaction`UPDATE support_messages SET body = 'mutated' WHERE id = ${messageId}`,
      );
      await expectDatabaseRejection(
        transaction,
        () => transaction`DELETE FROM support_messages WHERE id = ${messageId}`,
      );

      let serviceRows = await transaction<{ readonly id: string }[]>`
        SELECT id FROM services WHERE active = TRUE ORDER BY created_at ASC LIMIT 1
      `;
      if (serviceRows[0] === undefined) {
        const categoryId = randomUUID();
        await transaction`
          INSERT INTO service_categories (
            id, slug, name_ar, description_ar, name_en, description_en
          ) VALUES (
            ${categoryId}, ${`support-${suffix.slice(0, 12)}`}, 'فئة دعم',
            'فئة اختبار صالحة لضمان قيود الطلب الإداري.', 'Support category',
            'A valid integration category for administrative request constraints.'
          )
        `;
        serviceRows = await transaction<{ readonly id: string }[]>`
          INSERT INTO services (
            category_id, slug, name_ar, short_description_ar, description_ar,
            name_en, short_description_en, description_en, pricing_model
          ) VALUES (
            ${categoryId}, ${`support-service-${suffix.slice(0, 12)}`}, 'خدمة دعم',
            'وصف مختصر صالح لخدمة اختبار الدعم.',
            'وصف عربي كامل صالح لخدمة اختبار قيود الدعم الإداري.',
            'Support service', 'A valid short description for support testing.',
            'A complete valid description for the administrative support constraint test.',
            'QUOTE_REQUIRED'
          ) RETURNING id
        `;
      }
      const serviceId = serviceRows[0]?.id;
      if (serviceId === undefined) throw new Error("Expected an active service fixture.");
      await expectDatabaseRejection(
        transaction,
        () => transaction`
          INSERT INTO service_requests (
            student_user_id, service_id, status, title, description, urgency,
            submission_key, submission_fingerprint
          ) VALUES (
            ${administratorId}, ${serviceId}, 'DRAFT', '', '', 'NORMAL',
            ${randomUUID()}, ${"f".repeat(64)}
          )
        `,
      );
    });
  });

  it("installs migration 016 permissions exactly once", async () => {
    const applied = await database<{ readonly filename: string }[]>`
      SELECT filename FROM schema_migrations
      WHERE filename = '016_admin_student_request_and_support_inbox.sql'
    `;
    expect(applied).toEqual([{ filename: "016_admin_student_request_and_support_inbox.sql" }]);
    const grants = await database<
      { readonly role_code: string; readonly permission_code: string }[]
    >`
      SELECT role_code, permission_code FROM role_permissions
      WHERE permission_code IN (
        'support.chat.read.own', 'support.chat.send.own',
        'admin.support.chat.read', 'admin.support.chat.send'
      )
      ORDER BY role_code, permission_code
    `;
    expect(grants).toEqual([
      { role_code: "ADMIN", permission_code: "admin.support.chat.read" },
      { role_code: "ADMIN", permission_code: "admin.support.chat.send" },
      { role_code: "STUDENT", permission_code: "support.chat.read.own" },
      { role_code: "STUDENT", permission_code: "support.chat.send.own" },
      { role_code: "SYSTEM", permission_code: "admin.support.chat.read" },
    ]);
  });
});
