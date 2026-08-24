#!/usr/bin/env node
import { randomUUID } from "node:crypto";

import { loadConfig } from "@itqanak/config";
import { closeDatabase, createDatabase, type DatabaseClient } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";
import { createMalwareScanner, createObjectStorage } from "@itqanak/storage";

import { AttachmentStorageReconciler, boundedReconciliationLimit } from "./reconciliation.js";
import { AttachmentScanProcessor } from "./scan-processor.js";
import { requestCliCommand, requestCliSafetyError, requestCliUsage } from "./cli-options.js";

function output(value: Readonly<Record<string, boolean | number | string>>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function reportOldDrafts(database: DatabaseClient): Promise<void> {
  const rows = await database<{ readonly count: number | string }[]>`
    SELECT count(*)::text AS count FROM service_requests
    WHERE status = 'DRAFT' AND updated_at < now() - interval '30 days'
  `;
  output({ dryRun: true, draftsOlderThan30Days: Number(rows[0]?.count ?? 0) });
}

async function verifyStorage(
  database: DatabaseClient,
  storage: ReturnType<typeof createObjectStorage>,
) {
  const rows = await database<{ readonly storage_key: string }[]>`
    SELECT storage_key FROM service_request_attachments
    WHERE storage_status = 'STORED' AND deleted_at IS NULL AND storage_key IS NOT NULL
    ORDER BY created_at ASC LIMIT 200
  `;
  let missing = 0;
  for (const row of rows) {
    if (!(await storage.exists(row.storage_key))) {
      missing += 1;
    }
  }
  output({ checked: rows.length, missing, sampleLimited: rows.length === 200 });
}

function requestedLimit(arguments_: readonly string[]): number {
  const option = arguments_.find((value) => value.startsWith("--limit="));
  if (option === undefined) {
    return 20;
  }
  const raw = option.slice("--limit=".length);
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error("The batch limit must be a positive integer.");
  }
  return boundedReconciliationLimit(Number(raw));
}

async function main(): Promise<void> {
  const selected = requestCliCommand(process.argv[2]);
  if (selected === undefined) {
    process.stderr.write(requestCliUsage);
    process.exitCode = 2;
    return;
  }
  const execute = process.argv.includes("--execute");
  const safetyError = requestCliSafetyError(selected, process.argv);
  if (safetyError !== undefined) {
    process.stderr.write(`${safetyError}\n`);
    process.exitCode = 2;
    return;
  }
  let database: DatabaseClient | undefined;
  const fallbackLogger = createLogger({
    service: "request-operations",
    environment: process.env.NODE_ENV ?? "development",
  });
  try {
    const config = loadConfig({
      serviceName: "request-operations",
      requirements: {
        database: true,
        storage:
          selected === "storage-verify" ||
          selected === "scan-pending" ||
          (selected === "storage-cleanup-orphans" && execute),
        fileScanning: selected === "scan-pending",
      },
      loadDotenv: process.env.NODE_ENV !== "production",
    });
    const logger = createLogger({
      service: "request-operations",
      environment: config.nodeEnv,
      level: config.logLevel,
    });
    database = createDatabase(config.databaseUrl ?? "");
    if (selected === "cleanup-drafts") {
      await reportOldDrafts(database);
      return;
    }
    if (selected === "storage-cleanup-orphans") {
      if (!execute) {
        const rows = await database<
          {
            readonly pending_uploads: number | string;
            readonly failed_uploads: number | string;
            readonly pending_deletes: number | string;
            readonly referenced_objects: number | string;
          }[]
        >`
          SELECT
            count(*) FILTER (
              WHERE storage_status = 'PENDING_UPLOAD'
                AND updated_at <= now() - interval '1 hour'
            )::text AS pending_uploads,
            count(*) FILTER (
              WHERE storage_status = 'UPLOAD_FAILED'
                AND updated_at <= now() - interval '5 minutes'
            )::text AS failed_uploads,
            count(*) FILTER (
              WHERE storage_status = 'DELETE_PENDING'
                AND updated_at <= now() - interval '5 minutes'
            )::text AS pending_deletes,
            count(*) FILTER (WHERE storage_key IS NOT NULL)::text AS referenced_objects
          FROM service_request_attachments
          WHERE (
              storage_status = 'PENDING_UPLOAD'
              AND updated_at <= now() - interval '1 hour'
            ) OR (
              storage_status IN ('UPLOAD_FAILED', 'DELETE_PENDING')
              AND updated_at <= now() - interval '5 minutes'
            )
        `;
        const row = rows[0];
        output({
          dryRun: true,
          eligiblePendingUploads: Number(row?.pending_uploads ?? 0),
          eligibleFailedUploads: Number(row?.failed_uploads ?? 0),
          eligiblePendingDeletes: Number(row?.pending_deletes ?? 0),
          referencedObjects: Number(row?.referenced_objects ?? 0),
        });
        return;
      }
      const storage = createObjectStorage(config.storage);
      const reconciler = new AttachmentStorageReconciler({ database, storage, logger });
      output({
        dryRun: false,
        ...(await reconciler.processBatch(requestedLimit(process.argv))),
      });
      return;
    }
    const storage = createObjectStorage(config.storage);
    if (selected === "storage-verify") {
      await verifyStorage(database, storage);
      return;
    }
    const scanner = createMalwareScanner(config.fileScanning);
    const processor = new AttachmentScanProcessor({
      database,
      storage,
      scanner,
      logger,
      workerId: `manual-${randomUUID()}`,
      maxAttempts: config.fileScanning.maxAttempts,
      scanTimeoutMs: config.fileScanning.scanTimeoutMs,
    });
    output({ processed: await processor.processBatch(20) });
  } catch (error: unknown) {
    fallbackLogger.error("request_operation_failed", {
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
