#!/usr/bin/env node
import { loadConfig } from "@itqanak/config";
import { createLogger } from "@itqanak/observability";

import { closeDatabase, createDatabase, type DatabaseClient } from "./database.js";
import {
  getSchemaStatus,
  runMigrations,
  verifyMigrations,
  type SchemaStatus,
} from "./migrations.js";

type Command = "migrate" | "status" | "verify";

function parseCommand(value: string | undefined): Command | undefined {
  if (value === "migrate" || value === "status" || value === "verify") {
    return value;
  }
  return undefined;
}

function writeStatus(status: SchemaStatus): void {
  process.stdout.write(
    `${JSON.stringify({
      migrationTablePresent: status.migrationTablePresent,
      requiredMigrationCount: status.requiredMigrationCount,
      appliedMigrationCount: status.appliedMigrationCount,
      pendingFilenames: status.pendingFilenames,
      missingAppliedFilenames: status.missingAppliedFilenames,
      checksumMismatches: status.checksumMismatches,
      compatible: status.compatible,
    })}\n`,
  );
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  if (command === undefined) {
    process.stderr.write("Usage: itqanak-db <migrate|status|verify>\n");
    process.exitCode = 2;
    return;
  }

  let logger = createLogger({
    service: "migrator",
    environment: process.env.NODE_ENV || "development",
  });
  let database: DatabaseClient | undefined;

  try {
    const config = loadConfig({
      serviceName: "migrator",
      requirements: { database: true },
      loadDotenv: process.env.NODE_ENV !== "production",
    });
    logger = createLogger({
      service: "migrator",
      environment: config.nodeEnv,
      level: config.logLevel,
    });
    database = createDatabase(config.databaseUrl ?? "");
    const options = { migrationsDirectory: config.migrationsDirectory, logger };
    if (command === "migrate") {
      const result = await runMigrations(database, options);
      writeStatus(result.status);
      return;
    }
    if (command === "status") {
      writeStatus(await getSchemaStatus(database, options));
      return;
    }
    writeStatus(await verifyMigrations(database, options));
  } catch (error: unknown) {
    logger.error("migration_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  } finally {
    if (database !== undefined) {
      await closeDatabase(database);
    }
  }
}

void main();
