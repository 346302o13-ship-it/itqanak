import { createHash } from "node:crypto";
import { type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { Logger } from "@itqanak/observability";

import type { DatabaseClient } from "./database.js";

const migrationFilenamePattern = /^(?<id>\d{3,})_(?<slug>[a-z0-9][a-z0-9_-]*)\.sql$/;
const migrationTablePattern = /^[a-z][a-z0-9_]{0,62}$/;
const advisoryLockKey = 8_463_104_221;

export interface MigrationFile {
  readonly id: number;
  readonly filename: string;
  readonly checksum: string;
  readonly sql: string;
}

export interface AppliedMigration {
  readonly id: number;
  readonly filename: string;
  readonly checksum: string;
  readonly appliedAt: Date;
  readonly executionMs: number;
}

export interface SchemaStatus {
  readonly migrationTablePresent: boolean;
  readonly requiredMigrationCount: number;
  readonly appliedMigrationCount: number;
  readonly pendingFilenames: readonly string[];
  readonly missingAppliedFilenames: readonly string[];
  readonly checksumMismatches: readonly string[];
  readonly compatible: boolean;
}

export interface MigrationOptions {
  readonly migrationsDirectory: string;
  readonly migrationTable?: string;
  readonly logger?: Logger;
}

export interface MigrationRunResult {
  readonly applied: readonly string[];
  readonly status: SchemaStatus;
}

export class MigrationError extends Error {
  public constructor(
    message: string,
    public readonly filename?: string,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

function assertMigrationTableName(name: string): string {
  if (!migrationTablePattern.test(name)) {
    throw new MigrationError("Migration table name is invalid.");
  }
  return name;
}

function getMigrationTable(options: MigrationOptions): string {
  return assertMigrationTableName(options.migrationTable ?? "schema_migrations");
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`;
}

function checksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function loadMigrationFiles(
  migrationsDirectory: string,
): Promise<readonly MigrationFile[]> {
  const absoluteDirectory = resolve(migrationsDirectory);
  let entries: readonly Dirent[];
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch {
    throw new MigrationError("Migration directory cannot be read.");
  }

  const parsed: Array<{ readonly filename: string; readonly id: number }> = [];
  const ids = new Set<number>();
  for (const entry of entries) {
    if (!entry.name.endsWith(".sql")) {
      continue;
    }
    const match = migrationFilenamePattern.exec(entry.name);
    if (!entry.isFile() || match === null) {
      throw new MigrationError(
        "Migration SQL files must use the ordered NNN_description.sql naming convention.",
        entry.name,
      );
    }
    const idText = match.groups?.id;
    const id = idText === undefined ? Number.NaN : Number(idText);
    if (!Number.isSafeInteger(id) || ids.has(id)) {
      throw new MigrationError("Migration identifiers must be unique safe integers.", entry.name);
    }
    ids.add(id);
    parsed.push({ filename: entry.name, id });
  }
  parsed.sort((left, right) => left.id - right.id || left.filename.localeCompare(right.filename));

  if (parsed.length === 0) {
    throw new MigrationError("No migration files were found.");
  }

  const migrations: MigrationFile[] = [];
  for (const entry of parsed) {
    const sql = await readFile(join(absoluteDirectory, entry.filename), "utf8");
    if (sql.trim().length === 0) {
      throw new MigrationError("Migration files must not be empty.", entry.filename);
    }
    migrations.push({ id: entry.id, filename: entry.filename, checksum: checksum(sql), sql });
  }
  return migrations;
}

async function ensureMigrationTable(database: DatabaseClient, table: string): Promise<void> {
  const identifier = quoteIdentifier(table);
  await database.unsafe(`
    CREATE TABLE IF NOT EXISTS ${identifier} (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      execution_ms INTEGER NOT NULL CHECK (execution_ms >= 0)
    )
  `);
}

async function hasMigrationTable(database: DatabaseClient, table: string): Promise<boolean> {
  const rows = await database<{ readonly table_name: string | null }[]>`
    SELECT to_regclass(${table}) AS table_name
  `;
  return rows[0]?.table_name !== null && rows[0]?.table_name !== undefined;
}

async function readAppliedMigrations(
  database: DatabaseClient,
  table: string,
): Promise<readonly AppliedMigration[]> {
  const identifier = quoteIdentifier(table);
  const rows = await database.unsafe<
    {
      readonly id: number;
      readonly filename: string;
      readonly checksum: string;
      readonly applied_at: Date;
      readonly execution_ms: number;
    }[]
  >(`SELECT id, filename, checksum, applied_at, execution_ms FROM ${identifier} ORDER BY id ASC`);

  return rows.map((row) => ({
    id: Number(row.id),
    filename: row.filename,
    checksum: row.checksum,
    appliedAt: row.applied_at,
    executionMs: Number(row.execution_ms),
  }));
}

function calculateSchemaStatus(
  migrations: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
  migrationTablePresent: boolean,
): SchemaStatus {
  const filesByName = new Map(migrations.map((migration) => [migration.filename, migration]));
  const appliedByName = new Map(applied.map((migration) => [migration.filename, migration]));
  const missingAppliedFilenames = applied
    .filter((migration) => !filesByName.has(migration.filename))
    .map((migration) => migration.filename);
  const checksumMismatches = applied
    .filter((migration) => filesByName.get(migration.filename)?.checksum !== migration.checksum)
    .map((migration) => migration.filename);
  const pendingFilenames = migrations
    .filter((migration) => !appliedByName.has(migration.filename))
    .map((migration) => migration.filename);

  return {
    migrationTablePresent,
    requiredMigrationCount: migrations.length,
    appliedMigrationCount: applied.length,
    pendingFilenames,
    missingAppliedFilenames,
    checksumMismatches,
    compatible:
      migrationTablePresent &&
      pendingFilenames.length === 0 &&
      missingAppliedFilenames.length === 0 &&
      checksumMismatches.length === 0,
  };
}

export async function getSchemaStatus(
  database: DatabaseClient,
  options: MigrationOptions,
): Promise<SchemaStatus> {
  const migrations = await loadMigrationFiles(options.migrationsDirectory);
  const table = getMigrationTable(options);
  const migrationTablePresent = await hasMigrationTable(database, table);
  if (!migrationTablePresent) {
    return calculateSchemaStatus(migrations, [], false);
  }
  const applied = await readAppliedMigrations(database, table);
  return calculateSchemaStatus(migrations, applied, true);
}

function assertStatusHasNoIntegrityErrors(status: SchemaStatus): void {
  if (status.missingAppliedFilenames.length > 0) {
    throw new MigrationError("An applied migration file is missing from the repository.");
  }
  if (status.checksumMismatches.length > 0) {
    throw new MigrationError("An applied migration checksum no longer matches its file.");
  }
}

async function acquireMigrationLock(database: DatabaseClient): Promise<void> {
  await database`SELECT pg_advisory_lock(${advisoryLockKey}::bigint)`;
}

async function releaseMigrationLock(database: DatabaseClient): Promise<void> {
  await database`SELECT pg_advisory_unlock(${advisoryLockKey}::bigint)`;
}

async function applyMigrationInTransaction(
  database: DatabaseClient,
  table: string,
  migration: MigrationFile,
): Promise<number> {
  const startedAt = performance.now();
  await database.unsafe("BEGIN");
  try {
    await database.unsafe(migration.sql);
    const durationMs = Math.round(performance.now() - startedAt);
    await database.unsafe(
      `INSERT INTO ${quoteIdentifier(table)} (filename, checksum, execution_ms) VALUES ($1, $2, $3)`,
      [migration.filename, migration.checksum, durationMs],
    );
    await database.unsafe("COMMIT");
    return durationMs;
  } catch (error: unknown) {
    try {
      await database.unsafe("ROLLBACK");
    } catch {
      // Releasing the reserved connection will discard a broken session. Keep
      // the original migration failure as the operator-facing result.
    }
    throw error;
  }
}

export async function runMigrations(
  database: DatabaseClient,
  options: MigrationOptions,
): Promise<MigrationRunResult> {
  const migrations = await loadMigrationFiles(options.migrationsDirectory);
  const table = getMigrationTable(options);
  // Session advisory locks are connection-scoped. Reserve one connection so
  // the lock protects table creation, status reads, and every migration
  // transaction even when the normal client has a connection pool.
  const lockedDatabase = await database.reserve();
  let lockAcquired = false;
  try {
    await acquireMigrationLock(lockedDatabase);
    lockAcquired = true;
    await ensureMigrationTable(lockedDatabase, table);
    const before = await getSchemaStatus(lockedDatabase, options);
    assertStatusHasNoIntegrityErrors(before);
    const migrationsByName = new Map(
      migrations.map((migration) => [migration.filename, migration]),
    );
    const alreadyApplied = new Set(
      (await readAppliedMigrations(lockedDatabase, table)).map((migration) => migration.filename),
    );
    const applied: string[] = [];

    for (const filename of before.pendingFilenames) {
      const migration = migrationsByName.get(filename);
      if (migration === undefined || alreadyApplied.has(filename)) {
        continue;
      }
      options.logger?.info("migration_started", { migration: filename });
      try {
        const durationMs = await applyMigrationInTransaction(lockedDatabase, table, migration);
        applied.push(filename);
        options.logger?.info("migration_completed", {
          migration: filename,
          durationMs,
        });
      } catch (error: unknown) {
        options.logger?.error("migration_failed", {
          migration: filename,
          errorName: errorName(error),
        });
        throw new MigrationError("A migration failed and was rolled back.", filename);
      }
    }
    const status = await getSchemaStatus(lockedDatabase, options);
    assertStatusHasNoIntegrityErrors(status);
    return { applied, status };
  } finally {
    try {
      if (lockAcquired) {
        await releaseMigrationLock(lockedDatabase);
      }
    } finally {
      lockedDatabase.release();
    }
  }
}

export async function verifyMigrations(
  database: DatabaseClient,
  options: MigrationOptions,
): Promise<SchemaStatus> {
  const status = await getSchemaStatus(database, options);
  assertStatusHasNoIntegrityErrors(status);
  if (!status.compatible) {
    throw new MigrationError("Database schema has unapplied migrations.");
  }
  return status;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
