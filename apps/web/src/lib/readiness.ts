import Redis from "ioredis";

import { loadConfig, type AppConfig } from "@itqanak/config";
import { checkDatabaseHealth, closeDatabase, createDatabase, getSchemaStatus } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";
import { PlatformOperationsService, type PlatformOperationalState } from "@itqanak/operations";
import {
  createObjectStorage,
  createMalwareScanner,
  type FileScannerReadiness,
  type FileScanningConfig,
  type ObjectStorageConfig,
} from "@itqanak/storage";

export interface ReadinessResult {
  readonly ready: boolean;
  readonly checks: {
    readonly configuration: boolean;
    readonly database: boolean;
    readonly redis: boolean;
    readonly schema: boolean;
    readonly operationalControls: boolean;
    readonly objectStorage: boolean;
    readonly fileScanner: FileScannerReadiness;
  };
}

export async function checkFileScannerReadiness(
  config: FileScanningConfig,
): Promise<FileScannerReadiness> {
  return createMalwareScanner(config).checkReadiness();
}

export function plannedFileScannerReadiness(
  mode: FileScanningConfig["mode"],
  state: PlatformOperationalState | undefined,
): FileScannerReadiness | undefined {
  if (mode !== "clamav" || state?.fileScanQueuePaused !== true) return undefined;
  return state.fileScannerObservedState === "STOPPED" ? "paused-stopped" : "disabled-by-admin";
}

/**
 * A bounded storage-specific probe verifies the configured root or bucket,
 * endpoint, and application credentials without exposing or writing objects.
 */
export async function checkObjectStorageReadiness(config: ObjectStorageConfig): Promise<boolean> {
  try {
    const storage = createObjectStorage(config);
    if (storage.checkReadiness !== undefined) {
      await storage.checkReadiness();
    } else {
      await storage.exists("readiness/health-probe");
    }
    return true;
  } catch {
    return false;
  }
}

export async function checkReadiness(requestId: string): Promise<ReadinessResult> {
  const checks = {
    configuration: false,
    database: false,
    redis: false,
    schema: false,
    operationalControls: false,
    objectStorage: false,
    fileScanner: "unavailable" as FileScannerReadiness,
  };
  let config: AppConfig;
  let operationalState: PlatformOperationalState | undefined;
  try {
    config = loadConfig({
      serviceName: "web",
      requirements: { database: true, redis: true, storage: true, fileScanning: true },
      loadDotenv: process.env.NODE_ENV !== "production",
    });
    checks.configuration = true;
  } catch {
    return { ready: false, checks };
  }

  const logger = createLogger({
    service: "web",
    environment: config.nodeEnv,
    level: config.logLevel,
    fields: { requestId },
  });
  const database = createDatabase(config.databaseUrl ?? "");
  const redis = new Redis(config.redisUrl ?? "", {
    connectTimeout: 3_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    checks.database = await checkDatabaseHealth(database);
    if (checks.database) {
      const schema = await getSchemaStatus(database, {
        migrationsDirectory: config.migrationsDirectory,
      });
      checks.schema = schema.compatible;
      if (!checks.schema) {
        logger.warn("readiness_failed", { check: "schema" });
      } else {
        operationalState = await new PlatformOperationsService({ database }).getRuntimeState();
        checks.operationalControls = true;
      }
    } else {
      logger.warn("database_connection_failed");
    }
  } catch {
    logger.warn("readiness_failed", { check: "database_or_schema" });
  } finally {
    await closeDatabase(database);
  }

  try {
    await redis.connect();
    checks.redis = (await redis.ping()) === "PONG";
    if (!checks.redis) {
      logger.warn("readiness_failed", { check: "redis" });
    }
  } catch {
    logger.warn("readiness_failed", { check: "redis" });
  } finally {
    redis.disconnect(false);
  }

  checks.objectStorage = await checkObjectStorageReadiness(config.storage);
  if (!checks.objectStorage) {
    logger.warn("readiness_failed", { check: "object_storage" });
  }

  checks.fileScanner =
    plannedFileScannerReadiness(config.fileScanning.mode, operationalState) ??
    (await checkFileScannerReadiness(config.fileScanning));
  if (checks.fileScanner === "unavailable") {
    logger.warn("readiness_failed", { check: "file_scanner" });
  }

  const ready =
    checks.configuration &&
    checks.database &&
    checks.redis &&
    checks.schema &&
    checks.operationalControls &&
    checks.objectStorage &&
    checks.fileScanner !== "unavailable";
  return { ready, checks };
}
