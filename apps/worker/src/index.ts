import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import Redis from "ioredis";

import { AuthEmailOutboxProcessor, createAuthEmailSender } from "@itqanak/auth";
import { loadConfig, type AppConfig } from "@itqanak/config";
import { checkDatabaseHealth, closeDatabase, createDatabase } from "@itqanak/db";
import { createLogger, type Logger } from "@itqanak/observability";
import {
  PlatformMessagingService,
  PlatformOperationsService,
  PlatformRetentionService,
} from "@itqanak/operations";
import {
  AttachmentScanProcessor,
  AttachmentStorageReconciler,
  MessageRetentionSweeper,
  UnifiedAttachmentRetentionSweeper,
  UnifiedAttachmentScanProcessor,
  UnifiedAttachmentStorageReconciler,
} from "@itqanak/requests";
import { createMalwareScanner, createObjectStorage } from "@itqanak/storage";

import { nextBackoffDelay, waitFor } from "./backoff.js";
import { runPeriodicHeartbeat } from "./heartbeat.js";
import { OutboxRetentionWorkLoop } from "./outbox.js";
import { MetaWhatsAppCloudSender, WhatsAppSupportOutboxProcessor } from "./whatsapp.js";
import { WebPushOutboxProcessor, webPushConfigFromEnv } from "./web-push.js";
import { shouldProcessAttachmentScans } from "./scan-queue-control.js";

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
  const outbox = new OutboxRetentionWorkLoop(database, logger.child({ workerName }));
  const whatsappNotifications =
    config.whatsapp.mode === "disabled"
      ? undefined
      : new WhatsAppSupportOutboxProcessor(
          database,
          config,
          new MetaWhatsAppCloudSender(config),
          logger.child({ workerName }),
          workerName,
          new PlatformMessagingService({ database }),
        );
  const webPushConfig = webPushConfigFromEnv(process.env);
  const webPushNotifications =
    webPushConfig === undefined
      ? undefined
      : new WebPushOutboxProcessor(
          database,
          webPushConfig,
          logger.child({ workerName }),
          workerName,
        );
  const operations = new PlatformOperationsService({ database });
  const objectStorage = createObjectStorage(config.storage);
  const malwareScanner = createMalwareScanner(config.fileScanning);
  const attachmentScans = new AttachmentScanProcessor({
    database,
    storage: objectStorage,
    scanner: malwareScanner,
    logger: logger.child({ workerName }),
    workerId: workerName,
    maxAttempts: config.fileScanning.maxAttempts,
    scanTimeoutMs: config.fileScanning.scanTimeoutMs,
  });
  const unifiedAttachmentScans = new UnifiedAttachmentScanProcessor({
    database,
    storage: objectStorage,
    scanner: malwareScanner,
    logger: logger.child({ workerName }),
    workerId: workerName,
    maxAttempts: config.fileScanning.maxAttempts,
    scanTimeoutMs: config.fileScanning.scanTimeoutMs,
  });
  const attachmentStorageReconciliation = new AttachmentStorageReconciler({
    database,
    storage: objectStorage,
    logger: logger.child({ workerName }),
  });
  const unifiedAttachmentStorageReconciliation = new UnifiedAttachmentStorageReconciler({
    database,
    storage: objectStorage,
    logger: logger.child({ workerName }),
  });
  const unifiedAttachmentRetention = new UnifiedAttachmentRetentionSweeper({
    database,
    storage: objectStorage,
    logger: logger.child({ workerName }),
  });
  const retentionSettings = new PlatformRetentionService({ database });
  const messageRetention = new MessageRetentionSweeper({
    database,
    logger: logger.child({ workerName }),
  });
  const authEmailSender = createAuthEmailSender(config);
  const authEmailOutbox =
    authEmailSender === undefined
      ? undefined
      : new AuthEmailOutboxProcessor(
          database,
          config,
          authEmailSender,
          logger.child({ workerName, deliveryMode: config.auth.emailDeliveryMode }),
          workerName,
        );

  const heartbeat = async (): Promise<void> => {
    const databaseConnected = await checkDatabaseHealth(database);
    if (!databaseConnected) {
      throw new Error("Database connection is unavailable.");
    }
    await assertRedisReady(redis);
    const operationalState = await operations.getRuntimeState();
    if (
      config.fileScanning.mode === "clamav" &&
      !operationalState.fileScanQueuePaused &&
      (await malwareScanner.checkReadiness()) !== "healthy"
    ) {
      throw new Error("Required malware scanner is unavailable.");
    }
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
    logger.info("worker_started", {
      workerName,
      authEmailDeliveryEnabled: authEmailOutbox !== undefined,
      fileScannerMode: config.fileScanning.mode,
      whatsappNotificationMode: config.whatsapp.mode,
      webPushEnabled: webPushNotifications !== undefined,
    });

    let failedAttempts = 0;
    const heartbeatLoop = runPeriodicHeartbeat({
      intervalMs: heartbeatIntervalMs,
      signal,
      heartbeat,
      onFailure: () => logger.warn("worker_heartbeat_failed", { workerName }),
    });
    let previousScanQueuePaused: boolean | undefined;
    let nextRetentionSweepAt = 0;
    while (!signal.aborted) {
      try {
        await outbox.poll();
        await whatsappNotifications?.processBatch(1);
        await webPushNotifications?.processBatch(3);
        await authEmailOutbox?.processBatch(1);
        const operationalState = await operations.getRuntimeState();
        if (previousScanQueuePaused !== operationalState.fileScanQueuePaused) {
          logger.info("attachment_scan_queue_state_observed", {
            paused: operationalState.fileScanQueuePaused,
            version: operationalState.version,
            workerName,
          });
          previousScanQueuePaused = operationalState.fileScanQueuePaused;
        }
        if (shouldProcessAttachmentScans(operationalState)) {
          // Claim one external-storage job at a time. This bounds the delay to
          // unrelated work if S3 is slow and avoids expiring leases for queued
          // jobs that this process has not started yet.
          await attachmentScans.processBatch(1);
          await unifiedAttachmentScans.processBatch(1);
        }
        await attachmentStorageReconciliation.processBatch(1);
        await unifiedAttachmentStorageReconciliation.processBatch(1);
        if (Date.now() >= nextRetentionSweepAt) {
          let swept = 0;
          let messagesSwept = 0;
          try {
            const retention = await retentionSettings.getRuntimeRetention();
            swept = await unifiedAttachmentRetention.processBatch(
              retention.attachmentUndownloadedRetentionDays,
              50,
            );
            if (retention.messageArchivalEnabled) {
              messagesSwept = await messageRetention.processBatch(
                retention.messageRetentionDays,
                100,
              );
            }
          } catch {
            // Retention settings unavailable: skip this pass, try again next tick.
          }
          // Sweep again soon while there is a backlog, otherwise every 10 min.
          const backlog = swept >= 50 || messagesSwept >= 100;
          nextRetentionSweepAt = Date.now() + (backlog ? 5_000 : 10 * 60_000);
        }
        failedAttempts = 0;
        await waitFor(idleIntervalMs, signal);
      } catch {
        const delayMs = nextBackoffDelay(failedAttempts);
        failedAttempts += 1;
        logger.warn("worker_iteration_failed", { delayMs });
        await waitFor(delayMs, signal);
      }
    }
    await heartbeatLoop;
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
      requirements: { database: true, redis: true, storage: true, fileScanning: true },
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
