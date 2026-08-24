import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import type { MalwareScanner, ObjectStorage } from "@itqanak/storage";

import { removeReferencedObjectIfPresent } from "./reconciliation.js";
import { dependencyRetryDelayMs, retryDelayMs, scanJobLeaseMs } from "./scan-processor.js";

interface ClaimedJob {
  readonly id: string;
  readonly aggregate_id: string | null;
  readonly attempt_count: number | string;
}

interface UnifiedAttachmentRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly request_id: string | null;
  readonly storage_key: string | null;
  readonly storage_status: string;
  readonly scan_status: string;
  readonly scan_attempt_count: number | string;
  readonly deleted_at: Date | string | null;
}

type ScanStart =
  | { readonly kind: "CLAIMED"; readonly attachment: UnifiedAttachmentRow }
  | { readonly kind: "NOT_SCANNABLE" }
  | { readonly kind: "STALE" };

interface SavepointDatabase {
  savepoint<T>(callback: (transaction: DatabaseClient) => Promise<T>): Promise<T>;
}

export interface UnifiedAttachmentScanProcessorOptions {
  readonly database: DatabaseClient;
  readonly storage: ObjectStorage;
  readonly scanner: MalwareScanner;
  readonly logger: Logger;
  readonly workerId: string;
  readonly maxAttempts: number;
  readonly scanTimeoutMs: number;
  readonly random?: () => number;
}

const eventType = "UNIFIED_ATTACHMENT_SCAN_REQUESTED";

function integer(value: number | string, field: string, minimum: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`Unified attachment scan contains an invalid ${field}.`);
  }
  return parsed;
}

async function inTransaction<T>(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<T>,
): Promise<T> {
  const transaction = database as DatabaseClient & Partial<SavepointDatabase>;
  if (typeof transaction.savepoint === "function") {
    return (await transaction.savepoint(callback)) as T;
  }
  return (await database.begin((tx) => callback(tx as DatabaseClient))) as T;
}

/** Scans only newly queued unified-conversation attachments. Skipped rows have no event. */
export class UnifiedAttachmentScanProcessor {
  private readonly database: DatabaseClient;
  private readonly storage: ObjectStorage;
  private readonly scanner: MalwareScanner;
  private readonly logger: Logger;
  private readonly workerId: string;
  private readonly maxAttempts: number;
  private readonly leaseMs: number;
  private readonly random: () => number;

  public constructor(options: UnifiedAttachmentScanProcessorOptions) {
    this.database = options.database;
    this.storage = options.storage;
    this.scanner = options.scanner;
    this.logger = options.logger;
    this.workerId = options.workerId;
    this.maxAttempts = options.maxAttempts;
    this.leaseMs = scanJobLeaseMs(options.scanTimeoutMs);
    this.random = options.random ?? Math.random;
  }

  public async processBatch(limit = 5): Promise<number> {
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 20));
    let processed = 0;
    while (processed < boundedLimit && (await this.scannerReady())) {
      const job = (await this.claim())[0];
      if (job === undefined) break;
      await this.process(job);
      processed += 1;
    }
    return processed;
  }

  private async scannerReady(): Promise<boolean> {
    if (this.scanner.mode === "disabled") return true;
    try {
      if ((await this.scanner.checkReadiness()) === "healthy") return true;
    } catch {
      // The bounded retry loop below must not claim work during an outage.
    }
    this.logger.warn("unified_attachment_scanner_unavailable", { workerId: this.workerId });
    return false;
  }

  private async claim(): Promise<readonly ClaimedJob[]> {
    return inTransaction(this.database, async (tx) => {
      const candidates = await tx<ClaimedJob[]>`
        SELECT id, aggregate_id, attempt_count
        FROM outbox_events
        WHERE event_type = ${eventType}
          AND available_at <= now()
          AND status IN ('PENDING', 'RETRY', 'PROCESSING')
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const candidate = candidates[0];
      if (candidate === undefined) return [];
      return tx<ClaimedJob[]>`
        UPDATE outbox_events
        SET status = 'PROCESSING', attempt_count = attempt_count + 1,
            available_at = now() + (${this.leaseMs} * interval '1 millisecond'),
            last_error_code = NULL
        WHERE id = ${candidate.id} AND event_type = ${eventType}
          AND attempt_count = ${candidate.attempt_count} AND available_at <= now()
          AND status IN ('PENDING', 'RETRY', 'PROCESSING')
        RETURNING id, aggregate_id, attempt_count
      `;
    });
  }

  private async process(job: ClaimedJob): Promise<void> {
    const attachmentId = job.aggregate_id;
    const attempt = integer(job.attempt_count, "attempt", 1);
    if (attachmentId === null) {
      await this.deadLetter(job.id, attempt, "INVALID_SCAN_JOB");
      return;
    }
    const started = await this.start(job.id, attachmentId, attempt);
    if (started.kind === "STALE") return;
    if (started.kind === "NOT_SCANNABLE") {
      await this.deadLetter(job.id, attempt, "ATTACHMENT_NOT_SCANNABLE");
      return;
    }
    const attachment = started.attachment;
    const storageKey = attachment.storage_key;
    if (storageKey === null) {
      await this.deadLetter(job.id, attempt, "ATTACHMENT_NOT_SCANNABLE");
      return;
    }
    this.logger.info("unified_attachment_scan_started", {
      attachmentId,
      conversationId: attachment.conversation_id,
      attempt,
      workerId: this.workerId,
    });

    let body: Awaited<ReturnType<ObjectStorage["open"]>>;
    try {
      if (!(await this.storage.exists(storageKey))) {
        await this.retryOrFail(job.id, attachment, attempt, "STORAGE_OBJECT_MISSING");
        return;
      }
      body = await this.storage.open(storageKey, { purpose: "background-scan" });
    } catch {
      await this.deferStorage(job.id, attachment, attempt);
      return;
    }

    let result: Awaited<ReturnType<MalwareScanner["scan"]>>;
    try {
      result = await this.scanner.scan(body);
    } catch {
      result = { status: "ERROR" };
    }
    if (result.status === "ERROR") {
      if (result.errorSource === "INPUT_STREAM") {
        await this.deferStorage(job.id, attachment, attempt);
      } else {
        await this.retryOrFail(job.id, attachment, attempt, "SCANNER_UNAVAILABLE");
      }
      return;
    }

    const databaseStatus =
      result.status === "SKIPPED_DEVELOPMENT" ? "SCAN_SKIPPED_DEVELOPMENT" : result.status;
    const completed = await this.finish(job.id, attachment, attempt, databaseStatus);
    if (result.status === "INFECTED" && completed) {
      try {
        await removeReferencedObjectIfPresent(this.storage, storageKey);
        await this.database`
          UPDATE unified_conversation_attachments
          SET storage_status = 'DELETED', updated_at = now()
          WHERE id = ${attachment.id} AND storage_key = ${storageKey}
            AND storage_status = 'DELETE_PENDING' AND scan_status = 'INFECTED'
            AND scan_attempt_count = ${attempt}
        `;
      } catch {
        this.logger.warn("unified_attachment_delete_failed", { attachmentId });
      }
    }
  }

  private async start(jobId: string, attachmentId: string, attempt: number): Promise<ScanStart> {
    return inTransaction(this.database, async (tx) => {
      const jobs = await tx<{ readonly id: string }[]>`
        SELECT id FROM outbox_events
        WHERE id = ${jobId} AND event_type = ${eventType}
          AND aggregate_id = ${attachmentId} AND status = 'PROCESSING'
          AND attempt_count = ${attempt}
        FOR UPDATE
      `;
      if (jobs[0] === undefined) return { kind: "STALE" };
      const attachments = await tx<UnifiedAttachmentRow[]>`
        SELECT id, conversation_id, request_id, storage_key, storage_status, scan_status,
               scan_attempt_count, deleted_at
        FROM unified_conversation_attachments
        WHERE id = ${attachmentId}
        FOR UPDATE
      `;
      const attachment = attachments[0];
      if (
        attachment === undefined ||
        attachment.deleted_at !== null ||
        attachment.storage_status !== "STORED" ||
        attachment.storage_key === null ||
        (attachment.scan_status !== "PENDING_SCAN" && attachment.scan_status !== "SCAN_ERROR")
      ) {
        return { kind: "NOT_SCANNABLE" };
      }
      const previousAttempt = integer(attachment.scan_attempt_count, "attachment attempt", 0);
      if (previousAttempt >= attempt) return { kind: "STALE" };
      const claimed = await tx<UnifiedAttachmentRow[]>`
        UPDATE unified_conversation_attachments
        SET scan_started_at = now(), scan_attempt_count = ${attempt}, updated_at = now()
        WHERE id = ${attachmentId} AND scan_attempt_count = ${previousAttempt}
          AND deleted_at IS NULL AND storage_status = 'STORED'
          AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
        RETURNING id, conversation_id, request_id, storage_key, storage_status, scan_status,
                  scan_attempt_count, deleted_at
      `;
      return claimed[0] === undefined
        ? { kind: "STALE" }
        : { kind: "CLAIMED", attachment: claimed[0] };
    });
  }

  private async retryOrFail(
    jobId: string,
    attachment: UnifiedAttachmentRow,
    attempt: number,
    failureCode: "SCANNER_UNAVAILABLE" | "STORAGE_OBJECT_MISSING",
  ): Promise<void> {
    if (attempt >= this.maxAttempts) {
      await this.finish(jobId, attachment, attempt, "SCAN_ERROR", failureCode);
      return;
    }
    const delayMs = retryDelayMs(attempt, this.random);
    await inTransaction(this.database, async (tx) => {
      const attachments = await tx<{ readonly id: string }[]>`
        UPDATE unified_conversation_attachments
        SET scan_status = 'PENDING_SCAN', scan_completed_at = NULL,
            scan_next_attempt_at = now() + (${delayMs} * interval '1 millisecond'),
            scan_last_error_code = ${failureCode}, updated_at = now()
        WHERE id = ${attachment.id} AND scan_attempt_count = ${attempt}
          AND deleted_at IS NULL AND storage_status = 'STORED'
          AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
        RETURNING id
      `;
      if (attachments[0] === undefined) return;
      await tx`
        UPDATE outbox_events
        SET status = 'RETRY', available_at = now() + (${delayMs} * interval '1 millisecond'),
            last_error_code = ${failureCode}
        WHERE id = ${jobId} AND event_type = ${eventType}
          AND aggregate_id = ${attachment.id} AND status = 'PROCESSING'
          AND attempt_count = ${attempt}
      `;
    });
  }

  private async deferStorage(
    jobId: string,
    attachment: UnifiedAttachmentRow,
    attempt: number,
  ): Promise<void> {
    const delayMs = dependencyRetryDelayMs(this.random);
    const previousAttempt = attempt - 1;
    await inTransaction(this.database, async (tx) => {
      const attachments = await tx<{ readonly id: string }[]>`
        UPDATE unified_conversation_attachments
        SET scan_status = 'PENDING_SCAN', scan_attempt_count = ${previousAttempt},
            scan_started_at = NULL, scan_completed_at = NULL,
            scan_next_attempt_at = now() + (${delayMs} * interval '1 millisecond'),
            scan_last_error_code = 'STORAGE_UNAVAILABLE', updated_at = now()
        WHERE id = ${attachment.id} AND scan_attempt_count = ${attempt}
          AND deleted_at IS NULL AND storage_status = 'STORED'
          AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
        RETURNING id
      `;
      if (attachments[0] === undefined) return;
      await tx`
        UPDATE outbox_events
        SET status = 'RETRY', attempt_count = ${previousAttempt},
            available_at = now() + (${delayMs} * interval '1 millisecond'),
            processed_at = NULL, last_error_code = 'STORAGE_UNAVAILABLE'
        WHERE id = ${jobId} AND event_type = ${eventType}
          AND aggregate_id = ${attachment.id} AND status = 'PROCESSING'
          AND attempt_count = ${attempt}
      `;
    });
  }

  private async finish(
    jobId: string,
    attachment: UnifiedAttachmentRow,
    attempt: number,
    status: "CLEAN" | "INFECTED" | "SCAN_ERROR" | "SCAN_SKIPPED_DEVELOPMENT",
    failureCode?: "SCANNER_UNAVAILABLE" | "STORAGE_OBJECT_MISSING",
  ): Promise<boolean> {
    return inTransaction(this.database, async (tx) => {
      const jobs = await tx<{ readonly id: string }[]>`
        SELECT id FROM outbox_events
        WHERE id = ${jobId} AND event_type = ${eventType}
          AND aggregate_id = ${attachment.id} AND status = 'PROCESSING'
          AND attempt_count = ${attempt}
        FOR UPDATE
      `;
      if (jobs[0] === undefined) return false;
      const rows = await tx<{ readonly id: string }[]>`
        UPDATE unified_conversation_attachments
        SET scan_status = ${status}, scan_completed_at = now(), scan_next_attempt_at = NULL,
            scan_last_error_code = ${status === "SCAN_ERROR" ? (failureCode ?? "SCANNER_UNAVAILABLE") : null},
            storage_status = ${status === "INFECTED" ? "DELETE_PENDING" : "STORED"},
            updated_at = now()
        WHERE id = ${attachment.id} AND scan_attempt_count = ${attempt}
          AND deleted_at IS NULL AND storage_status = 'STORED'
          AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
        RETURNING id
      `;
      if (rows[0] === undefined) {
        await tx`
          UPDATE outbox_events
          SET status = 'DEAD_LETTER', processed_at = now(), available_at = now(),
              last_error_code = 'ATTACHMENT_NOT_SCANNABLE'
          WHERE id = ${jobId} AND status = 'PROCESSING' AND attempt_count = ${attempt}
        `;
        return false;
      }
      await tx`
        UPDATE outbox_events
        SET status = ${status === "SCAN_ERROR" ? "DEAD_LETTER" : "DELIVERED"},
            processed_at = now(), available_at = now(),
            last_error_code = ${status === "SCAN_ERROR" ? (failureCode ?? "SCANNER_UNAVAILABLE") : null}
        WHERE id = ${jobId} AND event_type = ${eventType}
          AND aggregate_id = ${attachment.id} AND status = 'PROCESSING'
          AND attempt_count = ${attempt}
      `;
      this.logger.info("unified_attachment_scan_completed", {
        attachmentId: attachment.id,
        conversationId: attachment.conversation_id,
        scanStatus: status,
      });
      return true;
    });
  }

  private async deadLetter(jobId: string, attempt: number, code: string): Promise<void> {
    await this.database`
      UPDATE outbox_events
      SET status = 'DEAD_LETTER', processed_at = now(), available_at = now(),
          last_error_code = ${code}
      WHERE id = ${jobId} AND event_type = ${eventType}
        AND status = 'PROCESSING' AND attempt_count = ${attempt}
    `;
  }
}
