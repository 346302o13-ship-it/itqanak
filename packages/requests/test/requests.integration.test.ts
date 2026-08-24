import { randomUUID } from "node:crypto";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal, Permission } from "@itqanak/auth";
import { seedDevelopmentCatalog } from "@itqanak/catalog";
import type { AppConfig } from "@itqanak/config";
import { generateSubmissionKey } from "@itqanak/core";
import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";
import { LocalPrivateStorage, type ObjectStorage } from "@itqanak/storage";

import { RequestAttachmentService } from "../src/attachments.js";
import { RequestDomainError } from "../src/errors.js";
import { RequestService } from "../src/service.js";

// Never fall back to DATABASE_URL: this suite may only touch an explicitly selected test DB.
const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;

const ownPermissions = [
  "catalog.read",
  "requests.create",
  "requests.read.own",
  "requests.update.own",
  "requests.cancel.own",
  "requests.attachments.create.own",
  "requests.attachments.read.own",
  "requests.attachments.delete.own",
] as const satisfies readonly Permission[];

interface StudentFixture {
  readonly principal: AuthenticatedPrincipal;
}

interface ServiceFixture {
  readonly id: string;
  readonly slug: string;
}

interface GatedStorage {
  readonly storage: ObjectStorage;
  readonly started: Promise<void>;
  readonly removed: string[];
  release(): void;
}

function gatedStorage(): GatedStorage {
  let markStarted!: () => void;
  let releasePut!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releasePut = resolve;
  });
  const removed: string[] = [];
  return {
    started,
    removed,
    release: releasePut,
    storage: {
      provider: "local",
      exists: async () => true,
      open: async () => Readable.from([]),
      signDownload: async () => "https://invalid.test/private",
      remove: async (key) => {
        removed.push(key);
      },
      put: async (key, body, metadata) => {
        markStarted();
        await released;
        let received = 0;
        const stream = body instanceof Readable ? body : Readable.from([body]);
        for await (const chunk of stream) {
          received += Buffer.isBuffer(chunk) ? chunk.length : Buffer.from(chunk).length;
        }
        if (received !== metadata.contentLength) {
          throw new Error("Gated integration storage received an unexpected byte count.");
        }
        return {
          key,
          checksumSha256: "e".repeat(64),
          contentLength: received,
        };
      },
    },
  };
}

function withAmbiguousSecondCommit(database: DatabaseClient): DatabaseClient {
  let transactionCount = 0;
  return new Proxy(database, {
    apply(target, thisArgument, argumentsList) {
      return Reflect.apply(target, thisArgument, argumentsList);
    },
    get(target, property, receiver) {
      if (property === "begin") {
        return async (callback: (transaction: DatabaseClient) => Promise<unknown>) => {
          transactionCount += 1;
          const result = await target.begin((transaction) =>
            callback(transaction as DatabaseClient),
          );
          if (transactionCount === 2) {
            throw new Error("simulated PostgreSQL commit response loss");
          }
          return result;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as DatabaseClient;
}

function config(databaseUrl: string, storagePath: string): AppConfig {
  return {
    nodeEnv: "test",
    serviceName: "requests-integration",
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
      localPath: storagePath,
      maxFileBytes: 20 * 1_024 * 1_024,
      maxFilesPerRequest: 10,
      maxTotalBytesPerRequest: 100 * 1_024 * 1_024,
    },
    fileScanning: {
      mode: "disabled",
      clamavHost: "clamav",
      clamavPort: 3310,
      connectTimeoutMs: 3_000,
      scanTimeoutMs: 30_000,
      maxAttempts: 5,
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

async function createStudent(database: DatabaseClient, label: string): Promise<StudentFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const email = `${label}-${randomUUID()}@example.test`;
  await database.begin(async (transaction) => {
    const tx = transaction as DatabaseClient;
    await tx`
      INSERT INTO users (
        id, email, email_normalized, display_name, status, email_verified_at
      ) VALUES (
        ${userId}, ${email}, ${email}, ${`طالب ${label}`}, 'ACTIVE', now()
      )
    `;
    await tx`INSERT INTO user_roles (user_id, role_code) VALUES (${userId}, 'STUDENT')`;
    await tx`
      INSERT INTO user_sessions (
        id, user_id, selector, validator_hash, expires_at, idle_expires_at
      ) VALUES (
        ${sessionId}, ${userId}, ${randomUUID().replaceAll("-", "")},
        ${"a".repeat(64)}, now() + interval '1 day', now() + interval '1 day'
      )
    `;
  });
  return {
    principal: {
      userId,
      sessionId,
      roles: ["STUDENT"],
      permissions: ownPermissions,
      displayName: `طالب ${label}`,
      email,
      status: "ACTIVE",
    },
  };
}

function draftInput(serviceId: string, submissionKey = generateSubmissionKey()) {
  return {
    serviceId,
    submissionKey,
    title: "مراجعة مستند تعليمي",
    description: "أحتاج إلى مراجعة تنظيم المستند وشرح الملاحظات التعليمية بوضوح.",
    deadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    urgency: "NORMAL" as const,
    budgetAmount: "125.50",
    budgetCurrency: "SAR",
    languageCode: "ar" as const,
    academicLevel: "BACHELOR" as const,
    institutionName: "جامعة الاختبار",
    privacyRequested: true,
  };
}

async function count(
  database: DatabaseClient,
  query: "events" | "outbox",
  requestId: string,
  eventType: string,
): Promise<number> {
  const rows =
    query === "events"
      ? await database<{ readonly count: string }[]>`
          SELECT count(*)::text AS count FROM service_request_events
          WHERE request_id = ${requestId} AND event_type = ${eventType}
        `
      : await database<{ readonly count: string }[]>`
          SELECT count(*)::text AS count FROM outbox_events
          WHERE aggregate_id = ${requestId} AND event_type = ${eventType}
        `;
  return Number(rows[0]?.count ?? "0");
}

integrationDescribe.sequential("service request integration", () => {
  let database: DatabaseClient;
  let appConfig: AppConfig;
  let requests: RequestService;
  let attachments: RequestAttachmentService;
  let storage: LocalPrivateStorage;
  let storageRoot: string;
  let firstStudent: StudentFixture;
  let secondStudent: StudentFixture;
  let service: ServiceFixture;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "itqanak-requests-integration-"));
    database = createDatabase(integrationDatabaseUrl!);
    appConfig = config(integrationDatabaseUrl!, storageRoot);
    await runMigrations(database, { migrationsDirectory: appConfig.migrationsDirectory });
    await seedDevelopmentCatalog(database, "test");
    const services = await database<ServiceFixture[]>`
      SELECT id, slug FROM services
      WHERE slug = 'document-formatting-review' AND active = TRUE
      LIMIT 1
    `;
    if (services[0] === undefined) {
      throw new Error("Expected development request service was not seeded.");
    }
    service = services[0];
    firstStudent = await createStudent(database, "أول");
    secondStudent = await createStudent(database, "ثان");
    storage = new LocalPrivateStorage(storageRoot);
    requests = new RequestService({ database, config: appConfig });
    attachments = new RequestAttachmentService({ database, config: appConfig, storage });
  });

  afterAll(async () => {
    await closeDatabase(database);
    // Successful attachment tests remove their bytes. Remove only the known,
    // now-empty temporary directory; never recurse over an unresolved path.
    await rmdir(storageRoot).catch(() => undefined);
  });

  it("creates one request for concurrent idempotent submissions and preserves the original fingerprint", async () => {
    const submissionKey = generateSubmissionKey();
    const input = draftInput(service.id, submissionKey);
    const [first, second] = await Promise.all([
      requests.createDraft(firstStudent.principal, input),
      requests.createDraft(firstStudent.principal, input),
    ]);
    expect(first.request.id).toBe(second.request.id);
    expect([first.idempotentReplay, second.idempotentReplay].sort()).toEqual([false, true]);
    expect(await count(database, "events", first.request.id, "REQUEST_CREATED")).toBe(1);
    expect(await count(database, "outbox", first.request.id, "REQUEST_CREATED")).toBe(1);
    const jsonShapes = await database<
      { readonly payload_type: string; readonly metadata_type: string }[]
    >`
      SELECT
        jsonb_typeof(outbox.payload) AS payload_type,
        jsonb_typeof(audit.metadata) AS metadata_type
      FROM outbox_events AS outbox
      INNER JOIN security_audit_events AS audit
        ON audit.resource_id = outbox.aggregate_id
      WHERE outbox.aggregate_id = ${first.request.id}
        AND outbox.event_type = 'REQUEST_CREATED'
        AND audit.event_type = 'request.created'
      LIMIT 1
    `;
    expect(jsonShapes[0]).toEqual({ payload_type: "object", metadata_type: "object" });

    const updated = await requests.updateDraft(
      firstStudent.principal,
      first.request.requestNumber,
      { expectedVersion: first.request.version, title: "عنوان معدل بعد الإنشاء" },
    );
    expect(updated.version).toBe(first.request.version + 1);
    const cleared = await requests.updateDraft(
      firstStudent.principal,
      first.request.requestNumber,
      {
        expectedVersion: updated.version,
        deadlineAt: null,
        budgetAmount: null,
        budgetCurrency: null,
        languageCode: null,
        academicLevel: null,
        institutionName: null,
      },
    );
    const clearedDetail = await requests.getStudentRequest(
      firstStudent.principal,
      first.request.requestNumber,
    );
    expect(cleared.version).toBe(updated.version + 1);
    expect(clearedDetail).not.toHaveProperty("deadlineAt");
    expect(clearedDetail).not.toHaveProperty("budgetAmount");
    expect(clearedDetail).not.toHaveProperty("budgetCurrency");
    expect(clearedDetail).not.toHaveProperty("languageCode");
    expect(clearedDetail).not.toHaveProperty("academicLevel");
    expect(clearedDetail).not.toHaveProperty("institutionName");
    await expect(requests.createDraft(firstStudent.principal, input)).resolves.toMatchObject({
      request: { id: first.request.id },
      idempotentReplay: true,
    });
    await expect(
      requests.createDraft(firstStudent.principal, { ...input, title: "حمولة أخرى للمفتاح نفسه" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("hides every owned-resource operation from a second student", async () => {
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    await expect(
      requests.getStudentRequest(secondStudent.principal, created.request.requestNumber),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });
    await expect(
      requests.getStudentRequest(secondStudent.principal, created.request.id),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });
    await expect(
      requests.updateDraft(secondStudent.principal, created.request.requestNumber, {
        expectedVersion: created.request.version,
        title: "محاولة غير مصرح بها",
      }),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });
    await expect(
      requests.cancel(secondStudent.principal, created.request.requestNumber, {
        expectedVersion: created.request.version,
      }),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });
    const secondList = await requests.listStudentRequests(secondStudent.principal, {
      search: created.request.requestNumber,
    });
    expect(secondList.items).toHaveLength(0);
  });

  it("serializes update, submit, cancel, and request-number races", async () => {
    const updateDraft = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const updateResults = await Promise.allSettled([
      requests.updateDraft(firstStudent.principal, updateDraft.request.requestNumber, {
        expectedVersion: updateDraft.request.version,
        title: "التعديل المتزامن الأول",
      }),
      requests.updateDraft(firstStudent.principal, updateDraft.request.requestNumber, {
        expectedVersion: updateDraft.request.version,
        title: "التعديل المتزامن الثاني",
      }),
    ]);
    expect(updateResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(updateResults.filter((result) => result.status === "rejected")).toHaveLength(1);

    const submitDraft = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const submitResults = await Promise.allSettled([
      requests.submit(firstStudent.principal, submitDraft.request.requestNumber, {
        expectedVersion: submitDraft.request.version,
        acceptedAcademicIntegrity: true,
        academicIntegrityVersion: appConfig.academicIntegrityVersion,
      }),
      requests.submit(firstStudent.principal, submitDraft.request.requestNumber, {
        expectedVersion: submitDraft.request.version,
        acceptedAcademicIntegrity: true,
        academicIntegrityVersion: appConfig.academicIntegrityVersion,
      }),
    ]);
    expect(submitResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await count(database, "events", submitDraft.request.id, "REQUEST_SUBMITTED")).toBe(1);
    expect(await count(database, "outbox", submitDraft.request.id, "REQUEST_SUBMITTED")).toBe(1);

    const competingDraft = await requests.createDraft(
      firstStudent.principal,
      draftInput(service.id),
    );
    const competition = await Promise.allSettled([
      requests.submit(firstStudent.principal, competingDraft.request.requestNumber, {
        expectedVersion: competingDraft.request.version,
        acceptedAcademicIntegrity: true,
        academicIntegrityVersion: appConfig.academicIntegrityVersion,
      }),
      requests.cancel(firstStudent.principal, competingDraft.request.requestNumber, {
        expectedVersion: competingDraft.request.version,
      }),
    ]);
    expect(competition.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const final = await requests.getStudentRequest(
      firstStudent.principal,
      competingDraft.request.requestNumber,
    );
    expect(["SUBMITTED", "CANCELLED"]).toContain(final.status);

    const numbered = await Promise.all(
      Array.from({ length: 30 }, () =>
        requests.createDraft(firstStudent.principal, draftInput(service.id)),
      ),
    );
    expect(new Set(numbered.map((item) => item.request.requestNumber)).size).toBe(30);
    expect(
      numbered.every((item) => /^ITQ-[0-9]{4}-[0-9]{6,}$/u.test(item.request.requestNumber)),
    ).toBe(true);
  });

  it("rejects inactive catalog services and exposes bounded database-side lists", async () => {
    await database`UPDATE services SET active = FALSE WHERE id = ${service.id}`;
    await expect(
      requests.createDraft(firstStudent.principal, draftInput(service.id)),
    ).rejects.toMatchObject({ code: "SERVICE_INACTIVE" });
    await database`UPDATE services SET active = TRUE WHERE id = ${service.id}`;
    const list = await requests.listStudentRequests(firstStudent.principal, {
      page: 1,
      pageSize: 5,
      status: "DRAFT",
      serviceId: service.id,
      sort: "newest",
    });
    expect(list.pageSize).toBe(5);
    expect(list.items.every((item) => item.status === "DRAFT")).toBe(true);
    expect(list.items.every((item) => item.serviceId === service.id)).toBe(true);
    const dashboard = await requests.getStudentDashboard(firstStudent.principal);
    expect(dashboard.recent.length).toBeLessThanOrEqual(5);
  });

  it("streams a private attachment, marks disabled scanning honestly, authorizes download, and soft-deletes", async () => {
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const bytes = Buffer.from("مرفق تعليمي للاختبار", "utf8");
    const attachment = await attachments.addAttachment(
      firstStudent.principal,
      created.request.requestNumber,
      {
        expectedVersion: created.request.version,
        filename: "ملاحظات.txt",
        declaredMimeType: "text/plain",
        contentLength: bytes.length,
        header: bytes,
        body: Readable.from([bytes]),
      },
    );
    expect(attachment.scanStatus).toBe("SCAN_SKIPPED_DEVELOPMENT");
    expect(attachment.storageStatus).toBe("STORED");

    await expect(
      attachments.authorizeDownload(
        secondStudent.principal,
        created.request.requestNumber,
        attachment.id,
      ),
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" });
    const download = await attachments.authorizeDownload(
      firstStudent.principal,
      created.request.requestNumber,
      attachment.id,
    );
    const downloaded: Buffer[] = [];
    for await (const chunk of download.body) {
      downloaded.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(downloaded)).toEqual(bytes);
    expect(download.scanStatus).toBe("SCAN_SKIPPED_DEVELOPMENT");

    const detail = await requests.getStudentRequest(
      firstStudent.principal,
      created.request.requestNumber,
    );
    await attachments.deleteAttachment(
      firstStudent.principal,
      created.request.requestNumber,
      attachment.id,
      detail.version,
    );
    const deletedRows = await database<
      {
        readonly deleted_at: Date | null;
        readonly storage_status: string;
        readonly storage_key: string;
      }[]
    >`
      SELECT deleted_at, storage_status, storage_key
      FROM service_request_attachments WHERE id = ${attachment.id}
    `;
    expect(deletedRows[0]).toMatchObject({ storage_status: "DELETED" });
    expect(deletedRows[0]?.deleted_at).not.toBeNull();
    if (deletedRows[0] !== undefined) {
      const keyParts = deletedRows[0].storage_key.split("/");
      await rmdir(join(storageRoot, ...keyParts.slice(0, 3))).catch(() => undefined);
      await rmdir(join(storageRoot, ...keyParts.slice(0, 2))).catch(() => undefined);
      await rmdir(join(storageRoot, keyParts[0] ?? "requests")).catch(() => undefined);
    }
  });

  it("records production uploads as administrator-skipped without queueing them", async () => {
    const productionConfig: AppConfig = {
      ...appConfig,
      nodeEnv: "production",
      fileScanning: { ...appConfig.fileScanning, mode: "clamav" },
    };
    const productionAttachments = new RequestAttachmentService({
      database,
      config: productionConfig,
      storage,
    });
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const documentBytes = Buffer.from("private unscanned document", "utf8");
    const document = await productionAttachments.addAttachment(
      firstStudent.principal,
      created.request.requestNumber,
      {
        expectedVersion: created.request.version,
        filename: "notes.txt",
        declaredMimeType: "text/plain",
        contentLength: documentBytes.length,
        header: documentBytes,
        body: Readable.from([documentBytes]),
      },
    );
    expect(document).toMatchObject({
      storageStatus: "STORED",
      scanStatus: "SCAN_SKIPPED_BY_ADMIN",
    });
    const scanJobs = await database<{ readonly count: string }[]>`
      SELECT count(*)::text AS count FROM outbox_events
      WHERE aggregate_id = ${document.id} AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
    `;
    expect(scanJobs[0]?.count).toBe("0");
    await expect(
      productionAttachments.authorizeDownload(
        firstStudent.principal,
        created.request.requestNumber,
        document.id,
        {},
        { requireClean: true },
      ),
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" });
    const documentDownload = await productionAttachments.authorizeDownload(
      firstStudent.principal,
      created.request.requestNumber,
      document.id,
    );
    const downloadedDocument: Buffer[] = [];
    for await (const chunk of documentDownload.body) {
      downloadedDocument.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(downloadedDocument)).toEqual(documentBytes);

    const afterDocument = await requests.getStudentRequest(
      firstStudent.principal,
      created.request.requestNumber,
    );
    const voiceBytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    const voice = await productionAttachments.addAttachment(
      firstStudent.principal,
      created.request.requestNumber,
      {
        expectedVersion: afterDocument.version,
        filename: "voice.wav",
        declaredMimeType: "audio/wav",
        contentLength: voiceBytes.length,
        header: voiceBytes,
        body: Readable.from([voiceBytes]),
      },
    );
    const voicePreview = await productionAttachments.authorizeDownload(
      firstStudent.principal,
      created.request.requestNumber,
      voice.id,
      {},
      { requireClean: true, allowUnscannedAudioPreview: true },
    );
    expect(voicePreview).toMatchObject({
      mimeType: "audio/wav",
      scanStatus: "SCAN_SKIPPED_BY_ADMIN",
    });
    for await (const _chunk of voicePreview.body) {
      // Consume the authenticated private stream before cleanup.
    }

    for (const attachmentId of [document.id, voice.id]) {
      const detail = await requests.getStudentRequest(
        firstStudent.principal,
        created.request.requestNumber,
      );
      await productionAttachments.deleteAttachment(
        firstStudent.principal,
        created.request.requestNumber,
        attachmentId,
        detail.version,
      );
      await rmdir(join(storageRoot, "requests", created.request.id, attachmentId)).catch(
        () => undefined,
      );
    }
    await rmdir(join(storageRoot, "requests", created.request.id)).catch(() => undefined);
    await rmdir(join(storageRoot, "requests")).catch(() => undefined);
  });

  it("rejects MIME mismatch, executables, oversized files, and stale upload versions before persistence", async () => {
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    await expect(
      attachments.assertUploadAdmission(
        firstStudent.principal,
        created.request.requestNumber,
        created.request.version + 1,
        1,
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      attachments.assertUploadAdmission(
        secondStudent.principal,
        created.request.requestNumber,
        created.request.version,
        1,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });
    await expect(
      attachments.assertUploadAdmission(
        firstStudent.principal,
        created.request.requestNumber,
        created.request.version,
        appConfig.storage.maxFileBytes + 1,
      ),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await expect(
      attachments.assertUploadAdmission(
        firstStudent.principal,
        created.request.requestNumber,
        created.request.version,
        1,
      ),
    ).resolves.toBeUndefined();
    const pdfBytes = Buffer.from("not-a-pdf", "utf8");
    await expect(
      attachments.addAttachment(firstStudent.principal, created.request.requestNumber, {
        expectedVersion: created.request.version,
        filename: "spoof.pdf",
        declaredMimeType: "application/pdf",
        contentLength: pdfBytes.length,
        header: pdfBytes,
        body: Readable.from([pdfBytes]),
      }),
    ).rejects.toMatchObject({ code: "FILE_MIME_MISMATCH" });
    await expect(
      attachments.addAttachment(firstStudent.principal, created.request.requestNumber, {
        expectedVersion: created.request.version,
        filename: "payload.exe",
        declaredMimeType: "application/octet-stream",
        contentLength: 4,
        header: Buffer.from([0x4d, 0x5a, 0x90, 0]),
        body: Readable.from([Buffer.from([0x4d, 0x5a, 0x90, 0])]),
      }),
    ).rejects.toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    await expect(
      attachments.addAttachment(firstStudent.principal, created.request.requestNumber, {
        expectedVersion: created.request.version,
        filename: "large.txt",
        declaredMimeType: "text/plain",
        contentLength: appConfig.storage.maxFileBytes + 1,
        header: Buffer.from("text"),
        body: Readable.from([]),
      }),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    const rows = await database<{ readonly count: string }[]>`
      SELECT count(*)::text AS count FROM service_request_attachments
      WHERE request_id = ${created.request.id}
    `;
    expect(rows[0]?.count).toBe("0");
  });

  it("serializes attachment reservation against submit and compensates a concurrent cancellation", async () => {
    const submitDraft = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const submitBytes = Buffer.from("upload blocks submit until finalized", "utf8");
    const submitGate = gatedStorage();
    const submitAttachments = new RequestAttachmentService({
      database,
      config: appConfig,
      storage: submitGate.storage,
    });
    const pendingUpload = submitAttachments.addAttachment(
      firstStudent.principal,
      submitDraft.request.requestNumber,
      {
        expectedVersion: submitDraft.request.version,
        filename: "pending.txt",
        declaredMimeType: "text/plain",
        contentLength: submitBytes.length,
        header: submitBytes,
        body: Readable.from([submitBytes]),
      },
    );
    await submitGate.started;
    await expect(
      requests.submit(firstStudent.principal, submitDraft.request.requestNumber, {
        expectedVersion: submitDraft.request.version,
        acceptedAcademicIntegrity: true,
        academicIntegrityVersion: appConfig.academicIntegrityVersion,
      }),
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" });
    submitGate.release();
    await expect(pendingUpload).resolves.toMatchObject({ storageStatus: "STORED" });
    expect(submitGate.removed).toEqual([]);

    const cancelDraft = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const cancelBytes = Buffer.from("cancel wins while object put is in flight", "utf8");
    const cancelGate = gatedStorage();
    const cancelAttachments = new RequestAttachmentService({
      database,
      config: appConfig,
      storage: cancelGate.storage,
    });
    const losingUpload = cancelAttachments.addAttachment(
      firstStudent.principal,
      cancelDraft.request.requestNumber,
      {
        expectedVersion: cancelDraft.request.version,
        filename: "cancelled.txt",
        declaredMimeType: "text/plain",
        contentLength: cancelBytes.length,
        header: cancelBytes,
        body: Readable.from([cancelBytes]),
      },
    );
    await cancelGate.started;
    await expect(
      requests.cancel(firstStudent.principal, cancelDraft.request.requestNumber, {
        expectedVersion: cancelDraft.request.version,
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    cancelGate.release();
    await expect(losingUpload).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const cancelledRows = await database<
      { readonly storage_status: string; readonly request_status: string }[]
    >`
      SELECT attachments.storage_status, requests.status AS request_status
      FROM service_request_attachments AS attachments
      INNER JOIN service_requests AS requests ON requests.id = attachments.request_id
      WHERE attachments.request_id = ${cancelDraft.request.id}
    `;
    expect(cancelledRows).toEqual([
      { storage_status: "UPLOAD_FAILED", request_status: "CANCELLED" },
    ]);
    expect(cancelGate.removed).toHaveLength(0);
  });

  it("refuses deletion while an object upload is still in flight", async () => {
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const bytes = Buffer.from("pending upload cannot be deleted concurrently", "utf8");
    const gate = gatedStorage();
    const gatedAttachments = new RequestAttachmentService({
      database,
      config: appConfig,
      storage: gate.storage,
    });
    const upload = gatedAttachments.addAttachment(
      firstStudent.principal,
      created.request.requestNumber,
      {
        expectedVersion: created.request.version,
        filename: "pending-delete.txt",
        declaredMimeType: "text/plain",
        contentLength: bytes.length,
        header: bytes,
        body: Readable.from([bytes]),
      },
    );
    await gate.started;

    const pendingRows = await database<{ readonly id: string }[]>`
      SELECT id FROM service_request_attachments
      WHERE request_id = ${created.request.id} AND storage_status = 'PENDING_UPLOAD'
    `;
    expect(pendingRows).toHaveLength(1);
    await expect(
      gatedAttachments.deleteAttachment(
        firstStudent.principal,
        created.request.requestNumber,
        pendingRows[0]?.id ?? "",
        created.request.version,
      ),
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_READY" });
    expect(gate.removed).toEqual([]);

    gate.release();
    await expect(upload).resolves.toMatchObject({ storageStatus: "STORED" });
    const finalizedRows = await database<
      { readonly deleted_at: Date | null; readonly storage_status: string }[]
    >`
      SELECT deleted_at, storage_status FROM service_request_attachments
      WHERE id = ${pendingRows[0]?.id ?? ""}
    `;
    expect(finalizedRows).toEqual([{ deleted_at: null, storage_status: "STORED" }]);
    expect(gate.removed).toEqual([]);
  });

  it("age-fences storage deletion after an ambiguous failed upload", async () => {
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const attachmentId = randomUUID();
    const storageKey = `requests/${created.request.id}/${attachmentId}/${"a".repeat(32)}`;
    await database`
      INSERT INTO service_request_attachments (
        id, request_id, uploaded_by_user_id, storage_provider, storage_key,
        original_filename, normalized_extension, declared_mime_type, size_bytes,
        storage_status, scan_status
      ) VALUES (
        ${attachmentId}, ${created.request.id}, ${firstStudent.principal.userId}, 'local',
        ${storageKey}, 'ambiguous-failure.txt', '.txt', 'text/plain', 4,
        'UPLOAD_FAILED', 'NOT_REQUIRED'
      )
    `;
    const removed: string[] = [];
    const failedStorage: ObjectStorage = {
      provider: "local",
      exists: async () => true,
      open: async () => Readable.from([]),
      signDownload: async () => "https://invalid.test/private",
      remove: async (key) => {
        removed.push(key);
      },
      put: async () => {
        throw new Error("not used");
      },
    };
    const failedAttachments = new RequestAttachmentService({
      database,
      config: appConfig,
      storage: failedStorage,
    });

    await expect(
      failedAttachments.deleteAttachment(
        firstStudent.principal,
        created.request.requestNumber,
        attachmentId,
        created.request.version,
      ),
    ).resolves.toBeUndefined();
    const rows = await database<
      { readonly deleted_at: Date | null; readonly storage_status: string }[]
    >`
      SELECT deleted_at, storage_status FROM service_request_attachments
      WHERE id = ${attachmentId}
    `;
    expect(rows[0]?.storage_status).toBe("DELETE_PENDING");
    expect(rows[0]?.deleted_at).not.toBeNull();
    expect(removed).toEqual([]);
  });

  it("preserves stored bytes when the final attachment commit response is ambiguous", async () => {
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    const bytes = Buffer.from("commit ambiguity must not delete stored bytes", "utf8");
    const objects = new Set<string>();
    const removed: string[] = [];
    const ambiguousStorage: ObjectStorage = {
      provider: "local",
      exists: async (key) => objects.has(key),
      open: async () => Readable.from([]),
      signDownload: async () => "https://invalid.test/private",
      remove: async (key) => {
        removed.push(key);
        objects.delete(key);
      },
      put: async (key, body, metadata) => {
        let received = 0;
        for await (const chunk of body) {
          received += Buffer.isBuffer(chunk) ? chunk.length : Buffer.from(chunk).length;
        }
        if (received !== metadata.contentLength) {
          throw new Error("Ambiguous-commit storage received an unexpected byte count.");
        }
        objects.add(key);
        return { key, checksumSha256: "f".repeat(64), contentLength: received };
      },
    };
    const ambiguousAttachments = new RequestAttachmentService({
      database: withAmbiguousSecondCommit(database),
      config: appConfig,
      storage: ambiguousStorage,
    });

    await expect(
      ambiguousAttachments.addAttachment(firstStudent.principal, created.request.requestNumber, {
        expectedVersion: created.request.version,
        filename: "ambiguous.txt",
        declaredMimeType: "text/plain",
        contentLength: bytes.length,
        header: bytes,
        body: Readable.from([bytes]),
      }),
    ).rejects.toThrow("simulated PostgreSQL commit response loss");

    const rows = await database<
      { readonly storage_key: string; readonly storage_status: string; readonly sha256: string }[]
    >`
      SELECT storage_key, storage_status, sha256
      FROM service_request_attachments
      WHERE request_id = ${created.request.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ storage_status: "STORED", sha256: "f".repeat(64) });
    expect(removed).toEqual([]);
    expect(objects.has(rows[0]?.storage_key ?? "")).toBe(true);
  });

  it("requires current integrity policy and rejects forbidden cancellation", async () => {
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    await expect(
      requests.submit(firstStudent.principal, created.request.requestNumber, {
        expectedVersion: created.request.version,
        acceptedAcademicIntegrity: true,
        academicIntegrityVersion: "old-version",
      }),
    ).rejects.toMatchObject({ code: "ACADEMIC_INTEGRITY_VERSION_MISMATCH" });
    const submitted = await requests.submit(firstStudent.principal, created.request.requestNumber, {
      expectedVersion: created.request.version,
      acceptedAcademicIntegrity: true,
      academicIntegrityVersion: appConfig.academicIntegrityVersion,
    });
    await database`
      UPDATE service_requests SET status = 'UNDER_REVIEW', version = version + 1
      WHERE id = ${submitted.id}
    `;
    const reviewed = await requests.getStudentRequest(
      firstStudent.principal,
      submitted.requestNumber,
    );
    await expect(
      requests.cancel(firstStudent.principal, reviewed.requestNumber, {
        expectedVersion: reviewed.version,
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("denies a principal missing explicit own-request permissions", async () => {
    const noRequestPermissions: AuthenticatedPrincipal = {
      ...firstStudent.principal,
      permissions: ["account.profile.read"],
    };
    await expect(
      requests.createDraft(noRequestPermissions, draftInput(service.id)),
    ).rejects.toThrow();
    expect(
      await database<{ readonly count: string }[]>`
        SELECT count(*)::text AS count FROM role_permissions
        WHERE role_code = 'ADMIN' AND permission_code LIKE 'requests.%.own'
      `,
    ).toEqual([{ count: "0" }]);
  });

  it("keeps event history immutable for update, delete, and truncate", async () => {
    const created = await requests.createDraft(firstStudent.principal, draftInput(service.id));
    await expect(
      database`UPDATE service_request_events SET event_type = 'MUTATED' WHERE request_id = ${created.request.id}`,
    ).rejects.toThrow();
    await expect(
      database`DELETE FROM service_request_events WHERE request_id = ${created.request.id}`,
    ).rejects.toThrow();
    await expect(database`TRUNCATE service_request_events`).rejects.toThrow();
  });
});
