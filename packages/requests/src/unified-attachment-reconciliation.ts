import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import type { ObjectStorage } from "@itqanak/storage";

import {
  boundedReconciliationLimit,
  removeReferencedObjectIfPresent,
  type AttachmentStorageReconciliationResult,
} from "./reconciliation.js";

interface CandidateRow {
  readonly id: string;
  readonly storage_key: string | null;
  readonly storage_status: "PENDING_UPLOAD" | "UPLOAD_FAILED" | "DELETE_PENDING";
  readonly scan_status: string;
}

interface SavepointDatabase {
  savepoint<T>(callback: (transaction: DatabaseClient) => Promise<T>): Promise<T>;
}

export interface UnifiedAttachmentStorageReconcilerOptions {
  readonly database: DatabaseClient;
  readonly storage: ObjectStorage;
  readonly logger: Logger;
  readonly minimumAgeMs?: number;
  readonly pendingUploadMinimumAgeMs?: number;
}

async function inTransaction<T>(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<T>,
): Promise<T> {
  const transaction = database as DatabaseClient & Partial<SavepointDatabase>;
  return typeof transaction.savepoint === "function"
    ? ((await transaction.savepoint(callback)) as T)
    : ((await database.begin((tx) => callback(tx as DatabaseClient))) as T);
}

/** Repairs only object keys already referenced by unified attachment rows. */
export class UnifiedAttachmentStorageReconciler {
  private readonly minimumAgeMs: number;
  private readonly pendingUploadMinimumAgeMs: number;

  public constructor(private readonly options: UnifiedAttachmentStorageReconcilerOptions) {
    this.minimumAgeMs = options.minimumAgeMs ?? 5 * 60_000;
    this.pendingUploadMinimumAgeMs = options.pendingUploadMinimumAgeMs ?? 60 * 60_000;
    if (!Number.isSafeInteger(this.minimumAgeMs) || this.minimumAgeMs < 0) {
      throw new Error("Unified reconciliation minimum age is invalid.");
    }
    if (
      !Number.isSafeInteger(this.pendingUploadMinimumAgeMs) ||
      this.pendingUploadMinimumAgeMs < 0
    ) {
      throw new Error("Unified pending-upload reconciliation age is invalid.");
    }
  }

  public async processBatch(limit = 5): Promise<AttachmentStorageReconciliationResult> {
    const claim = await inTransaction(this.options.database, async (tx) => {
      const rows = await tx<CandidateRow[]>`
        SELECT id, storage_key, storage_status, scan_status
        FROM unified_conversation_attachments
        WHERE (
            storage_status = 'PENDING_UPLOAD'
            AND updated_at <= now() - (${this.pendingUploadMinimumAgeMs} * interval '1 millisecond')
          ) OR (
            storage_status IN ('UPLOAD_FAILED', 'DELETE_PENDING')
            AND updated_at <= now() - (${this.minimumAgeMs} * interval '1 millisecond')
          )
        ORDER BY updated_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${boundedReconciliationLimit(limit)}
      `;
      const candidates: { readonly id: string; readonly storageKey: string }[] = [];
      let finalizedWithoutObject = 0;
      for (const row of rows) {
        if (row.storage_key === null) {
          const finalized = await tx<{ readonly id: string }[]>`
            UPDATE unified_conversation_attachments
            SET storage_status = 'DELETED', deleted_at = COALESCE(deleted_at, now()),
                updated_at = now()
            WHERE id = ${row.id} AND storage_status = ${row.storage_status}
              AND storage_key IS NULL
            RETURNING id
          `;
          if (finalized[0] !== undefined) finalizedWithoutObject += 1;
          continue;
        }
        const claimed = await tx<{ readonly id: string }[]>`
          UPDATE unified_conversation_attachments
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
        if (claimed[0] !== undefined) candidates.push({ id: row.id, storageKey: row.storage_key });
      }
      return { candidates, finalizedWithoutObject };
    });

    let finalized = claim.finalizedWithoutObject;
    let retryPending = 0;
    for (const candidate of claim.candidates) {
      try {
        await removeReferencedObjectIfPresent(this.options.storage, candidate.storageKey);
        const rows = await this.options.database<{ readonly id: string }[]>`
          UPDATE unified_conversation_attachments
          SET storage_status = 'DELETED', updated_at = now()
          WHERE id = ${candidate.id} AND storage_status = 'DELETE_PENDING'
            AND storage_key = ${candidate.storageKey}
          RETURNING id
        `;
        if (rows[0] !== undefined) {
          finalized += 1;
          this.options.logger.info("unified_attachment_storage_reconciled", {
            attachmentId: candidate.id,
          });
        }
      } catch {
        retryPending += 1;
        this.options.logger.warn("unified_attachment_storage_reconciliation_failed", {
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
}
