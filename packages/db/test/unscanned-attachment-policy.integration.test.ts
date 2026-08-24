import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "../src/index.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;

integrationDescribe.sequential("unscanned attachment delivery schema", () => {
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

  it("defaults production operational state off and preserves explicit skipped provenance", async () => {
    const settings = await database<
      { readonly paused: boolean; readonly column_default: string | null }[]
    >`
      SELECT settings.file_scan_queue_paused AS paused, columns.column_default
      FROM platform_operational_settings AS settings
      INNER JOIN information_schema.columns AS columns
        ON columns.table_schema = 'public'
       AND columns.table_name = 'platform_operational_settings'
       AND columns.column_name = 'file_scan_queue_paused'
      WHERE settings.singleton_key = 'platform'
    `;
    expect(settings).toEqual([{ paused: true, column_default: "true" }]);

    const constraints = await database<
      { readonly table_name: string; readonly definition: string }[]
    >`
      SELECT constraints.conrelid::regclass::text AS table_name,
             pg_get_constraintdef(constraints.oid) AS definition
      FROM pg_constraint AS constraints
      WHERE constraints.conname IN (
        'service_request_attachments_scan_status_check',
        'unified_conversation_attachments_scan_status_check'
      )
      ORDER BY table_name
    `;
    expect(constraints).toHaveLength(2);
    expect(constraints.every((row) => row.definition.includes("SCAN_SKIPPED_BY_ADMIN"))).toBe(true);

    const extensionConstraints = await database<
      { readonly table_name: string; readonly definition: string }[]
    >`
      SELECT constraints.conrelid::regclass::text AS table_name,
             pg_get_constraintdef(constraints.oid) AS definition
      FROM pg_constraint AS constraints
      WHERE constraints.conname IN (
        'service_request_attachments_normalized_extension_check',
        'unified_conversation_attachments_normalized_extension_check'
      )
      ORDER BY table_name
    `;
    expect(extensionConstraints).toHaveLength(2);
    expect(extensionConstraints.every((row) => row.definition.includes("'.jpg'"))).toBe(true);
    expect(extensionConstraints.every((row) => !row.definition.includes("'.jpeg'"))).toBe(true);
    expect(extensionConstraints.every((row) => !row.definition.includes("'.m4a'"))).toBe(true);

    const functions = await database<{ readonly definition: string }[]>`
      SELECT pg_get_functiondef(functions.oid) AS definition
      FROM pg_proc AS functions
      WHERE functions.proname IN (
        'validate_service_request_message',
        'validate_support_message_sender'
      )
    `;
    expect(functions).toHaveLength(2);
    expect(functions.every((row) => row.definition.includes("SCAN_SKIPPED_BY_ADMIN"))).toBe(true);
    expect(functions.every((row) => row.definition.includes("SCAN_SKIPPED_DEVELOPMENT"))).toBe(
      true,
    );
  });
});
