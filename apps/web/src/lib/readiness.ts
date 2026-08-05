import Redis from "ioredis";

import { loadConfig, type AppConfig } from "@itqanak/config";
import { checkDatabaseHealth, closeDatabase, createDatabase, getSchemaStatus } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";

export interface ReadinessResult {
  readonly ready: boolean;
  readonly checks: {
    readonly configuration: boolean;
    readonly database: boolean;
    readonly redis: boolean;
    readonly schema: boolean;
  };
}

export async function checkReadiness(requestId: string): Promise<ReadinessResult> {
  const checks = { configuration: false, database: false, redis: false, schema: false };
  let config: AppConfig;
  try {
    config = loadConfig({
      serviceName: "web",
      requirements: { database: true, redis: true },
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

  const ready = checks.configuration && checks.database && checks.redis && checks.schema;
  return { ready, checks };
}
