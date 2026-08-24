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
  type PlatformOperationalState,
  type UpdatePlatformOperationalStateInput,
} from "./types.js";
import { normalizeOperationalUpdate } from "./validation.js";

interface PlatformOperationalStateRow {
  readonly maintenance_enabled: boolean;
  readonly maintenance_message_ar: string;
  readonly maintenance_message_en: string;
  readonly file_scan_queue_paused: boolean;
  readonly file_scanner_observed_state: PlatformOperationalState["fileScannerObservedState"];
  readonly file_scanner_observed_at: Date | string | null;
  readonly file_scanner_observed_detail: string | null;
  readonly version: number;
  readonly updated_at: Date | string;
}

export interface PlatformOperationsServiceOptions {
  readonly database: DatabaseClient;
}

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new OperationalControlError("SETTINGS_UNAVAILABLE");
  }
  return parsed;
}

function toState(row: PlatformOperationalStateRow): PlatformOperationalState {
  return {
    maintenanceEnabled: row.maintenance_enabled,
    maintenanceMessageAr: row.maintenance_message_ar,
    maintenanceMessageEn: row.maintenance_message_en,
    fileScanQueuePaused: row.file_scan_queue_paused,
    fileScannerObservedState: row.file_scanner_observed_state,
    ...(row.file_scanner_observed_at === null
      ? {}
      : { fileScannerObservedAt: toDate(row.file_scanner_observed_at) }),
    ...(row.file_scanner_observed_detail === null
      ? {}
      : { fileScannerObservedDetail: row.file_scanner_observed_detail }),
    version: Number(row.version),
    updatedAt: toDate(row.updated_at),
  };
}

function requireOperationsPermission(
  principal: AuthenticatedPrincipal,
  permission: "admin.operations.read" | "admin.operations.manage",
): AuthenticatedPrincipal {
  return requirePermission(requireAdmin(principal), permission);
}

async function readState(database: DatabaseClient): Promise<PlatformOperationalState> {
  const rows = await database<PlatformOperationalStateRow[]>`
    SELECT
      maintenance_enabled,
      maintenance_message_ar,
      maintenance_message_en,
      file_scan_queue_paused,
      file_scanner_observed_state,
      file_scanner_observed_at,
      file_scanner_observed_detail,
      version,
      updated_at
    FROM platform_operational_settings
    WHERE singleton_key = 'platform'
    LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) throw new OperationalControlError("SETTINGS_UNAVAILABLE");
  return toState(row);
}

export class PlatformOperationsService {
  private readonly database: DatabaseClient;

  public constructor(options: PlatformOperationsServiceOptions) {
    this.database = options.database;
  }

  /** Internal runtime read used by the request gate and Worker. */
  public async getRuntimeState(): Promise<PlatformOperationalState> {
    return readState(this.database);
  }

  public async getAdminState(principal: AuthenticatedPrincipal): Promise<PlatformOperationalState> {
    requireOperationsPermission(principal, "admin.operations.read");
    return readState(this.database);
  }

  public async updateState(
    principal: AuthenticatedPrincipal,
    input: UpdatePlatformOperationalStateInput,
    context: RequestAuditContext = {},
  ): Promise<PlatformOperationalState> {
    requireOperationsPermission(principal, "admin.operations.manage");
    const normalized = normalizeOperationalUpdate(input);
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<PlatformOperationalStateRow[]>`
        UPDATE platform_operational_settings
        SET
          maintenance_enabled = ${normalized.maintenanceEnabled},
          maintenance_message_ar = ${normalized.maintenanceMessageAr},
          maintenance_message_en = ${normalized.maintenanceMessageEn},
          file_scan_queue_paused = ${normalized.fileScanQueuePaused},
          version = version + 1,
          updated_by_user_id = ${principal.userId}
        WHERE singleton_key = 'platform'
          AND version = ${normalized.expectedVersion}
        RETURNING
          maintenance_enabled,
          maintenance_message_ar,
          maintenance_message_en,
          file_scan_queue_paused,
          file_scanner_observed_state,
          file_scanner_observed_at,
          file_scanner_observed_detail,
          version,
          updated_at
      `;
      const row = rows[0];
      if (row === undefined) {
        const current = await tx<{ readonly version: number }[]>`
          SELECT version
          FROM platform_operational_settings
          WHERE singleton_key = 'platform'
          LIMIT 1
        `;
        throw new OperationalControlError(
          current.length === 0 ? "SETTINGS_UNAVAILABLE" : "VERSION_CONFLICT",
        );
      }
      const state = toState(row);
      await recordAuditEvent(tx, {
        ...context,
        eventType: "PLATFORM_OPERATIONAL_SETTINGS_UPDATED",
        outcome: "SUCCESS",
        actorUserId: principal.userId,
        sessionId: principal.sessionId,
        metadata: {
          maintenanceEnabled: state.maintenanceEnabled,
          fileScanQueuePaused: state.fileScanQueuePaused,
          version: state.version,
        },
      });
      return state;
    });
  }
}
