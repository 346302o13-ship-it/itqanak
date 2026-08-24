import { randomUUID } from "node:crypto";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal } from "@itqanak/auth";
import type { AppConfig } from "@itqanak/config";
import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";
import { ClamAvTcpScanner, createRequestObjectKey, LocalPrivateStorage } from "@itqanak/storage";

import { RequestAttachmentService } from "../src/attachments.js";
import { AttachmentScanProcessor } from "../src/scan-processor.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const clamavHost = process.env.TEST_CLAMAV_HOST;
const clamavPort = Number(process.env.TEST_CLAMAV_PORT ?? "3310");
const antivirusDescribe =
  databaseUrl === undefined || clamavHost === undefined ? describe.skip : describe;
const rollbackMarker = { antivirusIntegrationRollback: true } as const;

function config(storageRoot: string): AppConfig {
  return {
    nodeEnv: "production",
    serviceName: "antivirus-integration",
    appName: "ITQANAK",
    defaultLocale: "ar",
    publicAppUrl: "https://app.itqanak.test",
    adminAppUrl: "https://admin.itqanak.test/ar/admin",
    academicIntegrityVersion: "2026-08",
    migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    logLevel: "error",
    whatsapp: { mode: "disabled", graphApiVersion: "v25.0", maxAttempts: 8 },
    storage: {
      driver: "local",
      localPath: storageRoot,
      maxFileBytes: 20 * 1_024 * 1_024,
      maxFilesPerRequest: 10,
      maxTotalBytesPerRequest: 100 * 1_024 * 1_024,
    },
    fileScanning: {
      mode: "clamav",
      clamavHost: clamavHost ?? "clamav",
      clamavPort,
      connectTimeoutMs: 5_000,
      scanTimeoutMs: 30_000,
      maxAttempts: 3,
    },
    auth: {
      studentSessionAbsoluteTtlSeconds: 2_592_000,
      studentSessionIdleTtlSeconds: 604_800,
      adminSessionAbsoluteTtlSeconds: 43_200,
      adminSessionIdleTtlSeconds: 7_200,
      emailVerificationTtlSeconds: 86_400,
      passwordResetTtlSeconds: 1_800,
      rateLimitEnabled: false,
      emailDeliveryMode: "disabled",
      termsVersion: "2026-08",
      privacyVersion: "2026-08",
    },
    databaseUrl,
  };
}

antivirusDescribe.sequential("request antivirus integration", () => {
  let database: DatabaseClient;
  let storageRoot: string;
  let storage: LocalPrivateStorage;
  let createdKey: string | undefined;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "itqanak-antivirus-integration-"));
    storage = new LocalPrivateStorage(storageRoot);
    database = createDatabase(databaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
  });

  afterAll(async () => {
    await closeDatabase(database);
    if (createdKey !== undefined) {
      await storage.remove(createdKey).catch(() => undefined);
      const parts = createdKey.split("/");
      await rmdir(join(storageRoot, ...parts.slice(0, 3))).catch(() => undefined);
      await rmdir(join(storageRoot, ...parts.slice(0, 2))).catch(() => undefined);
      await rmdir(join(storageRoot, parts[0] ?? "requests")).catch(() => undefined);
    }
    await rmdir(storageRoot).catch(() => undefined);
  });

  it("blocks an infected object, records history, and audits the denied download", async () => {
    const logs: string[] = [];
    const logger = createLogger({
      service: "antivirus-integration",
      environment: "test",
      level: "debug",
      write: (line) => logs.push(line),
    });
    try {
      await database.begin(async (transaction) => {
        const tx = transaction as DatabaseClient;
        const userId = randomUUID();
        const sessionId = randomUUID();
        const categoryId = randomUUID();
        const serviceId = randomUUID();
        const requestId = randomUUID();
        const attachmentId = randomUUID();
        const suffix = randomUUID().replaceAll("-", "");
        const email = `antivirus-${suffix}@example.test`;
        await tx`
          INSERT INTO users (id, email, email_normalized, display_name, status, email_verified_at)
          VALUES (${userId}, ${email}, ${email}, 'Antivirus Student', 'ACTIVE', now())
        `;
        await tx`INSERT INTO user_roles (user_id, role_code) VALUES (${userId}, 'STUDENT')`;
        await tx`
          INSERT INTO user_sessions (
            id, user_id, selector, validator_hash, expires_at, idle_expires_at
          ) VALUES (
            ${sessionId}, ${userId}, ${randomUUID().replaceAll("-", "")}, ${"a".repeat(64)},
            now() + interval '1 day', now() + interval '1 day'
          )
        `;
        await tx`
          INSERT INTO service_categories (
            id, slug, name_ar, name_en, description_ar, description_en, sort_order, active
          ) VALUES (
            ${categoryId}, ${`antivirus-${suffix}`}, 'اختبار الحماية', 'Antivirus test',
            'فئة معزولة لاختبار الحماية من الملفات المصابة.',
            'An isolated category used only to test infected-file protection.', 99999, TRUE
          )
        `;
        await tx`
          INSERT INTO services (
            id, category_id, slug, name_ar, name_en,
            short_description_ar, short_description_en, description_ar, description_en,
            pricing_model, active, accepts_files, max_files, max_file_size_bytes, sort_order
          ) VALUES (
            ${serviceId}, ${categoryId}, ${`antivirus-service-${suffix}`},
            'خدمة الحماية', 'Antivirus service',
            'خدمة معزولة لاختبار فحص ملف مرفق.',
            'An isolated service for testing attachment malware scanning.',
            'خدمة اختبار تكاملية تتحقق من منع الملف المصاب وتدقيق محاولة تنزيله.',
            'An isolated integration fixture that blocks infected files and audits downloads.',
            'QUOTE_REQUIRED', TRUE, TRUE, 3, 10485760, 99999
          )
        `;
        const requestRows = await tx<{ readonly request_number: string }[]>`
          INSERT INTO service_requests (
            id, student_user_id, service_id, title, description, submission_key,
            submission_fingerprint
          ) VALUES (
            ${requestId}, ${userId}, ${serviceId}, 'طلب فحص مرفق',
            'طلب تكاملي معزول للتحقق من سياسة الملفات المصابة.', ${randomUUID()},
            ${"b".repeat(64)}
          ) RETURNING request_number
        `;
        const requestNumber = requestRows[0]?.request_number;
        if (requestNumber === undefined) {
          throw new Error("Antivirus fixture request number was not generated.");
        }

        const signature = [
          "X5O!P%@AP[4\\PZX54(P^)7CC)7}$",
          "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!",
          "$H+H*",
        ].join("");
        const bytes = Buffer.from(signature, "ascii");
        const key = createRequestObjectKey(requestId, attachmentId);
        createdKey = key;
        const stored = await storage.put(key, Readable.from([bytes]), {
          originalName: "security-test.txt",
          declaredMimeType: "text/plain",
          detectedMimeType: "text/plain",
          contentLength: bytes.length,
          uploadedAt: new Date(),
        });
        await tx`
          INSERT INTO service_request_attachments (
            id, request_id, uploaded_by_user_id, storage_provider, storage_key,
            original_filename, normalized_extension, detected_mime_type,
            declared_mime_type, size_bytes, sha256, storage_status, scan_status,
            scan_next_attempt_at
          ) VALUES (
            ${attachmentId}, ${requestId}, ${userId}, 'local', ${key}, 'security-test.txt',
            '.txt', 'text/plain', 'text/plain', ${bytes.length}, ${stored.checksumSha256},
            'STORED', 'PENDING_SCAN', now()
          )
        `;
        await tx`
          INSERT INTO outbox_events (
            event_type, aggregate_type, aggregate_id, idempotency_key, payload
          ) VALUES (
            'ATTACHMENT_SCAN_REQUESTED', 'REQUEST_ATTACHMENT', ${attachmentId},
            ${`antivirus:${attachmentId}:scan`}, ${tx.json({ schemaVersion: 1, requestId, attachmentId })}
          )
        `;

        const processor = new AttachmentScanProcessor({
          database: tx,
          storage,
          scanner: new ClamAvTcpScanner({
            host: clamavHost ?? "clamav",
            port: clamavPort,
            connectTimeoutMs: 5_000,
            scanTimeoutMs: 30_000,
          }),
          logger,
          workerId: "antivirus-integration-worker",
          maxAttempts: 3,
          scanTimeoutMs: 30_000,
        });
        await expect(processor.processBatch(1)).resolves.toBe(1);
        const attachmentRows = await tx<
          {
            readonly storage_status: string;
            readonly scan_status: string;
            readonly deleted_at: Date | string | null;
          }[]
        >`
          SELECT storage_status, scan_status, deleted_at
          FROM service_request_attachments WHERE id = ${attachmentId}
        `;
        expect(attachmentRows[0]).toEqual({
          storage_status: "DELETED",
          scan_status: "INFECTED",
          deleted_at: null,
        });
        await expect(storage.exists(key)).resolves.toBe(false);
        const eventRows = await tx<{ readonly count: string }[]>`
          SELECT count(*)::text AS count FROM service_request_events
          WHERE request_id = ${requestId} AND event_type = 'FILE_SCAN_COMPLETED'
        `;
        expect(eventRows[0]?.count).toBe("1");

        const principal: AuthenticatedPrincipal = {
          userId,
          sessionId,
          roles: ["STUDENT"],
          permissions: ["requests.attachments.read.own"],
          displayName: "Antivirus Student",
          email,
          status: "ACTIVE",
        };
        const attachmentService = new RequestAttachmentService({
          database: tx,
          config: config(storageRoot),
          storage,
          logger,
        });
        await expect(
          attachmentService.authorizeDownload(principal, requestNumber, attachmentId),
        ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" });
        const auditRows = await tx<{ readonly count: string }[]>`
          SELECT count(*)::text AS count FROM security_audit_events
          WHERE resource_id = ${requestId} AND event_type = 'request.download_denied'
        `;
        expect(auditRows[0]?.count).toBe("1");
        expect(logs.join("\n")).not.toContain(signature);
        throw rollbackMarker;
      });
      throw new Error("Antivirus integration transaction unexpectedly committed.");
    } catch (error: unknown) {
      if (error !== rollbackMarker) {
        throw error;
      }
    }
  });
});
