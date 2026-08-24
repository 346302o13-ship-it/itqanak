import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";

import { RequestDomainError } from "./errors.js";

export type NewAttachmentScanStatus =
  | "PENDING_SCAN"
  | "SCAN_SKIPPED_DEVELOPMENT"
  | "SCAN_SKIPPED_BY_ADMIN";

/**
 * Resolves the policy while sharing the singleton row with an administrator
 * update. That lock makes the upload's provenance deterministic at finalization:
 * it is either queued under the enabled policy or explicitly recorded skipped.
 */
export async function resolveNewAttachmentScanStatus(
  database: DatabaseClient,
  config: Pick<AppConfig, "nodeEnv" | "fileScanning">,
): Promise<NewAttachmentScanStatus> {
  if (config.fileScanning.mode === "disabled") {
    return "SCAN_SKIPPED_DEVELOPMENT";
  }
  if (config.nodeEnv !== "production") {
    return "PENDING_SCAN";
  }
  const rows = await database<{ readonly file_scan_queue_paused: boolean }[]>`
    SELECT file_scan_queue_paused
    FROM platform_operational_settings
    WHERE singleton_key = 'platform'
    FOR SHARE
  `;
  const state = rows[0];
  if (state === undefined) {
    throw new RequestDomainError("ATTACHMENT_STATE_INVALID");
  }
  return state.file_scan_queue_paused ? "SCAN_SKIPPED_BY_ADMIN" : "PENDING_SCAN";
}
