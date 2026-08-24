import { loadConfig } from "@itqanak/config";
import { closeDatabase, createDatabase, verifyMigrations, type DatabaseClient } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";

import { cloudflareAccessSettings } from "./lib/cloudflare-access";

/**
 * Compose gates Web on the migrator, and this independent Node-only check
 * prevents a direct image start or a Web-only restart from serving an
 * incompatible schema.
 */
export async function registerNodeInstrumentation(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || process.env.VERIFY_SCHEMA_ON_STARTUP !== "true") {
    return;
  }

  let logger = createLogger({
    service: "web",
    environment: process.env.NODE_ENV || "production",
  });
  let database: DatabaseClient | undefined;

  try {
    const cloudflareAccess = cloudflareAccessSettings();
    const config = loadConfig({
      serviceName: "web",
      requirements: { database: true, storage: true, fileScanning: true },
      loadDotenv: false,
    });
    logger = createLogger({
      service: "web",
      environment: config.nodeEnv,
      level: config.logLevel,
    });
    database = createDatabase(config.databaseUrl ?? "");
    const status = await verifyMigrations(database, {
      migrationsDirectory: config.migrationsDirectory,
      logger,
    });
    logger.info("schema_verified", { appliedMigrationCount: status.appliedMigrationCount });
    logger.info("administrator_access_boundary_verified", { mode: cloudflareAccess.mode });
  } catch (error: unknown) {
    logger.error("web_startup_verification_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throw new Error("Web startup verification failed before serving requests.");
  } finally {
    if (database !== undefined) {
      await closeDatabase(database);
    }
  }
}
