import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

import { recordOutboxLifecycleEvent } from "./outbox-record.js";

export const ARCHIVED_MESSAGE_MARKER = "__ARCHIVED__";

interface ArchiveCandidate {
  readonly id: string;
  readonly conversation_id: string;
  readonly sender_type: string;
  readonly sender_user_id: string | null;
  readonly content_type: string;
  readonly body: string;
  readonly metadata: unknown;
  readonly sent_at: Date | string;
}

export interface MessageRetentionSweeperOptions {
  readonly database: DatabaseClient;
  readonly logger: Logger;
}

/**
 * When archival is enabled, moves the retained content of support messages older
 * than the retention window into `support_message_archive` and replaces it in
 * the hot table with a fixed marker (stamping `archived_at`). The row, its
 * receipts, revisions and reactions are untouched; the chat renders an
 * "archived" placeholder in its place.
 */
export class MessageRetentionSweeper {
  private readonly database: DatabaseClient;
  private readonly logger: Logger;

  public constructor(options: MessageRetentionSweeperOptions) {
    this.database = options.database;
    this.logger = options.logger;
  }

  public async processBatch(retentionDays: number, limit = 100): Promise<number> {
    const days = Math.max(7, Math.min(3650, Math.trunc(retentionDays)));
    const bounded = Math.max(1, Math.min(500, Math.trunc(limit)));
    const candidates = await this.database<ArchiveCandidate[]>`
      SELECT id, conversation_id, sender_type, sender_user_id, content_type, body,
             metadata, sent_at
      FROM support_messages
      WHERE archived_at IS NULL
        AND sent_at < now() - (${days} * interval '1 day')
      ORDER BY sent_at ASC, id ASC
      LIMIT ${bounded}
    `;
    let archived = 0;
    for (const candidate of candidates) {
      const metadataJson = JSON.stringify(
        typeof candidate.metadata === "object" && candidate.metadata !== null
          ? candidate.metadata
          : {},
      );
      const done = await this.database.begin(async (transaction) => {
        const tx = transaction as DatabaseClient;
        await tx`
          INSERT INTO support_message_archive (
            message_id, conversation_id, sender_type, sender_user_id, content_type,
            body, metadata, original_sent_at
          ) VALUES (
            ${candidate.id}, ${candidate.conversation_id}, ${candidate.sender_type},
            ${candidate.sender_user_id}, ${candidate.content_type}, ${candidate.body},
            ${metadataJson}::jsonb, ${candidate.sent_at}
          )
          ON CONFLICT (message_id) DO NOTHING
        `;
        const updated = await tx<{ readonly id: string }[]>`
          UPDATE support_messages
          SET archived_at = now(), body = ${ARCHIVED_MESSAGE_MARKER}, metadata = '{}'::jsonb
          WHERE id = ${candidate.id} AND archived_at IS NULL
          RETURNING id
        `;
        if (updated[0] === undefined) return false;
        await recordOutboxLifecycleEvent(tx, {
          eventType: "MESSAGE_ARCHIVED",
          aggregateType: "SUPPORT_MESSAGE",
          aggregateId: candidate.id,
          idempotencyKey: `message-archived:${candidate.id}`,
          payload: { messageId: candidate.id, conversationId: candidate.conversation_id },
        });
        return true;
      });
      if (done) archived += 1;
    }
    if (archived > 0) {
      this.logger.info("support_message_retention_archived", {
        count: archived,
        retentionDays: days,
      });
    }
    return archived;
  }
}
