import { randomUUID } from "node:crypto";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";
import {
  createConversationObjectKey,
  LocalPrivateStorage,
  type MalwareScanner,
} from "@itqanak/storage";

import { UnifiedAttachmentScanProcessor } from "../src/unified-attachment-scan-processor.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl === undefined ? describe.skip : describe;
const rollback = { unifiedAttachmentScanRollback: true } as const;

integrationDescribe.sequential("unified attachment scan integration", () => {
  let database: DatabaseClient;
  let storage: LocalPrivateStorage;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "itqanak-unified-scan-"));
    storage = new LocalPrivateStorage(storageRoot);
    database = createDatabase(databaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
  });

  afterAll(async () => {
    await closeDatabase(database);
    await rmdir(storageRoot).catch(() => undefined);
  });

  it("claims a newly queued unified attachment and records a real clean result", async () => {
    let objectKey: string | undefined;
    try {
      await database.begin(async (transaction) => {
        const tx = transaction as DatabaseClient;
        const studentId = randomUUID();
        const attachmentId = randomUUID();
        const email = `unified-scan-${randomUUID()}@example.test`;
        await tx`
          INSERT INTO users (id, email, email_normalized, display_name, status, email_verified_at)
          VALUES (${studentId}, ${email}, ${email}, 'Unified scan student', 'ACTIVE', now())
        `;
        await tx`INSERT INTO user_roles (user_id, role_code) VALUES (${studentId}, 'STUDENT')`;
        const conversations = await tx<{ readonly id: string }[]>`
          SELECT id FROM support_conversations WHERE student_user_id = ${studentId}
        `;
        const conversationId = conversations[0]?.id;
        if (conversationId === undefined) throw new Error("Student conversation was not created.");

        const bytes = Buffer.from("bounded educational note", "utf8");
        objectKey = createConversationObjectKey(conversationId, attachmentId);
        const stored = await storage.put(objectKey, Readable.from([bytes]), {
          originalName: "note.txt",
          declaredMimeType: "text/plain",
          detectedMimeType: "text/plain",
          contentLength: bytes.length,
          uploadedAt: new Date(),
        });
        await tx`
          INSERT INTO unified_conversation_attachments (
            id, conversation_id, uploaded_by_user_id, storage_provider, storage_key,
            original_filename, normalized_extension, detected_mime_type, declared_mime_type,
            size_bytes, sha256, storage_status, scan_status, scan_next_attempt_at
          ) VALUES (
            ${attachmentId}, ${conversationId}, ${studentId}, 'local', ${objectKey},
            'note.txt', '.txt', 'text/plain', 'text/plain', ${bytes.length},
            ${stored.checksumSha256}, 'STORED', 'PENDING_SCAN', now()
          )
        `;
        await tx`
          INSERT INTO outbox_events (
            event_type, aggregate_type, aggregate_id, idempotency_key, payload
          ) VALUES (
            'UNIFIED_ATTACHMENT_SCAN_REQUESTED', 'UNIFIED_CONVERSATION_ATTACHMENT',
            ${attachmentId}, ${`unified-scan-test:${attachmentId}`},
            ${tx.json({ schemaVersion: 1, attachmentId, conversationId })}
          )
        `;
        const scanner: MalwareScanner = {
          mode: "clamav",
          checkReadiness: async () => "healthy",
          scan: async (body) => {
            for await (const chunk of body) {
              // Consume the complete private object stream before recording CLEAN.
              void chunk;
            }
            return { status: "CLEAN" };
          },
        };
        const processor = new UnifiedAttachmentScanProcessor({
          database: tx,
          storage,
          scanner,
          logger: createLogger({
            service: "unified-scan-integration",
            environment: "test",
            level: "error",
            write: () => undefined,
          }),
          workerId: "unified-scan-integration",
          maxAttempts: 3,
          scanTimeoutMs: 30_000,
        });
        await expect(processor.processBatch(1)).resolves.toBe(1);
        const rows = await tx<{ readonly scan_status: string; readonly outbox_status: string }[]>`
          SELECT attachments.scan_status, outbox.status AS outbox_status
          FROM unified_conversation_attachments AS attachments
          INNER JOIN outbox_events AS outbox ON outbox.aggregate_id = attachments.id
          WHERE attachments.id = ${attachmentId}
            AND outbox.event_type = 'UNIFIED_ATTACHMENT_SCAN_REQUESTED'
        `;
        expect(rows).toEqual([{ scan_status: "CLEAN", outbox_status: "DELIVERED" }]);
        throw rollback;
      });
      throw new Error("Unified attachment scan fixture unexpectedly committed.");
    } catch (error: unknown) {
      if (error !== rollback) throw error;
    } finally {
      if (objectKey !== undefined) {
        await storage.remove(objectKey).catch(() => undefined);
        const parts = objectKey.split("/");
        await rmdir(join(storageRoot, ...parts.slice(0, 3))).catch(() => undefined);
        await rmdir(join(storageRoot, ...parts.slice(0, 2))).catch(() => undefined);
        await rmdir(join(storageRoot, parts[0] ?? "conversations")).catch(() => undefined);
      }
    }
  });
});
