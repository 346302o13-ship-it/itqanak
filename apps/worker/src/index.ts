import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import Redis from "ioredis";

import { loadConfig, type AppConfig } from "@itqanak/config";
import { checkDatabaseHealth, closeDatabase, createDatabase } from "@itqanak/db";
import { createLogger, type Logger } from "@itqanak/observability";

import { nextBackoffDelay, waitFor } from "./backoff.js";
import { DeferredOutboxWorkLoop } from "./outbox.js";

const heartbeatIntervalMs = 15_000;
const idleIntervalMs = 5_000;

async function writeHeartbeatFile(path: string | undefined): Promise<void> {
  if (path === undefined || path.trim() === "") {
    return;
  }
  await writeFile(path, new Date().toISOString(), { encoding: "utf8", mode: 0o600 });
}

async function assertRedisReady(redis: Redis): Promise<void> {
  if (redis.status !== "ready") {
    await redis.connect();
  }
  if ((await redis.ping()) !== "PONG") {
    throw new Error("Redis ping did not return PONG.");
  }
}

async function startWorker(config: AppConfig, logger: Logger, signal: AbortSignal): Promise<void> {
  const workerName = `worker-${randomUUID()}`;
  const database = createDatabase(config.databaseUrl ?? "");
  const redis = new Redis(config.redisUrl ?? "", {
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const outbox = new DeferredOutboxWorkLoop(logger.child({ workerName }));

  const heartbeat = async (): Promise<void> => {
    const databaseConnected = await checkDatabaseHealth(database);
    if (!databaseConnected) {
      throw new Error("Database connection is unavailable.");
    }
    await assertRedisReady(redis);
    await database`
      INSERT INTO worker_heartbeats (worker_name, last_seen_at)
      VALUES (${workerName}, now())
      ON CONFLICT (worker_name) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
    `;
    await writeHeartbeatFile(process.env.WORKER_HEARTBEAT_FILE);
  };

  try {
    await assertRedisReady(redis);
    await heartbeat();
    logger.info("worker_started", { workerName });

    let failedAttempts = 0;
    let lastHeartbeatAt = Date.now();
    while (!signal.aborted) {
      try {
        const now = Date.now();
        if (now - lastHeartbeatAt >= heartbeatIntervalMs) {
          await heartbeat();
          lastHeartbeatAt = now;
        }
        await outbox.poll();
        failedAttempts = 0;
        await waitFor(idleIntervalMs, signal);
      } catch {
        const delayMs = nextBackoffDelay(failedAttempts);
        failedAttempts += 1;
        logger.warn("worker_iteration_failed", { delayMs });
        await waitFor(delayMs, signal);
      }
    }
  } finally {
    redis.disconnect(false);
    await closeDatabase(database);
    logger.info("worker_stopped", { workerName });
  }
}

async function main(): Promise<void> {
  const fallbackLogger = createLogger({
    service: "worker",
    environment: process.env.NODE_ENV || "development",
  });
  let config: AppConfig;
  try {
    config = loadConfig({
      serviceName: "worker",
      requirements: { database: true, redis: true },
      loadDotenv: process.env.NODE_ENV !== "production",
    });
  } catch {
    fallbackLogger.error("worker_configuration_failed");
    process.exitCode = 1;
    return;
  }

  const logger = createLogger({
    service: "worker",
    environment: config.nodeEnv,
    level: config.logLevel,
  });
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  try {
    await startWorker(config, logger, controller.signal);
  } catch {
    logger.error("worker_start_failed");
    process.exitCode = 1;
  }
}

void main();
