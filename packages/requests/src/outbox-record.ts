import type { DatabaseClient } from "@itqanak/db";

/**
 * Appends an informational lifecycle record to `outbox_events` already marked
 * DELIVERED — it has no delivery step, it exists so the AutoBox monitor can show
 * FILE_* / MESSAGE_* activity next to the events that do get delivered. The
 * unique idempotency key makes a re-emit a harmless no-op.
 */
export async function recordOutboxLifecycleEvent(
  database: DatabaseClient,
  input: {
    readonly eventType: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly idempotencyKey: string;
    readonly payload: Record<string, unknown>;
  },
): Promise<void> {
  await database`
    INSERT INTO outbox_events (
      event_type, aggregate_type, aggregate_id, idempotency_key, payload,
      status, processed_at
    ) VALUES (
      ${input.eventType}, ${input.aggregateType}, ${input.aggregateId},
      ${input.idempotencyKey}, ${JSON.stringify(input.payload)}::jsonb,
      'DELIVERED', now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING
  `;
}
