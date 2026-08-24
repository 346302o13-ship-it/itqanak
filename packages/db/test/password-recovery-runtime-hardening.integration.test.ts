import { randomBytes, randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, type DatabaseClient } from "../src/database.js";
import { getSchemaStatus, runMigrations } from "../src/migrations.js";

// Never fall back to DATABASE_URL: this suite may only mutate an explicitly
// selected disposable integration database.
const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const rollbackMarker = { passwordRecoveryRuntimeHardeningRollback: true } as const;

interface PostgresError extends Error {
  readonly code?: string;
  readonly constraint_name?: string;
}

function uniquePhone(): string {
  return `+9665${String(randomInt(100_000_000)).padStart(8, "0")}`;
}

function publicReference(): string {
  return `PR-${randomBytes(5).toString("hex").toUpperCase()}`;
}

async function inRolledBackTransaction(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<void>,
): Promise<void> {
  try {
    await database.begin(async (transaction) => {
      await callback(transaction as DatabaseClient);
      throw rollbackMarker;
    });
    throw new Error("Password-recovery hardening integration transaction unexpectedly committed.");
  } catch (error: unknown) {
    if (error !== rollbackMarker) {
      throw error;
    }
  }
}

async function expectDatabaseRejection(
  transaction: DatabaseClient,
  expected: { readonly code: string; readonly constraint: string },
  mutation: () => Promise<unknown>,
): Promise<void> {
  await transaction.unsafe("SAVEPOINT password_recovery_hardening_probe");
  let rejection: unknown;
  try {
    await mutation();
  } catch (error: unknown) {
    rejection = error;
  } finally {
    await transaction.unsafe("ROLLBACK TO SAVEPOINT password_recovery_hardening_probe");
    await transaction.unsafe("RELEASE SAVEPOINT password_recovery_hardening_probe");
  }
  expect(rejection).toBeInstanceOf(Error);
  expect((rejection as PostgresError).code).toBe(expected.code);
  expect((rejection as PostgresError).constraint_name).toBe(expected.constraint);
}

async function createPhoneUser(transaction: DatabaseClient, phoneE164: string): Promise<string> {
  const suffix = randomUUID();
  const email = `migration-014-${suffix}@example.test`;
  const rows = await transaction<{ readonly id: string }[]>`
    INSERT INTO users (
      email, email_normalized, country_code, phone_e164,
      display_name, status, email_verified_at
    ) VALUES (
      ${email}, ${email}, 'SA', ${phoneE164},
      'Migration 014 fixture', 'ACTIVE', now()
    )
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error("Password-recovery hardening fixture user was not inserted.");
  }
  return id;
}

async function createPasswordResetToken(
  transaction: DatabaseClient,
  userId: string,
): Promise<string> {
  const rows = await transaction<{ readonly id: string }[]>`
    INSERT INTO password_reset_tokens (user_id, selector, validator_hash, expires_at)
    VALUES (
      ${userId}, ${randomBytes(16).toString("hex")},
      ${randomBytes(32).toString("hex")}, now() + interval '30 minutes'
    )
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error("Password-reset token fixture was not inserted.");
  }
  return id;
}

async function insertApprovedRequest(
  transaction: DatabaseClient,
  userId: string,
  phoneE164: string,
  tokenId: string,
): Promise<void> {
  await transaction`
    INSERT INTO phone_password_reset_requests (
      user_id, phone_e164, public_reference, status,
      requested_at, expires_at, reviewed_at, reviewed_by_user_id,
      whatsapp_reference, password_reset_token_id
    ) VALUES (
      ${userId}, ${phoneE164}, ${publicReference()}, 'APPROVED',
      now() - interval '1 minute', now() + interval '2 hours', now(), ${userId},
      ${`WA-${randomBytes(8).toString("hex")}`}, ${tokenId}
    )
  `;
}

integrationDescribe("password recovery and runtime hardening migration", () => {
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

  it("applies migration 014 and enforces E.164, identity matching, and one approved request", async () => {
    const status = await getSchemaStatus(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
    expect(status.compatible).toBe(true);
    await expect(
      database<{ readonly filename: string }[]>`
        SELECT filename FROM schema_migrations
        WHERE filename = '014_password_recovery_runtime_hardening.sql'
      `,
    ).resolves.toEqual([{ filename: "014_password_recovery_runtime_hardening.sql" }]);

    await inRolledBackTransaction(database, async (transaction) => {
      const firstPhone = uniquePhone();
      const secondPhone = uniquePhone();
      const firstUserId = await createPhoneUser(transaction, firstPhone);
      await createPhoneUser(transaction, secondPhone);

      await expectDatabaseRejection(
        transaction,
        {
          code: "23514",
          constraint: "phone_password_reset_requests_phone_e164_check",
        },
        async () =>
          transaction`
            INSERT INTO phone_password_reset_requests (
              user_id, phone_e164, public_reference, expires_at
            ) VALUES (
              ${firstUserId}, '+12025550123', ${publicReference()}, now() + interval '2 hours'
            )
          `,
      );

      await expectDatabaseRejection(
        transaction,
        {
          code: "23514",
          constraint: "phone_password_reset_requests_phone_matches_user",
        },
        async () =>
          transaction`
            INSERT INTO phone_password_reset_requests (
              user_id, phone_e164, public_reference, expires_at
            ) VALUES (
              ${firstUserId}, ${secondPhone}, ${publicReference()}, now() + interval '2 hours'
            )
          `,
      );

      const pending = await transaction<{ readonly id: string }[]>`
        INSERT INTO phone_password_reset_requests (
          user_id, phone_e164, public_reference, expires_at
        ) VALUES (
          ${firstUserId}, ${firstPhone}, ${publicReference()}, now() + interval '2 hours'
        )
        RETURNING id
      `;
      const pendingId = pending[0]?.id;
      if (pendingId === undefined) {
        throw new Error("Pending password-recovery fixture was not inserted.");
      }
      await expectDatabaseRejection(
        transaction,
        {
          code: "23514",
          constraint: "phone_password_reset_requests_phone_matches_user",
        },
        async () =>
          transaction`
            UPDATE phone_password_reset_requests
            SET phone_e164 = ${secondPhone}
            WHERE id = ${pendingId}
          `,
      );

      // Multiple pending public references are intentional; only an issued
      // APPROVED reset link is exclusive per user.
      await transaction`
        INSERT INTO phone_password_reset_requests (
          user_id, phone_e164, public_reference, expires_at
        ) VALUES (
          ${firstUserId}, ${firstPhone}, ${publicReference()}, now() + interval '2 hours'
        )
      `;

      await insertApprovedRequest(
        transaction,
        firstUserId,
        firstPhone,
        await createPasswordResetToken(transaction, firstUserId),
      );
      await expectDatabaseRejection(
        transaction,
        {
          code: "23505",
          constraint: "phone_password_reset_requests_approved_user_idx",
        },
        async () =>
          insertApprovedRequest(
            transaction,
            firstUserId,
            firstPhone,
            await createPasswordResetToken(transaction, firstUserId),
          ),
      );
    });
  });

  it("grants bounded existing and default privileges when itqanak_runtime exists", async () => {
    const roles = await database<
      {
        readonly rolcanlogin: boolean;
        readonly rolsuper: boolean;
        readonly rolcreatedb: boolean;
        readonly rolcreaterole: boolean;
        readonly rolreplication: boolean;
        readonly rolbypassrls: boolean;
      }[]
    >`
      SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
             rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = 'itqanak_runtime'
    `;
    const role = roles[0];
    if (role === undefined) {
      // Migration 014 deliberately permits development databases where the
      // externally provisioned production login does not exist.
      return;
    }
    expect(role).toEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
    });

    const existing = await database<
      {
        readonly database_connect: boolean;
        readonly schema_usage: boolean;
        readonly request_select: boolean;
        readonly request_insert: boolean;
        readonly request_update: boolean;
        readonly request_delete: boolean;
        readonly sequence_usage: boolean;
        readonly function_execute: boolean;
        readonly ledger_select: boolean;
        readonly ledger_insert: boolean;
        readonly ledger_update: boolean;
        readonly event_insert: boolean;
        readonly event_update: boolean;
        readonly event_delete: boolean;
      }[]
    >`
      SELECT
        has_database_privilege('itqanak_runtime', current_database(), 'CONNECT') AS database_connect,
        has_schema_privilege('itqanak_runtime', 'public', 'USAGE') AS schema_usage,
        has_table_privilege('itqanak_runtime', 'phone_password_reset_requests', 'SELECT') AS request_select,
        has_table_privilege('itqanak_runtime', 'phone_password_reset_requests', 'INSERT') AS request_insert,
        has_table_privilege('itqanak_runtime', 'phone_password_reset_requests', 'UPDATE') AS request_update,
        has_table_privilege('itqanak_runtime', 'phone_password_reset_requests', 'DELETE') AS request_delete,
        has_sequence_privilege('itqanak_runtime', 'service_request_number_seq', 'USAGE') AS sequence_usage,
        has_function_privilege('itqanak_runtime', 'next_service_request_number()', 'EXECUTE') AS function_execute,
        has_table_privilege('itqanak_runtime', 'schema_migrations', 'SELECT') AS ledger_select,
        has_table_privilege('itqanak_runtime', 'schema_migrations', 'INSERT') AS ledger_insert,
        has_table_privilege('itqanak_runtime', 'schema_migrations', 'UPDATE') AS ledger_update,
        has_table_privilege('itqanak_runtime', 'security_audit_events', 'INSERT') AS event_insert,
        has_table_privilege('itqanak_runtime', 'security_audit_events', 'UPDATE') AS event_update,
        has_table_privilege('itqanak_runtime', 'security_audit_events', 'DELETE') AS event_delete
    `;
    expect(existing[0]).toEqual({
      database_connect: true,
      schema_usage: true,
      request_select: true,
      request_insert: true,
      request_update: true,
      request_delete: true,
      sequence_usage: true,
      function_execute: true,
      ledger_select: true,
      ledger_insert: false,
      ledger_update: false,
      event_insert: true,
      event_update: false,
      event_delete: false,
    });

    await inRolledBackTransaction(database, async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
      const tableName = `runtime_default_acl_probe_${suffix}`;
      const functionName = `runtime_default_acl_probe_${suffix}`;
      await transaction.unsafe(`
        CREATE TABLE ${tableName} (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      await transaction.unsafe(`
        CREATE FUNCTION ${functionName}()
        RETURNS INTEGER LANGUAGE SQL AS 'SELECT 1'
      `);
      const sequenceNameRows = await transaction<{ readonly sequence_name: string }[]>`
        SELECT pg_get_serial_sequence(${`public.${tableName}`}, 'id') AS sequence_name
      `;
      const sequenceName = sequenceNameRows[0]?.sequence_name;
      if (sequenceName === undefined) {
        throw new Error("Default-ACL probe identity sequence was not created.");
      }
      const defaults = await transaction<
        {
          readonly table_select: boolean;
          readonly table_insert: boolean;
          readonly table_update: boolean;
          readonly table_delete: boolean;
          readonly sequence_usage: boolean;
          readonly function_execute: boolean;
        }[]
      >`
        SELECT
          has_table_privilege('itqanak_runtime', ${`public.${tableName}`}, 'SELECT') AS table_select,
          has_table_privilege('itqanak_runtime', ${`public.${tableName}`}, 'INSERT') AS table_insert,
          has_table_privilege('itqanak_runtime', ${`public.${tableName}`}, 'UPDATE') AS table_update,
          has_table_privilege('itqanak_runtime', ${`public.${tableName}`}, 'DELETE') AS table_delete,
          has_sequence_privilege('itqanak_runtime', ${sequenceName}, 'USAGE') AS sequence_usage,
          has_function_privilege('itqanak_runtime', ${`public.${functionName}()`}, 'EXECUTE') AS function_execute
      `;
      expect(defaults[0]).toEqual({
        table_select: true,
        table_insert: true,
        table_update: true,
        table_delete: true,
        sequence_usage: true,
        function_execute: true,
      });
    });
  });
});
