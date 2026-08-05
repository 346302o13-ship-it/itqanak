import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase } from "../src/database.js";
import { getSchemaStatus, MigrationError, runMigrations } from "../src/migrations.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;

function identifier(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

async function createMigrationDirectory(sql: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "itqanak-migrations-"));
  await writeFile(join(directory, "001_test_foundation.sql"), sql, {
    encoding: "utf8",
    mode: 0o600,
  });
  return directory;
}

integrationDescribe("Migration Runner", () => {
  const database =
    integrationDatabaseUrl === undefined ? undefined : createDatabase(integrationDatabaseUrl);

  beforeAll(() => {
    if (database === undefined) {
      throw new Error("Integration database was not configured.");
    }
  });

  afterAll(async () => {
    if (database !== undefined) {
      await closeDatabase(database);
    }
  });

  it("applies a migration once and reports a compatible schema on the second run", async () => {
    const probe = identifier("migration_probe");
    const directory = await createMigrationDirectory(
      `CREATE TABLE ${probe} (id INTEGER PRIMARY KEY);`,
    );
    const table = identifier("schema_migrations_test");
    const options = { migrationsDirectory: directory, migrationTable: table };

    const first = await runMigrations(database!, options);
    const second = await runMigrations(database!, options);

    expect(first.applied).toEqual(["001_test_foundation.sql"]);
    expect(second.applied).toEqual([]);
    expect(second.status.compatible).toBe(true);
  });

  it("rejects a changed checksum for an already applied file", async () => {
    const probe = identifier("checksum_probe");
    const directory = await createMigrationDirectory(
      `CREATE TABLE ${probe} (id INTEGER PRIMARY KEY);`,
    );
    const table = identifier("schema_migrations_test");
    const options = { migrationsDirectory: directory, migrationTable: table };
    await runMigrations(database!, options);
    await writeFile(
      join(directory, "001_test_foundation.sql"),
      `CREATE TABLE ${probe} (id INTEGER PRIMARY KEY);\n-- checksum changed`,
      { encoding: "utf8", mode: 0o600 },
    );

    await expect(runMigrations(database!, options)).rejects.toBeInstanceOf(MigrationError);
  });

  it("serializes concurrent migrators so the migration is recorded once", async () => {
    const probe = identifier("concurrent_probe");
    const directory = await createMigrationDirectory(
      `CREATE TABLE ${probe} (id INTEGER PRIMARY KEY);`,
    );
    const table = identifier("schema_migrations_test");
    const options = { migrationsDirectory: directory, migrationTable: table };
    const peer = createDatabase(integrationDatabaseUrl!);

    try {
      const [first, second] = await Promise.all([
        runMigrations(database!, options),
        runMigrations(peer, options),
      ]);
      expect(first.applied.length + second.applied.length).toBe(1);
      expect((await getSchemaStatus(database!, options)).compatible).toBe(true);
    } finally {
      await closeDatabase(peer);
    }
  });

  it("does not record a migration when its transaction fails", async () => {
    const directory = await createMigrationDirectory("CREATE TABLE ;");
    const table = identifier("schema_migrations_test");
    const options = { migrationsDirectory: directory, migrationTable: table };

    await expect(runMigrations(database!, options)).rejects.toBeInstanceOf(MigrationError);
    const status = await getSchemaStatus(database!, options);
    expect(status.appliedMigrationCount).toBe(0);
    expect(status.pendingFilenames).toEqual(["001_test_foundation.sql"]);
  });
});
