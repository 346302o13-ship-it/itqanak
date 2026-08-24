import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import {
  maximumS3ReadOperationTimeoutMs,
  type MalwareScanner,
  type ObjectStorage,
} from "@itqanak/storage";

import { removeReferencedObjectIfPresent } from "./reconciliation.js";

interface ClaimedScanJob {
  readonly id: string;
  readonly aggregate_id: string | null;
  readonly attempt_count: number | string;
}

interface ScanAttachmentRow {
  readonly id: string;
  readonly request_id: string;
  readonly storage_key: string | null;
  readonly storage_status: string;
  readonly scan_status: string;
  readonly scan_attempt_count: number | string;
  readonly deleted_at: Date | string | null;
}

type ScanStartResult =
  | { readonly kind: "CLAIMED"; readonly attachment: ScanAttachmentRow }
  | { readonly kind: "NOT_SCANNABLE" }
  | { readonly kind: "STALE" };

interface SavepointCapableDatabase {
  savepoint<T>(callback: (transaction: DatabaseClient) => Promise<T>): Promise<T>;
}

export interface AttachmentScanProcessorOptions {
  readonly database: DatabaseClient;
  readonly storage: ObjectStorage;
  readonly scanner: MalwareScanner;
  readonly logger: Logger;
  readonly workerId: string;
  readonly maxAttempts: number;
  readonly scanTimeoutMs: number;
  readonly random?: () => number;
}

function positiveInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Scan job contains an invalid ${field}.`);
  }
  return parsed;
}

function nonNegativeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Scan job contains an invalid ${field}.`);
  }
  return parsed;
}

function retryDelayMs(attempt: number, random: () => number): number {
  const exponential = Math.min(1_000 * 2 ** Math.max(0, Math.min(attempt - 1, 8)), 60_000);
  return exponential + Math.floor(random() * Math.max(1, Math.floor(exponential * 0.2)));
}

function dependencyRetryDelayMs(random: () => number): number {
  const baseDelayMs = 5 * 60_000;
  return baseDelayMs + Math.floor(random() * 60_000);
}

export function scanJobLeaseMs(scanTimeoutMs: number): number {
  // A claim must outlive both the bounded HEAD admission probe and GET open,
  // the scanner deadline, and a DB-finalization margin. Otherwise another
  // worker can repeatedly steal a legitimate in-flight scan before it wins.
  return Math.max(scanTimeoutMs + 2 * maximumS3ReadOperationTimeoutMs + 30_000, 300_000);
}

async function inTransaction<T>(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<T>,
): Promise<T> {
  const transaction = database as DatabaseClient & Partial<SavepointCapableDatabase>;
  if (typeof transaction.savepoint === "function") {
    return (await transaction.savepoint(callback)) as T;
  }
  return (await database.begin((tx) => callback(tx as DatabaseClient))) as T;
}

export class AttachmentScanProcessor {
  private readonly database: DatabaseClient;
  private readonly storage: ObjectStorage;
  private readonly scanner: MalwareScanner;
  private readonly logger: Logger;
  private readonly workerId: string;
  private readonly maxAttempts: number;
  private readonly leaseMs: number;
  private readonly random: () => number;

  public constructor(options: AttachmentScanProcessorOptions) {
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
    while (processed < boundedLimit && (await this.scannerIsReady())) {
      // Claim immediately before work, never an entire sequential batch. A
      // slow object/scan therefore cannot let unstarted leases expire and be
      // reclaimed concurrently by another Worker or the manual CLI.
      const jobs = await this.claim(1);
      const job = jobs[0];
      if (job === undefined) {
        break;
      }
      await this.process(job);
      processed += 1;
    }
    return processed;
  }

  private async scannerIsReady(): Promise<boolean> {
    if (this.scanner.mode === "disabled") {
      return true;
    }
    let ready = false;
    try {
      ready = (await this.scanner.checkReadiness()) === "healthy";
    } catch {
      ready = false;
    }
    if (!ready) {
      // Planned ClamAV signature reloads and temporary outages must not claim
      // work or consume a bounded scan attempt. The worker heartbeat can still
      // report the dependency outage while email and reconciliation continue.
      this.logger.warn("attachment_scanner_unavailable", { workerId: this.workerId });
    }
    return ready;
  }

  private async claim(limit: number): Promise<readonly ClaimedScanJob[]> {
    return inTransaction(this.database, async (tx) => {
      const candidates = await tx<ClaimedScanJob[]>`
        SELECT id, aggregate_id, attempt_count
        FROM outbox_events
        WHERE event_type = 'ATTACHMENT_SCAN_REQUESTED'
          AND (
            (status IN ('PENDING', 'RETRY') AND available_at <= now())
            OR (status = 'PROCESSING' AND available_at <= now())
          )
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;
      if (candidates.length === 0) {
        return [];
      }
      const claimed: ClaimedScanJob[] = [];
      for (const candidate of candidates) {
        const rows = await tx<ClaimedScanJob[]>`
          UPDATE outbox_events
          SET status = 'PROCESSING', attempt_count = attempt_count + 1,
              available_at = now() + (${this.leaseMs} * interval '1 millisecond'),
              last_error_code = NULL
          WHERE id = ${candidate.id}
            AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
            AND attempt_count = ${candidate.attempt_count}
            AND available_at <= now()
            AND status IN ('PENDING', 'RETRY', 'PROCESSING')
          RETURNING id, aggregate_id, attempt_count
        `;
        if (rows[0] !== undefined) {
          claimed.push(rows[0]);
        }
      }
      return claimed;
    });
  }

  private async process(job: ClaimedScanJob): Promise<void> {
    const attachmentId = job.aggregate_id;
    const attempt = positiveInteger(job.attempt_count, "attempt_count");
    if (attachmentId === null) {
      await this.deadLetter(job.id, attempt, "INVALID_SCAN_JOB");
      return;
    }
    const started = await this.startScan(job.id, attachmentId, attempt);
    if (started.kind === "STALE") {
      return;
    }
    if (started.kind === "NOT_SCANNABLE") {
      await this.deadLetter(job.id, attempt, "ATTACHMENT_NOT_SCANNABLE");
      return;
    }
    const attachment = started.attachment;
    if (attachment.storage_key === null) {
      await this.deadLetter(job.id, attempt, "ATTACHMENT_NOT_SCANNABLE");
      return;
    }

    this.logger.info("attachment_scan_started", {
      attachmentId,
      requestId: attachment.request_id,
      attempt,
      workerId: this.workerId,
    });
    let body: Awaited<ReturnType<ObjectStorage["open"]>>;
    try {
      if (!(await this.storage.exists(attachment.storage_key))) {
        await this.retryOrFail(job.id, attachment, attempt, "STORAGE_OBJECT_MISSING");
        return;
      }
      body = await this.storage.open(attachment.storage_key, {
        purpose: "background-scan",
      });
    } catch {
      await this.deferDependencyUnavailable(job.id, attachment, attempt, "STORAGE_UNAVAILABLE");
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
        await this.deferDependencyUnavailable(job.id, attachment, attempt, "STORAGE_UNAVAILABLE");
        return;
      }
      await this.retryOrFail(job.id, attachment, attempt, "SCANNER_UNAVAILABLE");
      return;
    }
    const applied = await this.complete(job.id, attachment, attempt, result.status);
    if (result.status === "INFECTED" && applied) {
      try {
        await removeReferencedObjectIfPresent(this.storage, attachment.storage_key);
        const rows = await this.database<{ readonly id: string }[]>`
          UPDATE service_request_attachments
          SET storage_status = 'DELETED', updated_at = now()
          WHERE id = ${attachment.id} AND storage_key = ${attachment.storage_key}
            AND storage_status = 'DELETE_PENDING' AND scan_status = 'INFECTED'
            AND scan_attempt_count = ${attempt}
          RETURNING id
        `;
        if (rows[0] !== undefined) {
          this.logger.info("infected_attachment_deleted", {
            attachmentId: attachment.id,
            requestId: attachment.request_id,
          });
        }
      } catch {
        this.logger.warn("storage_delete_failed", { attachmentId: attachment.id });
      }
    }
  }

  private async startScan(
    jobId: string,
    attachmentId: string,
    attempt: number,
  ): Promise<ScanStartResult> {
    return inTransaction(this.database, async (tx) => {
      const jobRows = await tx<{ readonly id: string }[]>`
        SELECT id FROM outbox_events
        WHERE id = ${jobId} AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
          AND aggregate_id = ${attachmentId} AND status = 'PROCESSING'
          AND attempt_count = ${attempt}
        FOR UPDATE
      `;
      if (jobRows[0] === undefined) {
        return { kind: "STALE" };
      }
      const attachmentRows = await tx<ScanAttachmentRow[]>`
        SELECT id, request_id, storage_key, storage_status, scan_status,
               scan_attempt_count, deleted_at
        FROM service_request_attachments
        WHERE id = ${attachmentId}
        FOR UPDATE
      `;
      const attachment = attachmentRows[0];
      if (
        attachment === undefined ||
        attachment.deleted_at !== null ||
        attachment.storage_status !== "STORED" ||
        attachment.storage_key === null ||
        (attachment.scan_status !== "PENDING_SCAN" && attachment.scan_status !== "SCAN_ERROR")
      ) {
        return { kind: "NOT_SCANNABLE" };
      }
      const previousAttempt = nonNegativeInteger(
        attachment.scan_attempt_count,
        "scan_attempt_count",
      );
      if (previousAttempt >= attempt) {
        return { kind: "STALE" };
      }
      const rows = await tx<ScanAttachmentRow[]>`
        UPDATE service_request_attachments
        SET scan_started_at = now(), scan_attempt_count = ${attempt}, updated_at = now()
        WHERE id = ${attachmentId} AND scan_attempt_count = ${previousAttempt}
          AND deleted_at IS NULL AND storage_status = 'STORED'
          AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
        RETURNING id, request_id, storage_key, storage_status, scan_status,
                  scan_attempt_count, deleted_at
      `;
      const claimed = rows[0];
      return claimed === undefined ? { kind: "STALE" } : { kind: "CLAIMED", attachment: claimed };
    });
  }

  private async retryOrFail(
    jobId: string,
    attachment: ScanAttachmentRow,
    attempt: number,
    failureCode: "SCANNER_UNAVAILABLE" | "STORAGE_OBJECT_MISSING",
  ): Promise<void> {
    if (attempt < this.maxAttempts) {
      const delayMs = retryDelayMs(attempt, this.random);
      const applied = await inTransaction(this.database, async (tx) => {
        const jobRows = await tx<{ readonly id: string }[]>`
          SELECT id FROM outbox_events
          WHERE id = ${jobId} AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
            AND aggregate_id = ${attachment.id}
            AND status = 'PROCESSING' AND attempt_count = ${attempt}
          FOR UPDATE
        `;
        if (jobRows[0] === undefined) {
          return false;
        }
        const attachmentRows = await tx<{ readonly id: string }[]>`
          UPDATE service_request_attachments
          SET scan_status = 'PENDING_SCAN', scan_next_attempt_at = now() + (${delayMs} * interval '1 millisecond'),
              scan_completed_at = NULL, scan_last_error_code = ${failureCode},
              updated_at = now()
          WHERE id = ${attachment.id} AND request_id = ${attachment.request_id}
            AND scan_attempt_count = ${attempt} AND deleted_at IS NULL
            AND storage_status = 'STORED'
            AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
          RETURNING id
        `;
        if (attachmentRows[0] === undefined) {
          await tx`
            UPDATE outbox_events
            SET status = 'DEAD_LETTER', processed_at = now(), available_at = now(),
                last_error_code = 'ATTACHMENT_NOT_SCANNABLE'
            WHERE id = ${jobId} AND status = 'PROCESSING'
              AND attempt_count = ${attempt}
          `;
          return false;
        }
        const outboxRows = await tx<{ readonly id: string }[]>`
          UPDATE outbox_events
          SET status = 'RETRY', available_at = now() + (${delayMs} * interval '1 millisecond'),
              last_error_code = ${failureCode}
          WHERE id = ${jobId} AND status = 'PROCESSING' AND attempt_count = ${attempt}
            AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
            AND aggregate_id = ${attachment.id}
          RETURNING id
        `;
        if (outboxRows[0] === undefined) {
          throw new Error("Scan retry lost its locked outbox claim.");
        }
        return true;
      });
      if (applied) {
        this.logger.warn("attachment_scan_failed", {
          attachmentId: attachment.id,
          attempt,
          retryScheduled: true,
        });
      }
      return;
    }
    const applied = await this.finishTerminal(
      jobId,
      attachment,
      attempt,
      "SCAN_ERROR",
      "FILE_SCAN_FAILED",
      failureCode,
    );
    if (applied) {
      this.logger.error("attachment_scan_failed", {
        attachmentId: attachment.id,
        attempt,
        retryScheduled: false,
      });
    }
  }

  private async deferDependencyUnavailable(
    jobId: string,
    attachment: ScanAttachmentRow,
    attempt: number,
    failureCode: "STORAGE_UNAVAILABLE",
  ): Promise<void> {
    const delayMs = dependencyRetryDelayMs(this.random);
    const previousAttempt = attempt - 1;
    const applied = await inTransaction(this.database, async (tx) => {
      const jobRows = await tx<{ readonly id: string }[]>`
        SELECT id FROM outbox_events
        WHERE id = ${jobId} AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
          AND aggregate_id = ${attachment.id}
          AND status = 'PROCESSING' AND attempt_count = ${attempt}
        FOR UPDATE
      `;
      if (jobRows[0] === undefined) {
        return false;
      }
      const attachmentRows = await tx<{ readonly id: string }[]>`
        UPDATE service_request_attachments
        SET scan_status = 'PENDING_SCAN', scan_attempt_count = ${previousAttempt},
            scan_started_at = NULL, scan_completed_at = NULL,
            scan_next_attempt_at = now() + (${delayMs} * interval '1 millisecond'),
            scan_last_error_code = ${failureCode}, updated_at = now()
        WHERE id = ${attachment.id} AND request_id = ${attachment.request_id}
          AND scan_attempt_count = ${attempt} AND deleted_at IS NULL
          AND storage_status = 'STORED'
          AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
        RETURNING id
      `;
      if (attachmentRows[0] === undefined) {
        return false;
      }
      const outboxRows = await tx<{ readonly id: string }[]>`
        UPDATE outbox_events
        SET status = 'RETRY', attempt_count = ${previousAttempt},
            available_at = now() + (${delayMs} * interval '1 millisecond'),
            processed_at = NULL, last_error_code = ${failureCode}
        WHERE id = ${jobId} AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
          AND aggregate_id = ${attachment.id}
          AND status = 'PROCESSING' AND attempt_count = ${attempt}
        RETURNING id
      `;
      if (outboxRows[0] === undefined) {
        throw new Error("Dependency deferral lost its locked outbox claim.");
      }
      return true;
    });
    if (applied) {
      this.logger.warn("attachment_scan_deferred", {
        attachmentId: attachment.id,
        dependency: "object_storage",
        retryScheduled: true,
      });
    }
  }

  private async complete(
    jobId: string,
    attachment: ScanAttachmentRow,
    attempt: number,
    status: "CLEAN" | "INFECTED" | "SKIPPED_DEVELOPMENT",
  ): Promise<boolean> {
    const databaseStatus = status === "SKIPPED_DEVELOPMENT" ? "SCAN_SKIPPED_DEVELOPMENT" : status;
    const applied = await this.finishTerminal(
      jobId,
      attachment,
      attempt,
      databaseStatus,
      "FILE_SCAN_COMPLETED",
    );
    if (!applied) {
      return false;
    }
    const event =
      status === "CLEAN"
        ? "attachment_scan_clean"
        : status === "INFECTED"
          ? "attachment_scan_infected"
          : "attachment_scan_skipped_development";
    this.logger.info(event, { attachmentId: attachment.id, requestId: attachment.request_id });
    return true;
  }

  private async finishTerminal(
    jobId: string,
    attachment: ScanAttachmentRow,
    attempt: number,
    status: "CLEAN" | "INFECTED" | "SCAN_ERROR" | "SCAN_SKIPPED_DEVELOPMENT",
    eventType: "FILE_SCAN_COMPLETED" | "FILE_SCAN_FAILED",
    failureCode?: "SCANNER_UNAVAILABLE" | "STORAGE_OBJECT_MISSING",
  ): Promise<boolean> {
    return inTransaction(this.database, async (tx) => {
      // Lock and validate the lease token before touching the attachment. This
      // prevents a stale scanner from committing after a newer attempt wins.
      const jobRows = await tx<{ readonly id: string }[]>`
        SELECT id FROM outbox_events
        WHERE id = ${jobId} AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
          AND aggregate_id = ${attachment.id}
          AND status = 'PROCESSING' AND attempt_count = ${attempt}
        FOR UPDATE
      `;
      if (jobRows[0] === undefined) {
        return false;
      }
      // Request mutations consistently lock request -> attachment (for
      // example, student attachment deletion). Preserve that order here to
      // avoid a request/attachment deadlock while still fencing on outbox first.
      const requestRows = await tx<{ readonly version: number | string }[]>`
        SELECT version FROM service_requests WHERE id = ${attachment.request_id} FOR UPDATE
      `;
      const currentVersion = positiveInteger(requestRows[0]?.version ?? 0, "request_version");
      const attachmentRows = await tx<{ readonly id: string }[]>`
        SELECT id FROM service_request_attachments
        WHERE id = ${attachment.id} AND request_id = ${attachment.request_id}
          AND scan_attempt_count = ${attempt} AND deleted_at IS NULL
          AND storage_status = 'STORED'
          AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
        FOR UPDATE
      `;
      if (attachmentRows[0] === undefined) {
        await tx`
          UPDATE outbox_events
          SET status = 'DEAD_LETTER', processed_at = now(), available_at = now(),
              last_error_code = 'ATTACHMENT_NOT_SCANNABLE'
          WHERE id = ${jobId} AND status = 'PROCESSING' AND attempt_count = ${attempt}
        `;
        return false;
      }
      const versions = await tx<{ readonly version: number | string }[]>`
        UPDATE service_requests SET version = version + 1, updated_at = now()
        WHERE id = ${attachment.request_id} AND version = ${currentVersion}
        RETURNING version
      `;
      const requestVersion = positiveInteger(versions[0]?.version ?? 0, "request_version");
      const completedRows = await tx<{ readonly id: string }[]>`
        UPDATE service_request_attachments
        SET scan_status = ${status}, scan_completed_at = now(), scan_next_attempt_at = NULL,
            scan_last_error_code = ${status === "SCAN_ERROR" ? (failureCode ?? "SCANNER_UNAVAILABLE") : null},
            storage_status = ${status === "INFECTED" ? "DELETE_PENDING" : "STORED"},
            updated_at = now()
        WHERE id = ${attachment.id} AND request_id = ${attachment.request_id}
          AND scan_attempt_count = ${attempt} AND deleted_at IS NULL
          AND storage_status = 'STORED'
          AND scan_status IN ('PENDING_SCAN', 'SCAN_ERROR')
        RETURNING id
      `;
      if (completedRows[0] === undefined) {
        throw new Error("Scan completion lost its locked attachment claim.");
      }
      await tx`
        INSERT INTO service_request_events (
          request_id, event_type, actor_type, actor_user_id, request_version, metadata
        ) VALUES (
          ${attachment.request_id}, ${eventType}, 'SYSTEM', NULL, ${requestVersion},
          ${tx.json({ attachmentId: attachment.id, scanStatus: status })}
        )
      `;
      const deliveredRows = await tx<{ readonly id: string }[]>`
        UPDATE outbox_events
        SET status = ${status === "SCAN_ERROR" ? "DEAD_LETTER" : "DELIVERED"},
            processed_at = now(), available_at = now(),
            last_error_code = ${status === "SCAN_ERROR" ? (failureCode ?? "SCANNER_UNAVAILABLE") : null}
        WHERE id = ${jobId} AND status = 'PROCESSING' AND attempt_count = ${attempt}
          AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
          AND aggregate_id = ${attachment.id}
        RETURNING id
      `;
      if (deliveredRows[0] === undefined) {
        throw new Error("Scan completion lost its locked outbox claim.");
      }
      return true;
    });
  }

  private async deadLetter(jobId: string, attempt: number, code: string): Promise<void> {
    await this.database`
      UPDATE outbox_events
      SET status = 'DEAD_LETTER', processed_at = now(), available_at = now(),
          last_error_code = ${code}
      WHERE id = ${jobId} AND event_type = 'ATTACHMENT_SCAN_REQUESTED'
        AND status = 'PROCESSING' AND attempt_count = ${attempt}
    `;
  }
}

export { dependencyRetryDelayMs, retryDelayMs };
