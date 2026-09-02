import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import type { ObjectStorage } from "@itqanak/storage";

import { recordOutboxLifecycleEvent } from "./outbox-record.js";

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

  /**
   * Emits one FILE_DELETION_WARNING record per file whose object is scheduled to
   * be purged within the next three days (and has not already been warned for
   * that deadline). The idempotency key carries the deadline so an admin
   * extension re-warns. Purely informational — visible in the AutoBox monitor.
   */
  public async warnUpcomingDeletions(limit = 50): Promise<number> {
    const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = await this.options.database<
      { readonly id: string; readonly delete_after: Date | string }[]
    >`
      SELECT id, delete_after
      FROM unified_conversation_attachments
      WHERE storage_status = 'STORED'
        AND deleted_at IS NULL
        AND delete_after IS NOT NULL
        AND delete_after > now()
        AND delete_after <= now() + interval '3 days'
      ORDER BY delete_after ASC
      LIMIT ${bounded}
    `;
    for (const row of rows) {
      const deadlineSec = Math.floor(
        (row.delete_after instanceof Date
          ? row.delete_after
          : new Date(row.delete_after)
        ).getTime() / 1000,
      );
      await recordOutboxLifecycleEvent(this.options.database, {
        eventType: "FILE_DELETION_WARNING",
        aggregateType: "SUPPORT_CONVERSATION_ATTACHMENT",
        aggregateId: row.id,
        idempotencyKey: `file-deletion-warning:${row.id}:${deadlineSec}`,
        payload: { attachmentId: row.id, deleteAfter: new Date(deadlineSec * 1000).toISOString() },
      });
    }
    return rows.length;
  }

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
      if (updated[0] !== undefined) {
        expired += 1;
        await recordOutboxLifecycleEvent(this.options.database, {
          eventType: "FILE_EXPIRED",
          aggregateType: "SUPPORT_CONVERSATION_ATTACHMENT",
          aggregateId: candidate.id,
          idempotencyKey: `file-expired:${candidate.id}`,
          payload: { attachmentId: candidate.id, reason: "retention_sweep" },
        });
      }
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
