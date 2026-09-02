export interface PlatformOperationalState {
  readonly maintenanceEnabled: boolean;
  readonly maintenanceMessageAr: string;
  readonly maintenanceMessageEn: string;
  /** Pauses new scan-job claims. It never marks an unscanned file as safe. */
  readonly fileScanQueuePaused: boolean;
  readonly fileScannerObservedState: FileScannerObservedState;
  readonly fileScannerObservedAt?: Date;
  readonly fileScannerObservedDetail?: string;
  readonly version: number;
  readonly updatedAt: Date;
}

export const fileScannerObservedStates = [
  "UNKNOWN",
  "STARTING",
  "RUNNING",
  "STOPPED",
  "ERROR",
] as const;
export type FileScannerObservedState = (typeof fileScannerObservedStates)[number];

export interface UpdatePlatformOperationalStateInput {
  readonly maintenanceEnabled: boolean;
  readonly maintenanceMessageAr: string;
  readonly maintenanceMessageEn: string;
  readonly fileScanQueuePaused: boolean;
  readonly expectedVersion: number;
  /** Required whenever the resulting state contains an active critical control. */
  readonly confirmedCriticalAction: boolean;
}

export interface PlatformRetentionState {
  readonly messageArchivalEnabled: boolean;
  readonly messageRetentionDays: number;
  /** Days a never-downloaded conversation file is kept before its object is purged. */
  readonly attachmentUndownloadedRetentionDays: number;
  /** Days a downloaded conversation file is kept after the last download. */
  readonly attachmentDownloadedRetentionDays: number;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface UpdatePlatformRetentionStateInput {
  readonly messageArchivalEnabled: boolean;
  readonly messageRetentionDays: number;
  readonly attachmentUndownloadedRetentionDays: number;
  readonly attachmentDownloadedRetentionDays: number;
  readonly expectedVersion: number;
  /** Required to switch message archival ON (it removes message text from the hot table). */
  readonly confirmedCriticalAction: boolean;
}

export const operationalControlErrorCodes = [
  "INVALID_MESSAGE",
  "INVALID_STATE",
  "INVALID_VERSION",
  "CONFIRMATION_REQUIRED",
  "VERSION_CONFLICT",
  "SETTINGS_UNAVAILABLE",
] as const;

export type OperationalControlErrorCode = (typeof operationalControlErrorCodes)[number];

export class OperationalControlError extends Error {
  public constructor(public readonly code: OperationalControlErrorCode) {
    super(code);
    this.name = "OperationalControlError";
  }
}
