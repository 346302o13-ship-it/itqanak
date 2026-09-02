import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import type { ObjectStorage } from "@itqanak/storage";

interface ExpiryCandidate {
  readonly id: string;
  readonly storage_key: string | null;
}

export interface UnifiedAttachmentRetentionSweeperOptions {
  readonly database: DatabaseClient;
  readonly storage: ObjectStorage;
  readonly logger: Logger;
}

/**
 * Option-B retention. Purges the object behind a stored conversation attachment
 * (flipping the row to `EXPIRED`, keeping the file name) when EITHER:
 *   - it has never been downloaded and is older than `undownloadedRetentionDays`, OR
 *   - its post-download deadline (`delete_after`, set on download) has passed.
 * Payment-receipt attachments are financial records and are never swept.
 */
export class UnifiedAttachmentRetentionSweeper {
  public constructor(private readonly options: UnifiedAttachmentRetentionSweeperOptions) {}

  public async processBatch(undownloadedRetentionDays: number, limit = 20): Promise<number> {
    const days = Math.max(1, Math.min(3650, Math.trunc(undownloadedRetentionDays)));
    const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
    // A single worker runs this; the guarded UPDATE below makes a concurrent
    // sweep a harmless no-op, so no row lock is needed here.
    const candidates = await this.options.database<ExpiryCandidate[]>`
      SELECT attachments.id, attachments.storage_key
      FROM unified_conversation_attachments AS attachments
      WHERE attachments.storage_status = 'STORED'
        AND attachments.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM finance_payment_submissions AS receipts
          WHERE receipts.attachment_id = attachments.id
        )
        AND (
          (
            attachments.download_count = 0
            AND attachments.delete_after IS NULL
            AND attachments.created_at < now() - (${days} * interval '1 day')
          )
          OR (
            attachments.delete_after IS NOT NULL
            AND attachments.delete_after < now()
          )
        )
      ORDER BY attachments.created_at ASC, attachments.id ASC
      LIMIT ${bounded}
    `;
    let expired = 0;
    for (const candidate of candidates) {
      if (candidate.storage_key !== null) {
        try {
          await this.options.storage.remove(candidate.storage_key);
        } catch {
          // Object already gone or storage briefly unavailable: still flip the
          // row so it is not reconsidered every sweep; a stray object is
          // harmless and caught by the storage reconciler.
        }
      }
      const updated = await this.options.database<{ readonly id: string }[]>`
        UPDATE unified_conversation_attachments
        SET storage_status = 'EXPIRED', updated_at = now()
        WHERE id = ${candidate.id} AND storage_status = 'STORED'
        RETURNING id
      `;
      if (updated[0] !== undefined) expired += 1;
    }
    if (expired > 0) {
      this.options.logger.info("unified_attachment_retention_expired", {
        count: expired,
        undownloadedRetentionDays: days,
      });
    }
    return expired;
  }
}
