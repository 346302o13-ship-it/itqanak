import { randomUUID } from "node:crypto";

import type { AuthenticatedPrincipal } from "@itqanak/auth";
import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FinanceService } from "../src/service.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const rollbackMarker = { financeIntegrationRollback: true } as const;

function transactionFacade(transaction: DatabaseClient): DatabaseClient {
  const facade = new Proxy(transaction, {
    apply(target, thisArgument, argumentsList) {
      return Reflect.apply(target, thisArgument, argumentsList);
    },
    get(target, property, receiver) {
      if (property === "begin") {
        return async (callback: (nested: DatabaseClient) => Promise<unknown>) => callback(facade);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as DatabaseClient;
  return facade;
}

function principal(
  userId: string,
  sessionId: string,
  role: "STUDENT" | "ADMIN",
  permissions: AuthenticatedPrincipal["permissions"],
): AuthenticatedPrincipal {
  return {
    userId,
    sessionId,
    roles: [role],
    permissions,
    displayName: role === "ADMIN" ? "مدير مالية تجريبي" : "طالب مالية تجريبي",
    status: "ACTIVE",
  };
}

async function inRolledBackTransaction(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<void>,
): Promise<void> {
  try {
    await database.begin(async (transaction) => {
      await callback(transactionFacade(transaction as DatabaseClient));
      throw rollbackMarker;
    });
    throw new Error("Finance integration transaction unexpectedly committed.");
  } catch (error: unknown) {
    if (error !== rollbackMarker) throw error;
  }
}

async function expectDatabaseRejection(
  transaction: DatabaseClient,
  mutation: () => Promise<unknown>,
): Promise<void> {
  await transaction.unsafe("SAVEPOINT finance_rejection_probe");
  let rejection: unknown;
  try {
    await mutation();
  } catch (error: unknown) {
    rejection = error;
  } finally {
    await transaction.unsafe("ROLLBACK TO SAVEPOINT finance_rejection_probe");
    await transaction.unsafe("RELEASE SAVEPOINT finance_rejection_probe");
  }
  expect(rejection).toBeInstanceOf(Error);
}

integrationDescribe("finance service integration", () => {
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

  it("enforces ownership, exact payment transitions, reporting and an append-only ledger", async () => {
    await expect(
      database<{ readonly filename: string }[]>`
        SELECT filename FROM schema_migrations
        WHERE filename = '015_finance_dues_and_manual_payments.sql'
      `,
    ).resolves.toEqual([{ filename: "015_finance_dues_and_manual_payments.sql" }]);
    const adminCountBefore = await database<{ readonly count: string }[]>`
      SELECT count(*)::text AS count FROM user_roles WHERE role_code = 'ADMIN'
    `;
    await inRolledBackTransaction(database, async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "");
      const existingAdmins = await transaction<{ readonly id: string }[]>`
        SELECT users.id
        FROM users
        INNER JOIN user_roles ON user_roles.user_id = users.id
        WHERE user_roles.role_code = 'ADMIN'
        LIMIT 1
      `;
      let adminId = existingAdmins[0]?.id;
      if (adminId === undefined) {
        const admins = await transaction<{ readonly id: string }[]>`
          INSERT INTO users (
            email, email_normalized, display_name, status, email_verified_at
          ) VALUES (
            ${`finance-admin-${suffix}@example.test`},
            ${`finance-admin-${suffix}@example.test`},
            'مدير مالية تجريبي', 'ACTIVE', now()
          ) RETURNING id
        `;
        adminId = admins[0]?.id;
        if (adminId === undefined) throw new Error("Finance admin fixture was not created.");
        await transaction`
          INSERT INTO user_roles (user_id, role_code) VALUES (${adminId}, 'ADMIN')
        `;
      }

      const users = await transaction<{ readonly id: string; readonly label: string }[]>`
        INSERT INTO users (
          email, email_normalized, display_name, status, email_verified_at
        ) VALUES
          (${`finance-student-${suffix}@example.test`}, ${`finance-student-${suffix}@example.test`},
            'طالب مالية تجريبي', 'ACTIVE', now()),
          (${`finance-other-${suffix}@example.test`}, ${`finance-other-${suffix}@example.test`},
            'طالب آخر تجريبي', 'ACTIVE', now())
        RETURNING id, display_name AS label
      `;
      const studentId = users.find((row) => row.label === "طالب مالية تجريبي")?.id;
      const otherStudentId = users.find((row) => row.label === "طالب آخر تجريبي")?.id;
      if (studentId === undefined || otherStudentId === undefined) {
        throw new Error("Finance student fixtures were not created.");
      }
      await transaction`
        INSERT INTO user_roles (user_id, role_code) VALUES
          (${studentId}, 'STUDENT'), (${otherStudentId}, 'STUDENT')
      `;
      const adminSessionId = randomUUID();
      const studentSessionId = randomUUID();
      const otherStudentSessionId = randomUUID();
      await transaction`
        INSERT INTO user_sessions (
          id, user_id, selector, validator_hash, expires_at, idle_expires_at
        ) VALUES
          (${adminSessionId}, ${adminId}, ${randomUUID().replaceAll("-", "")},
           ${randomUUID().replaceAll("-", "").repeat(2)}, now() + interval '1 day', now() + interval '1 day'),
          (${studentSessionId}, ${studentId}, ${randomUUID().replaceAll("-", "")},
           ${randomUUID().replaceAll("-", "").repeat(2)}, now() + interval '1 day', now() + interval '1 day'),
          (${otherStudentSessionId}, ${otherStudentId}, ${randomUUID().replaceAll("-", "")},
           ${randomUUID().replaceAll("-", "").repeat(2)}, now() + interval '1 day', now() + interval '1 day')
      `;
      const admin = principal(adminId, adminSessionId, "ADMIN", [
        "admin.dashboard.view",
        "admin.finance.read",
        "admin.finance.manage",
        "admin.finance.reports.read",
      ]);
      const student = principal(studentId, studentSessionId, "STUDENT", ["finance.read.own"]);
      const otherStudent = principal(otherStudentId, otherStudentSessionId, "STUDENT", [
        "finance.read.own",
      ]);
      let services = await transaction<{ readonly id: string }[]>`
        SELECT id FROM services WHERE active = TRUE ORDER BY created_at ASC LIMIT 1
      `;
      if (services[0] === undefined) {
        const categoryId = randomUUID();
        await transaction`
          INSERT INTO service_categories (
            id, slug, name_ar, description_ar, name_en, description_en
          ) VALUES (
            ${categoryId}, ${`finance-${suffix.slice(0, 12)}`}, 'فئة مالية',
            'فئة اختبار صالحة لتكامل المستحقات والمدفوعات.', 'Finance category',
            'A valid integration category for finance due and payment tests.'
          )
        `;
        services = await transaction<{ readonly id: string }[]>`
          INSERT INTO services (
            category_id, slug, name_ar, short_description_ar, description_ar,
            name_en, short_description_en, description_en, pricing_model
          ) VALUES (
            ${categoryId}, ${`finance-service-${suffix.slice(0, 12)}`}, 'خدمة مالية',
            'وصف مختصر صالح لخدمة الاختبار المالي.',
            'وصف عربي كامل صالح لخدمة اختبار المستحقات والمدفوعات.',
            'Finance service', 'A valid short description for finance testing.',
            'A complete valid description for the finance due and payment integration test.',
            'QUOTE_REQUIRED'
          ) RETURNING id
        `;
      }
      const serviceId = services[0]?.id;
      if (serviceId === undefined) throw new Error("Expected a seeded service.");
      const requests = await transaction<{ readonly request_number: string }[]>`
        INSERT INTO service_requests (
          student_user_id, service_id, status, title, description, urgency,
          submission_key, submission_fingerprint, academic_integrity_version,
          academic_integrity_accepted_at, submitted_at
        ) VALUES (
          ${studentId}, ${serviceId}, 'SUBMITTED', 'طلب مالي تجريبي',
          'طلب تجريبي لاختبار طبقة المدفوعات والمستحقات الداخلية.', 'NORMAL',
          ${randomUUID()}, ${"a".repeat(64)}, '2026-08', now(), now()
        ) RETURNING request_number
      `;
      const requestNumber = requests[0]?.request_number;
      if (requestNumber === undefined) throw new Error("Finance request fixture was not created.");

      const service = new FinanceService({ database: transaction });
      const due = await service.createDue(admin, {
        requestNumber,
        titleAr: "المستحق الكامل",
        titleEn: "Full request due",
        descriptionAr: "مستحق مرتبط بالطلب التجريبي.",
        descriptionEn: "Due linked to the integration request.",
        amount: "125.50",
        currency: "SAR",
      });
      expect(due).toMatchObject({
        requestNumber,
        studentUserId: student.userId,
        amountMinor: 12_550,
        currency: "SAR",
        status: "UNPAID",
        version: 1,
      });
      await expect(service.listStudentDues(student)).resolves.toMatchObject({
        items: [expect.objectContaining({ id: due.id, status: "UNPAID" })],
      });
      await expect(service.listStudentDues(otherStudent)).resolves.toMatchObject({ items: [] });

      const paid = await service.recordPayment(admin, due.id, {
        expectedVersion: 1,
        method: "BANK_TRANSFER",
        reference: "BANK-TEST-123",
      });
      expect(paid).toMatchObject({
        status: "PAID",
        version: 2,
        latestPaymentReference: "BANK-TEST-123",
      });
      await expect(
        service.recordPayment(admin, due.id, {
          expectedVersion: 1,
          method: "CASH",
          reference: "CASH-REPLAY",
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      const reversed = await service.reversePayment(admin, due.id, {
        expectedVersion: 2,
        reason: "Integration reversal",
      });
      expect(reversed).toMatchObject({ status: "UNPAID", version: 3 });
      const voided = await service.voidDue(admin, due.id, {
        expectedVersion: 3,
        reason: "Integration void",
      });
      expect(voided).toMatchObject({ status: "VOIDED", version: 4 });

      await expect(service.getAdminReport(admin)).resolves.toMatchObject({
        totals: [expect.objectContaining({ currency: "SAR", voidedCount: 1 })],
      });
      const entries = await transaction<{ readonly entry_type: string }[]>`
        SELECT entry_type FROM finance_ledger_entries WHERE due_id = ${due.id}
        ORDER BY due_version ASC
      `;
      expect(entries.map((entry) => entry.entry_type)).toEqual([
        "DUE_CREATED",
        "PAYMENT_RECORDED",
        "PAYMENT_REVERSED",
        "DUE_VOIDED",
      ]);
      await expectDatabaseRejection(
        transaction,
        async () =>
          transaction`UPDATE finance_ledger_entries SET note = 'tampered' WHERE due_id = ${due.id}`,
      );
      await expectDatabaseRejection(
        transaction,
        async () => transaction`TRUNCATE finance_ledger_entries`,
      );
    });
    await expect(
      database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count FROM user_roles WHERE role_code = 'ADMIN'
      `,
    ).resolves.toEqual(adminCountBefore);
  });
});
