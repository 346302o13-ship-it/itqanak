import {
  recordAuditEvent,
  requireAdmin,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";

import {
  OperationalControlError,
  type PlatformRetentionState,
  type UpdatePlatformRetentionStateInput,
} from "./types.js";
import { assertOperationalVersion } from "./validation.js";

interface PlatformRetentionStateRow {
  readonly message_archival_enabled: boolean;
  readonly message_retention_days: number | string;
  readonly attachment_undownloaded_retention_days: number | string;
  readonly attachment_downloaded_retention_days: number | string;
  readonly version: number | string;
  readonly updated_at: Date | string;
}

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new OperationalControlError("SETTINGS_UNAVAILABLE");
  }
  return parsed;
}

function toState(row: PlatformRetentionStateRow): PlatformRetentionState {
  return {
    messageArchivalEnabled: row.message_archival_enabled,
    messageRetentionDays: Number(row.message_retention_days),
    attachmentUndownloadedRetentionDays: Number(row.attachment_undownloaded_retention_days),
    attachmentDownloadedRetentionDays: Number(row.attachment_downloaded_retention_days),
    version: Number(row.version),
    updatedAt: toDate(row.updated_at),
  };
}

const RETENTION_SELECT = `
  message_archival_enabled, message_retention_days,
  attachment_undownloaded_retention_days, attachment_downloaded_retention_days,
  version, updated_at
`;

function boundedDays(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new OperationalControlError("INVALID_STATE");
  }
  return value;
}

async function readState(database: DatabaseClient): Promise<PlatformRetentionState> {
  const rows = await database.unsafe<PlatformRetentionStateRow[]>(
    `SELECT ${RETENTION_SELECT} FROM platform_retention_settings WHERE singleton_key = 'platform' LIMIT 1`,
  );
  const row = rows[0];
  if (row === undefined) throw new OperationalControlError("SETTINGS_UNAVAILABLE");
  return toState(row);
}

export function normalizeRetentionUpdate(
  input: UpdatePlatformRetentionStateInput,
): UpdatePlatformRetentionStateInput {
  if (
    typeof input.messageArchivalEnabled !== "boolean" ||
    typeof input.confirmedCriticalAction !== "boolean"
  ) {
    throw new OperationalControlError("INVALID_STATE");
  }
  if (input.messageArchivalEnabled && !input.confirmedCriticalAction) {
    throw new OperationalControlError("CONFIRMATION_REQUIRED");
  }
  return {
    messageArchivalEnabled: input.messageArchivalEnabled,
    messageRetentionDays: boundedDays(input.messageRetentionDays, 7, 3650),
    attachmentUndownloadedRetentionDays: boundedDays(
      input.attachmentUndownloadedRetentionDays,
      1,
      3650,
    ),
    attachmentDownloadedRetentionDays: boundedDays(
      input.attachmentDownloadedRetentionDays,
      1,
      3650,
    ),
    expectedVersion: assertOperationalVersion(input.expectedVersion),
    confirmedCriticalAction: input.confirmedCriticalAction,
  };
}

export interface PlatformRetentionServiceOptions {
  readonly database: DatabaseClient;
}

export class PlatformRetentionService {
  private readonly database: DatabaseClient;

  public constructor(options: PlatformRetentionServiceOptions) {
    this.database = options.database;
  }

  /** Internal runtime read used by the Worker sweep. */
  public async getRuntimeRetention(): Promise<PlatformRetentionState> {
    return readState(this.database);
  }

  public async getAdminRetention(
    principal: AuthenticatedPrincipal,
  ): Promise<PlatformRetentionState> {
    requirePermission(requireAdmin(principal), "admin.operations.read");
    return readState(this.database);
  }

  public async updateRetention(
    principal: AuthenticatedPrincipal,
    input: UpdatePlatformRetentionStateInput,
    context: RequestAuditContext = {},
  ): Promise<PlatformRetentionState> {
    requirePermission(requireAdmin(principal), "admin.operations.manage");
    const normalized = normalizeRetentionUpdate(input);
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<PlatformRetentionStateRow[]>`
        UPDATE platform_retention_settings
        SET message_archival_enabled = ${normalized.messageArchivalEnabled},
            message_retention_days = ${normalized.messageRetentionDays},
            attachment_undownloaded_retention_days =
              ${normalized.attachmentUndownloadedRetentionDays},
            attachment_downloaded_retention_days =
              ${normalized.attachmentDownloadedRetentionDays},
            version = version + 1,
            updated_by_user_id = ${principal.userId}
        WHERE singleton_key = 'platform' AND version = ${normalized.expectedVersion}
        RETURNING message_archival_enabled, message_retention_days,
                  attachment_undownloaded_retention_days, attachment_downloaded_retention_days,
                  version, updated_at
      `;
      const row = rows[0];
      if (row === undefined) {
        const current = await tx<{ readonly version: number }[]>`
          SELECT version FROM platform_retention_settings WHERE singleton_key = 'platform' LIMIT 1
        `;
        throw new OperationalControlError(
          current.length === 0 ? "SETTINGS_UNAVAILABLE" : "VERSION_CONFLICT",
        );
      }
      const state = toState(row);
      await recordAuditEvent(tx, {
        ...context,
        eventType: "PLATFORM_RETENTION_SETTINGS_UPDATED",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        sessionId: principal.sessionId,
        metadata: {
          messageArchivalEnabled: state.messageArchivalEnabled,
          messageRetentionDays: state.messageRetentionDays,
          attachmentUndownloadedRetentionDays: state.attachmentUndownloadedRetentionDays,
          attachmentDownloadedRetentionDays: state.attachmentDownloadedRetentionDays,
          version: state.version,
        },
      });
      return state;
    });
  }
}
