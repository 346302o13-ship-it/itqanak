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
  /** Days a stored conversation attachment object is kept before purge. */
  readonly retentionDays?: number;
}

/**
 * Deletes the object behind conversation attachments older than the retention
 * window and flips the row to `EXPIRED`. The row (file name, size, type) stays
 * so the chat still shows it; the download path then reports it as gone.
 */
export class UnifiedAttachmentRetentionSweeper {
  private readonly retentionDays: number;

  public constructor(private readonly options: UnifiedAttachmentRetentionSweeperOptions) {
    this.retentionDays = options.retentionDays ?? 4;
    if (!Number.isInteger(this.retentionDays) || this.retentionDays < 1) {
      throw new Error("Attachment retention days must be a positive integer.");
    }
  }

  public async processBatch(limit = 20): Promise<number> {
    const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
    // A single worker runs this; the guarded UPDATE below makes a concurrent
    // sweep a harmless no-op, so no row lock is needed here. Payment-receipt
    // attachments are financial records and are never swept.
    const candidates = await this.options.database<ExpiryCandidate[]>`
      SELECT attachments.id, attachments.storage_key
      FROM unified_conversation_attachments AS attachments
      WHERE attachments.storage_status = 'STORED'
        AND attachments.deleted_at IS NULL
        AND attachments.created_at < now() - (${this.retentionDays} * interval '1 day')
        AND NOT EXISTS (
          SELECT 1 FROM finance_payment_submissions AS receipts
          WHERE receipts.attachment_id = attachments.id
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
        retentionDays: this.retentionDays,
      });
    }
    return expired;
  }
}
