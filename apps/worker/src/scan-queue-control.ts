import type { PlatformOperationalState } from "@itqanak/operations";

/**
 * A desired enable is not enough to claim work: the host reconciler must first
 * confirm that the opt-in ClamAV service is healthy. Pausing never converts an
 * existing scan result and always stops new claims immediately.
 */
export function shouldProcessAttachmentScans(
  state: Pick<PlatformOperationalState, "fileScanQueuePaused" | "fileScannerObservedState">,
): boolean {
  return !state.fileScanQueuePaused && state.fileScannerObservedState === "RUNNING";
}
