import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";
import type { MalwareScanResult, MalwareScanner, ObjectStorage } from "@itqanak/storage";

import { AttachmentStorageReconciler } from "../src/reconciliation.js";
import { AttachmentScanProcessor } from "../src/scan-processor.js";

// This suite may never fall back to an operator's application database.
const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const rollbackMarker = { requestDurabilityRollback: true } as const;

interface FixtureIds {
  readonly userId: string;
  readonly requestId: string;
}

interface AttachmentStateRow {
  readonly storage_status: string;
  readonly scan_status: string;
  readonly scan_attempt_count: number | string;
}

function silentLogger() {
  return createLogger({
    service: "request-durability-integration",
    environment: "test",
    level: "error",
    write: () => undefined,
  });
}

function fakeStorage(objects: Set<string>, removed: string[]): ObjectStorage {
  return {
    provider: "local",
    exists: async (key) => objects.has(key),
    remove: async (key) => {
      removed.push(key);
      objects.delete(key);
    },
    open: async () => Readable.from(["integration scan payload"]),
    put: async (key) => ({
      key,
      checksumSha256: "a".repeat(64),
      contentLength: 1,
    }),
    signDownload: async () => "https://invalid.test/private",
  };
}

function immediateScanner(result: MalwareScanResult): MalwareScanner {
  return {
    mode: "clamav",
    scan: async (input) => {
      input.destroy();
      return result;
    },
    checkReadiness: async () => "healthy",
  };
}

async function inRolledBackTransaction(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<void>,
): Promise<void> {
  try {
    await database.begin(async (transaction) => {
      await callback(transaction as DatabaseClient);
      throw rollbackMarker;
    });
    throw new Error("Durability integration transaction unexpectedly committed.");
  } catch (error: unknown) {
    if (error !== rollbackMarker) {
      throw error;
    }
  }
}

async function insertFixture(database: DatabaseClient): Promise<FixtureIds> {
  const suffix = randomUUID().replaceAll("-", "");
  const userId = randomUUID();
  const categoryId = randomUUID();
  const serviceId = randomUUID();
  const requestId = randomUUID();
  await database`
    INSERT INTO users (
      id, email, email_normalized, display_name, status, email_verified_at
    ) VALUES (
      ${userId}, ${`durability-${suffix}@example.test`},
      ${`durability-${suffix}@example.test`}, 'Durability Student', 'ACTIVE', now()
    )
  `;
  await database`
    INSERT INTO user_roles (user_id, role_code) VALUES (${userId}, 'STUDENT')
  `;
  await database`
    INSERT INTO service_categories (
      id, slug, name_ar, name_en, description_ar, description_en, sort_order, active
    ) VALUES (
      ${categoryId}, ${`durability-${suffix}`}, 'اختبار المتانة', 'Durability test',
      'فئة معزولة لاختبار متانة معالجة الملفات فقط.',
      'An isolated category used only to test durable file processing.', 99999, TRUE
    )
  `;
  await database`
    INSERT INTO services (
      id, category_id, slug, name_ar, name_en,
      short_description_ar, short_description_en, description_ar, description_en,
      pricing_model, active, accepts_files, max_files, max_file_size_bytes, sort_order
    ) VALUES (
      ${serviceId}, ${categoryId}, ${`durability-service-${suffix}`},
      'خدمة المتانة', 'Durability service',
      'خدمة معزولة لاختبار تنافس معالجة الملفات.',
      'An isolated service for testing concurrent file processing.',
      'خدمة اختبار تكاملية معزولة تتحقق من متانة انتقالات التخزين والفحص.',
      'An isolated integration fixture that verifies durable storage and scan transitions.',
      'QUOTE_REQUIRED', TRUE, TRUE, 10, 10485760, 99999
    )
  `;
  await database`
    INSERT INTO service_requests (
      id, student_user_id, service_id, title, description, submission_key,
      submission_fingerprint
    ) VALUES (
      ${requestId}, ${userId}, ${serviceId}, '', '', ${randomUUID()}, ${"a".repeat(64)}
    )
  `;
  return { userId, requestId };
}

function objectKey(requestId: string, attachmentId: string, suffix: string): string {
  return `requests/${requestId}/${attachmentId}/${suffix.padEnd(32, "a")}`;
}

integrationDescribe("request durability integration", () => {
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

  it("rejects TRUNCATE on append-only request events", async () => {
    await inRolledBackTransaction(database, async (transaction) => {
      await expect(
        transaction.savepoint(async (savepoint) => {
          await (savepoint as DatabaseClient)`TRUNCATE TABLE service_request_events CASCADE`;
        }),
      ).rejects.toThrow(/append-only/i);
      await expect(transaction`SELECT 1 AS transaction_is_usable`).resolves.toHaveLength(1);
    });
  });

  it("does not let an expired scan attempt overwrite or delete after a newer attempt wins", async () => {
    await inRolledBackTransaction(database, async (transaction) => {
      const fixture = await insertFixture(transaction);
      const attachmentId = randomUUID();
      const key = objectKey(fixture.requestId, attachmentId, "stale-scan");
      const outboxId = randomUUID();
      await transaction`
        INSERT INTO service_request_attachments (
          id, request_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, detected_mime_type,
          declared_mime_type, size_bytes, sha256, storage_status, scan_status,
          scan_next_attempt_at
        ) VALUES (
          ${attachmentId}, ${fixture.requestId}, ${fixture.userId}, 'local', ${key},
          'scan.txt', '.txt', 'text/plain', 'text/plain', 4, ${"b".repeat(64)},
          'STORED', 'PENDING_SCAN', now()
        )
      `;
      await transaction`
        INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, idempotency_key, payload
        ) VALUES (
          ${outboxId}, 'ATTACHMENT_SCAN_REQUESTED', 'REQUEST_ATTACHMENT', ${attachmentId},
          ${`durability-scan-${attachmentId}`}, '{}'::jsonb
        )
      `;

      let markFirstScanStarted!: () => void;
      let resolveFirstScan!: (result: MalwareScanResult) => void;
      const firstScanStarted = new Promise<void>((resolve) => {
        markFirstScanStarted = resolve;
      });
      const firstScanResult = new Promise<MalwareScanResult>((resolve) => {
        resolveFirstScan = resolve;
      });
      const staleScanner: MalwareScanner = {
        mode: "clamav",
        scan: async (input) => {
          input.destroy();
          markFirstScanStarted();
          return firstScanResult;
        },
        checkReadiness: async () => "healthy",
      };
      const removed: string[] = [];
      const objects = new Set([key]);
      const common = {
        database: transaction,
        storage: fakeStorage(objects, removed),
        logger: silentLogger(),
        maxAttempts: 3,
        scanTimeoutMs: 1,
      } as const;
      const staleProcessor = new AttachmentScanProcessor({
        ...common,
        scanner: staleScanner,
        workerId: "stale-worker",
      });
      const currentProcessor = new AttachmentScanProcessor({
        ...common,
        scanner: immediateScanner({ status: "CLEAN" }),
        workerId: "current-worker",
      });

      const staleWork = staleProcessor.processBatch(1);
      await firstScanStarted;
      await transaction`
        UPDATE outbox_events SET available_at = now() - interval '1 minute'
        WHERE id = ${outboxId} AND status = 'PROCESSING' AND attempt_count = 1
      `;
      await expect(currentProcessor.processBatch(1)).resolves.toBe(1);
      resolveFirstScan({ status: "INFECTED" });
      await expect(staleWork).resolves.toBe(1);

      const attachmentRows = await transaction<AttachmentStateRow[]>`
        SELECT storage_status, scan_status, scan_attempt_count
        FROM service_request_attachments WHERE id = ${attachmentId}
      `;
      const outboxRows = await transaction<
        { readonly status: string; readonly attempt_count: number | string }[]
      >`
        SELECT status, attempt_count FROM outbox_events WHERE id = ${outboxId}
      `;
      const eventRows = await transaction<{ readonly count: number | string }[]>`
        SELECT count(*)::text AS count FROM service_request_events
        WHERE request_id = ${fixture.requestId} AND event_type = 'FILE_SCAN_COMPLETED'
      `;
      expect(attachmentRows[0]).toMatchObject({
        storage_status: "STORED",
        scan_status: "CLEAN",
        scan_attempt_count: 2,
      });
      expect(outboxRows[0]).toMatchObject({ status: "DELIVERED", attempt_count: 2 });
      expect(Number(eventRows[0]?.count ?? 0)).toBe(1);
      expect(removed).toEqual([]);
      expect(objects.has(key)).toBe(true);
    });
  });

  it("defers a failing object stream without consuming a scan attempt", async () => {
    await inRolledBackTransaction(database, async (transaction) => {
      const fixture = await insertFixture(transaction);
      const attachmentId = randomUUID();
      const key = objectKey(fixture.requestId, attachmentId, "storage-outage");
      const outboxId = randomUUID();
      await transaction`
        INSERT INTO service_request_attachments (
          id, request_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, detected_mime_type,
          declared_mime_type, size_bytes, sha256, storage_status, scan_status,
          scan_next_attempt_at
        ) VALUES (
          ${attachmentId}, ${fixture.requestId}, ${fixture.userId}, 'local', ${key},
          'storage-outage.txt', '.txt', 'text/plain', 'text/plain', 4, ${"c".repeat(64)},
          'STORED', 'PENDING_SCAN', now()
        )
      `;
      await transaction`
        INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, idempotency_key, payload
        ) VALUES (
          ${outboxId}, 'ATTACHMENT_SCAN_REQUESTED', 'REQUEST_ATTACHMENT', ${attachmentId},
          ${`durability-storage-outage-${attachmentId}`}, '{}'::jsonb
        )
      `;
      const unavailableStorage: ObjectStorage = {
        ...fakeStorage(new Set([key]), []),
        open: async () =>
          new Readable({
            read() {
              this.push(Buffer.from("partial object"));
              this.destroy(new Error("temporary object-store stream outage"));
            },
          }),
      };
      const inputAwareScanner: MalwareScanner = {
        mode: "clamav",
        checkReadiness: async () => "healthy",
        scan: async (input) => {
          try {
            for await (const chunk of input) {
              // Consume the object exactly as the ClamAV adapter does.
              void chunk;
            }
            return { status: "CLEAN" };
          } catch {
            return { status: "ERROR", errorSource: "INPUT_STREAM" };
          }
        },
      };
      const processor = new AttachmentScanProcessor({
        database: transaction,
        storage: unavailableStorage,
        scanner: inputAwareScanner,
        logger: silentLogger(),
        workerId: "storage-outage-worker",
        maxAttempts: 3,
        scanTimeoutMs: 1,
        random: () => 0,
      });

      await expect(processor.processBatch(1)).resolves.toBe(1);
      const attachmentRows = await transaction<
        {
          readonly scan_attempt_count: number | string;
          readonly scan_last_error_code: string | null;
          readonly scan_status: string;
        }[]
      >`
        SELECT scan_attempt_count, scan_last_error_code, scan_status
        FROM service_request_attachments WHERE id = ${attachmentId}
      `;
      const outboxRows = await transaction<
        {
          readonly attempt_count: number | string;
          readonly last_error_code: string | null;
          readonly status: string;
        }[]
      >`
        SELECT attempt_count, last_error_code, status
        FROM outbox_events WHERE id = ${outboxId}
      `;
      expect(attachmentRows[0]).toMatchObject({
        scan_attempt_count: 0,
        scan_last_error_code: "STORAGE_UNAVAILABLE",
        scan_status: "PENDING_SCAN",
      });
      expect(outboxRows[0]).toMatchObject({
        attempt_count: 0,
        last_error_code: "STORAGE_UNAVAILABLE",
        status: "RETRY",
      });
    });
  });

  it("keeps an infected object in DELETE_PENDING until a referenced retry confirms deletion", async () => {
    await inRolledBackTransaction(database, async (transaction) => {
      const fixture = await insertFixture(transaction);
      const attachmentId = randomUUID();
      const key = objectKey(fixture.requestId, attachmentId, "infected");
      const outboxId = randomUUID();
      await transaction`
        INSERT INTO service_request_attachments (
          id, request_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, detected_mime_type,
          declared_mime_type, size_bytes, sha256, storage_status, scan_status,
          scan_next_attempt_at
        ) VALUES (
          ${attachmentId}, ${fixture.requestId}, ${fixture.userId}, 'local', ${key},
          'infected.txt', '.txt', 'text/plain', 'text/plain', 4, ${"d".repeat(64)},
          'STORED', 'PENDING_SCAN', now()
        )
      `;
      await transaction`
        INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, idempotency_key, payload
        ) VALUES (
          ${outboxId}, 'ATTACHMENT_SCAN_REQUESTED', 'REQUEST_ATTACHMENT', ${attachmentId},
          ${`durability-infected-${attachmentId}`}, '{}'::jsonb
        )
      `;

      const objects = new Set([key]);
      const removed: string[] = [];
      let failDelete = true;
      const storage: ObjectStorage = {
        ...fakeStorage(objects, removed),
        remove: async (storageKey) => {
          if (failDelete) {
            throw new Error("temporary object-store failure");
          }
          removed.push(storageKey);
          objects.delete(storageKey);
        },
      };
      const processor = new AttachmentScanProcessor({
        database: transaction,
        storage,
        scanner: immediateScanner({ status: "INFECTED" }),
        logger: silentLogger(),
        workerId: "infected-worker",
        maxAttempts: 3,
        scanTimeoutMs: 1,
      });
      await expect(processor.processBatch(1)).resolves.toBe(1);

      const pendingRows = await transaction<
        {
          readonly storage_status: string;
          readonly scan_status: string;
          readonly deleted_at: Date | string | null;
        }[]
      >`
        SELECT storage_status, scan_status, deleted_at
        FROM service_request_attachments WHERE id = ${attachmentId}
      `;
      expect(pendingRows[0]).toMatchObject({
        storage_status: "DELETE_PENDING",
        scan_status: "INFECTED",
      });
      expect(pendingRows[0]?.deleted_at).toBeNull();
      expect(objects.has(key)).toBe(true);

      failDelete = false;
      await transaction`
        UPDATE service_request_attachments
        SET created_at = now() - interval '101 years', updated_at = now() - interval '100 years'
        WHERE id = ${attachmentId}
      `;
      const reconciler = new AttachmentStorageReconciler({
        database: transaction,
        storage,
        logger: silentLogger(),
        minimumAgeMs: 60 * 60 * 1_000,
      });
      await expect(reconciler.processBatch(1)).resolves.toEqual({
        claimed: 1,
        finalized: 1,
        retryPending: 0,
      });
      const finalizedRows = await transaction<
        { readonly storage_status: string; readonly deleted_at: Date | string | null }[]
      >`
        SELECT storage_status, deleted_at
        FROM service_request_attachments WHERE id = ${attachmentId}
      `;
      expect(finalizedRows[0]?.storage_status).toBe("DELETED");
      expect(finalizedRows[0]?.deleted_at).toBeNull();
      expect(objects.has(key)).toBe(false);
      expect(removed).toEqual([key]);
    });
  });

  it("retries only stale, DB-referenced upload and delete states in a bounded batch", async () => {
    await inRolledBackTransaction(database, async (transaction) => {
      const fixture = await insertFixture(transaction);
      const failedId = randomUUID();
      const pendingId = randomUUID();
      const interruptedId = randomUUID();
      const retainedId = randomUUID();
      const failedKey = objectKey(fixture.requestId, failedId, "failed");
      const pendingKey = objectKey(fixture.requestId, pendingId, "pending");
      const interruptedKey = objectKey(fixture.requestId, interruptedId, "interrupted");
      const retainedKey = objectKey(fixture.requestId, retainedId, "retained");
      await transaction`
        INSERT INTO service_request_attachments (
          id, request_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, declared_mime_type, size_bytes,
          storage_status, scan_status, created_at, updated_at
        ) VALUES (
          ${interruptedId}, ${fixture.requestId}, ${fixture.userId}, 'local', ${interruptedKey},
          'interrupted.txt', '.txt', 'text/plain', 4, 'PENDING_UPLOAD', 'NOT_REQUIRED',
          now() - interval '101 years', now() - interval '100 years'
        )
      `;
      await transaction`
        INSERT INTO service_request_attachments (
          id, request_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, declared_mime_type, size_bytes,
          storage_status, scan_status, created_at, updated_at
        ) VALUES (
          ${failedId}, ${fixture.requestId}, ${fixture.userId}, 'local', ${failedKey},
          'failed.txt', '.txt', 'text/plain', 4, 'UPLOAD_FAILED', 'NOT_REQUIRED',
          now() - interval '101 years', now() - interval '100 years'
        )
      `;
      await transaction`
        INSERT INTO service_request_attachments (
          id, request_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, declared_mime_type, size_bytes,
          storage_status, scan_status, created_at, updated_at, deleted_at
        ) VALUES (
          ${pendingId}, ${fixture.requestId}, ${fixture.userId}, 'local', ${pendingKey},
          'pending.txt', '.txt', 'text/plain', 4, 'DELETE_PENDING', 'NOT_REQUIRED',
          now() - interval '101 years', now() - interval '100 years',
          now() - interval '100 years'
        )
      `;
      await transaction`
        INSERT INTO service_request_attachments (
          id, request_id, uploaded_by_user_id, storage_provider, storage_key,
          original_filename, normalized_extension, detected_mime_type,
          declared_mime_type, size_bytes, sha256, storage_status, scan_status
        ) VALUES (
          ${retainedId}, ${fixture.requestId}, ${fixture.userId}, 'local', ${retainedKey},
          'retained.txt', '.txt', 'text/plain', 'text/plain', 4, ${"c".repeat(64)},
          'STORED', 'NOT_REQUIRED'
        )
      `;

      const removed: string[] = [];
      const objects = new Set([failedKey, pendingKey, interruptedKey, retainedKey]);
      const reconciler = new AttachmentStorageReconciler({
        database: transaction,
        storage: fakeStorage(objects, removed),
        logger: silentLogger(),
        minimumAgeMs: 60 * 60 * 1_000,
        pendingUploadMinimumAgeMs: 60 * 60 * 1_000,
      });
      await expect(reconciler.processBatch(3)).resolves.toEqual({
        claimed: 3,
        finalized: 3,
        retryPending: 0,
      });

      const rows = await transaction<{ readonly id: string; readonly storage_status: string }[]>`
        SELECT id, storage_status FROM service_request_attachments
        WHERE id IN (${failedId}, ${pendingId}, ${interruptedId}, ${retainedId})
        ORDER BY id
      `;
      expect(rows.find((row) => row.id === failedId)?.storage_status).toBe("DELETED");
      expect(rows.find((row) => row.id === pendingId)?.storage_status).toBe("DELETED");
      expect(rows.find((row) => row.id === interruptedId)?.storage_status).toBe("DELETED");
      expect(rows.find((row) => row.id === retainedId)?.storage_status).toBe("STORED");
      expect(new Set(removed)).toEqual(new Set([failedKey, pendingKey, interruptedKey]));
      expect(objects.has(retainedKey)).toBe(true);
    });
  });
});
