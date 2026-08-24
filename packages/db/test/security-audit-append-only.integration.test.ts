import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, type DatabaseClient } from "../src/database.js";
import { getSchemaStatus, runMigrations } from "../src/migrations.js";

// Never fall back to DATABASE_URL: this suite may only mutate an explicitly
// selected integration database.
const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const rollbackMarker = { securityAuditAppendOnlyRollback: true } as const;

async function inRolledBackTransaction(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<void>,
): Promise<void> {
  try {
    await database.begin(async (transaction) => {
      await callback(transaction as DatabaseClient);
      throw rollbackMarker;
    });
    throw new Error("Security audit integration transaction unexpectedly committed.");
  } catch (error: unknown) {
    if (error !== rollbackMarker) {
      throw error;
    }
  }
}

async function expectAppendOnlyRejection(
  transaction: DatabaseClient,
  mutation: () => Promise<unknown>,
): Promise<void> {
  await transaction.unsafe("SAVEPOINT security_audit_guard_probe");
  let rejection: unknown;
  try {
    await mutation();
  } catch (error: unknown) {
    rejection = error;
  } finally {
    await transaction.unsafe("ROLLBACK TO SAVEPOINT security_audit_guard_probe");
    await transaction.unsafe("RELEASE SAVEPOINT security_audit_guard_probe");
  }
  expect(rejection).toBeInstanceOf(Error);
  expect((rejection as Error).message).toMatch(/append-only/i);
}

integrationDescribe("security audit append-only migration", () => {
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

  it("applies migration 011 and rejects update, delete, and truncate", async () => {
    const status = await getSchemaStatus(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
    expect(status.compatible).toBe(true);

    const applied = await database<{ readonly filename: string }[]>`
      SELECT filename FROM schema_migrations
      WHERE filename = '011_security_audit_events_append_only.sql'
    `;
    expect(applied).toEqual([{ filename: "011_security_audit_events_append_only.sql" }]);

    const triggers = await database<{ readonly trigger_name: string }[]>`
      SELECT tgname AS trigger_name
      FROM pg_trigger
      WHERE tgrelid = 'security_audit_events'::regclass
        AND NOT tgisinternal
      ORDER BY tgname
    `;
    expect(triggers).toEqual([
      { trigger_name: "security_audit_events_append_only" },
      { trigger_name: "security_audit_events_reject_truncate" },
    ]);

    await inRolledBackTransaction(database, async (transaction) => {
      const eventType = `test.security_audit_immutable.${randomUUID()}`;
      const inserted = await transaction<{ readonly id: string }[]>`
        INSERT INTO security_audit_events (event_type, outcome, metadata)
        VALUES (${eventType}, 'SUCCESS', '{}'::jsonb)
        RETURNING id::text AS id
      `;
      const eventId = inserted[0]?.id;
      if (eventId === undefined) {
        throw new Error("Security audit fixture was not inserted.");
      }

      await expectAppendOnlyRejection(
        transaction,
        async () => transaction`
          UPDATE security_audit_events
          SET metadata = '{"mutated":true}'::jsonb
          WHERE id = ${eventId}::bigint
        `,
      );

      await expectAppendOnlyRejection(
        transaction,
        async () => transaction`
          DELETE FROM security_audit_events WHERE id = ${eventId}::bigint
        `,
      );

      await expectAppendOnlyRejection(
        transaction,
        async () => transaction`TRUNCATE TABLE security_audit_events`,
      );

      await expect(
        transaction<{ readonly event_type: string }[]>`
          SELECT event_type FROM security_audit_events WHERE id = ${eventId}::bigint
        `,
      ).resolves.toEqual([{ event_type: eventType }]);
    });
  });
});
