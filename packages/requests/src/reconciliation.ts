import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import type { ObjectStorage } from "@itqanak/storage";

interface ReconciliationCandidateRow {
  readonly id: string;
  readonly storage_key: string | null;
  readonly storage_status: "PENDING_UPLOAD" | "UPLOAD_FAILED" | "DELETE_PENDING";
  readonly scan_status: string;
}

interface IdRow {
  readonly id: string;
}

interface ReconciliationClaim {
  readonly candidates: readonly { readonly id: string; readonly storageKey: string }[];
  readonly finalizedWithoutObject: number;
}

interface SavepointCapableDatabase {
  savepoint<T>(callback: (transaction: DatabaseClient) => Promise<T>): Promise<T>;
}

export interface AttachmentStorageReconcilerOptions {
  readonly database: DatabaseClient;
  readonly storage: ObjectStorage;
  readonly logger: Logger;
  /** Prevents racing a foreground upload/delete. Defaults to five minutes. */
  readonly minimumAgeMs?: number;
  /** A conservative crash-recovery lease for uploads that never finalized. Defaults to one hour. */
  readonly pendingUploadMinimumAgeMs?: number;
}

export interface AttachmentStorageReconciliationPreview {
  readonly eligiblePendingUploads: number;
  readonly eligibleFailedUploads: number;
  readonly eligiblePendingDeletes: number;
  readonly referencedObjects: number;
}

export interface AttachmentStorageReconciliationResult {
  readonly claimed: number;
  readonly finalized: number;
  readonly retryPending: number;
}

const defaultMinimumAgeMs = 5 * 60 * 1_000;
const defaultPendingUploadMinimumAgeMs = 60 * 60 * 1_000;
const maximumBatchSize = 20;

function count(value: number | string | undefined, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Storage reconciliation returned an invalid ${field}.`);
  }
  return parsed;
}

export function boundedReconciliationLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(Math.trunc(value), maximumBatchSize));
}

/**
 * Removes exactly one key already referenced by an attachment row. A missing
 * object is success: the database transition may have been interrupted after
 * a prior idempotent delete.
 */
export async function removeReferencedObjectIfPresent(
  storage: ObjectStorage,
  storageKey: string,
): Promise<void> {
  try {
    await storage.remove(storageKey);
  } catch (error: unknown) {
    // S3 deletion is idempotent. The local adapter reports an already-absent
    // object as ENOENT; that is the equivalent successful end state. Do not
    // use exists() here because a connectivity/permission error must not be
    // mistaken for absence and followed by a metadata-only deletion.
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
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

/**
 * Repairs only attachment rows which already reference a specific object.
 * It never enumerates a bucket, guesses keys, or deletes unreferenced objects.
 */
export class AttachmentStorageReconciler {
  private readonly database: DatabaseClient;
  private readonly storage: ObjectStorage;
  private readonly logger: Logger;
  private readonly minimumAgeMs: number;
  private readonly pendingUploadMinimumAgeMs: number;

  public constructor(options: AttachmentStorageReconcilerOptions) {
    const minimumAgeMs = options.minimumAgeMs ?? defaultMinimumAgeMs;
    const pendingUploadMinimumAgeMs =
      options.pendingUploadMinimumAgeMs ?? defaultPendingUploadMinimumAgeMs;
    if (!Number.isSafeInteger(minimumAgeMs) || minimumAgeMs < 0) {
      throw new Error("Storage reconciliation minimum age must be a non-negative integer.");
    }
    if (!Number.isSafeInteger(pendingUploadMinimumAgeMs) || pendingUploadMinimumAgeMs < 0) {
      throw new Error("Pending-upload reconciliation age must be a non-negative integer.");
    }
    this.database = options.database;
    this.storage = options.storage;
    this.logger = options.logger;
    this.minimumAgeMs = minimumAgeMs;
    this.pendingUploadMinimumAgeMs = pendingUploadMinimumAgeMs;
  }

  public async preview(): Promise<AttachmentStorageReconciliationPreview> {
    const rows = await this.database<
      {
        readonly pending_uploads: number | string;
        readonly failed_uploads: number | string;
        readonly pending_deletes: number | string;
        readonly referenced_objects: number | string;
      }[]
    >`
      SELECT
        count(*) FILTER (WHERE storage_status = 'PENDING_UPLOAD')::text AS pending_uploads,
        count(*) FILTER (WHERE storage_status = 'UPLOAD_FAILED')::text AS failed_uploads,
        count(*) FILTER (WHERE storage_status = 'DELETE_PENDING')::text AS pending_deletes,
        count(*) FILTER (WHERE storage_key IS NOT NULL)::text AS referenced_objects
      FROM service_request_attachments
      WHERE (
          storage_status = 'PENDING_UPLOAD'
          AND updated_at <= now() - (${this.pendingUploadMinimumAgeMs} * interval '1 millisecond')
        ) OR (
          storage_status IN ('UPLOAD_FAILED', 'DELETE_PENDING')
          AND updated_at <= now() - (${this.minimumAgeMs} * interval '1 millisecond')
        )
    `;
    const row = rows[0];
    return {
      eligiblePendingUploads: count(row?.pending_uploads, "pending_uploads"),
      eligibleFailedUploads: count(row?.failed_uploads, "failed_uploads"),
      eligiblePendingDeletes: count(row?.pending_deletes, "pending_deletes"),
      referencedObjects: count(row?.referenced_objects, "referenced_objects"),
    };
  }

  public async processBatch(limit = 5): Promise<AttachmentStorageReconciliationResult> {
    const claim = await this.claim(boundedReconciliationLimit(limit));
    let finalized = claim.finalizedWithoutObject;
    let retryPending = 0;

    for (const candidate of claim.candidates) {
      try {
        await removeReferencedObjectIfPresent(this.storage, candidate.storageKey);
        const rows = await this.database<IdRow[]>`
          UPDATE service_request_attachments
          SET storage_status = 'DELETED', updated_at = now()
          WHERE id = ${candidate.id}
            AND storage_status = 'DELETE_PENDING'
            AND storage_key = ${candidate.storageKey}
          RETURNING id
        `;
        if (rows[0] !== undefined) {
          finalized += 1;
          this.logger.info("attachment_storage_reconciled", {
            attachmentId: candidate.id,
          });
        }
      } catch {
        retryPending += 1;
        this.logger.warn("attachment_storage_reconciliation_failed", {
          attachmentId: candidate.id,
        });
      }
    }

    return {
      claimed: claim.candidates.length + claim.finalizedWithoutObject,
      finalized,
      retryPending,
    };
  }

  private async claim(limit: number): Promise<ReconciliationClaim> {
    return inTransaction(this.database, async (tx) => {
      const rows = await tx<ReconciliationCandidateRow[]>`
        SELECT id, storage_key, storage_status, scan_status
        FROM service_request_attachments
        WHERE (
            storage_status = 'PENDING_UPLOAD'
            AND updated_at <= now() - (${this.pendingUploadMinimumAgeMs} * interval '1 millisecond')
          ) OR (
            storage_status IN ('UPLOAD_FAILED', 'DELETE_PENDING')
            AND updated_at <= now() - (${this.minimumAgeMs} * interval '1 millisecond')
          )
        ORDER BY updated_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;
      const candidates: { id: string; storageKey: string }[] = [];
      let finalizedWithoutObject = 0;

      for (const row of rows) {
        if (row.storage_key === null) {
          const finalizedRows = await tx<IdRow[]>`
            UPDATE service_request_attachments
            SET storage_status = 'DELETED', deleted_at = COALESCE(deleted_at, now()),
                updated_at = now()
            WHERE id = ${row.id} AND storage_status = ${row.storage_status}
              AND storage_key IS NULL
            RETURNING id
          `;
          if (finalizedRows[0] !== undefined) {
            finalizedWithoutObject += 1;
          }
          continue;
        }

        const claimedRows = await tx<IdRow[]>`
          UPDATE service_request_attachments
          SET storage_status = 'DELETE_PENDING',
              deleted_at = CASE
                WHEN ${row.scan_status} = 'INFECTED' THEN deleted_at
                ELSE COALESCE(deleted_at, now())
              END,
              updated_at = now()
          WHERE id = ${row.id} AND storage_status = ${row.storage_status}
            AND storage_key = ${row.storage_key}
          RETURNING id
        `;
        if (claimedRows[0] !== undefined) {
          candidates.push({ id: row.id, storageKey: row.storage_key });
        }
      }

      return { candidates, finalizedWithoutObject };
    });
  }
}
