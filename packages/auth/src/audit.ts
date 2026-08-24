import { redact } from "@itqanak/observability";

import type { DatabaseClient } from "@itqanak/db";

import type { RequestAuditContext } from "./types.js";

export type AuditOutcome = "SUCCESS" | "FAILURE" | "DENIED";

export interface AuditEventInput extends RequestAuditContext {
  readonly eventType: string;
  readonly outcome: AuditOutcome;
  readonly actorUserId?: string;
  readonly targetUserId?: string;
  readonly sessionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function serializeAuditMetadata(
  value: Readonly<Record<string, unknown>> | undefined,
): string {
  const redacted = redact(value ?? {});
  return JSON.stringify(redacted);
}

export async function recordAuditEvent(
  database: DatabaseClient,
  input: AuditEventInput,
): Promise<void> {
  await database`
    INSERT INTO security_audit_events (
      event_type, actor_user_id, target_user_id, session_id, request_id,
      correlation_id, outcome, ip_hash, user_agent_summary, resource_type,
      resource_id, metadata
    ) VALUES (
      ${input.eventType}, ${input.actorUserId ?? null}, ${input.targetUserId ?? null},
      ${input.sessionId ?? null}, ${input.requestId ?? null}, ${input.correlationId ?? null},
      ${input.outcome}, ${input.ipHash ?? null}, ${input.userAgentSummary ?? null},
      ${input.resourceType ?? null}, ${input.resourceId ?? null},
      ${database.json(redact(input.metadata ?? {}))}
    )
  `;
}

export function summarizeUserAgent(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = value
    .replace(/[\r\n\t]+/gu, " ")
    .trim()
    .slice(0, 180);
  return normalized.length === 0 ? undefined : normalized;
}
