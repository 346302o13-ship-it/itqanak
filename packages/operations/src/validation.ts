import { OperationalControlError, type UpdatePlatformOperationalStateInput } from "./types.js";

function hasUnsafeControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint === 0x7f ||
        (codePoint >= 0 && codePoint <= 0x08) ||
        codePoint === 0x0b ||
        codePoint === 0x0c ||
        (codePoint >= 0x0e && codePoint <= 0x1f))
    ) {
      return true;
    }
  }
  return false;
}

export function normalizeOperationalMessage(value: string): string {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (
    normalized.length < 10 ||
    normalized.length > 1_000 ||
    hasUnsafeControlCharacter(normalized)
  ) {
    throw new OperationalControlError("INVALID_MESSAGE");
  }
  return normalized;
}

export function assertOperationalVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new OperationalControlError("INVALID_VERSION");
  }
  return value;
}

export function normalizeOperationalUpdate(
  input: UpdatePlatformOperationalStateInput,
): UpdatePlatformOperationalStateInput {
  if (
    typeof input.maintenanceEnabled !== "boolean" ||
    typeof input.fileScanQueuePaused !== "boolean" ||
    typeof input.confirmedCriticalAction !== "boolean"
  ) {
    throw new OperationalControlError("INVALID_STATE");
  }
  if ((input.maintenanceEnabled || input.fileScanQueuePaused) && !input.confirmedCriticalAction) {
    throw new OperationalControlError("CONFIRMATION_REQUIRED");
  }
  return {
    maintenanceEnabled: input.maintenanceEnabled,
    maintenanceMessageAr: normalizeOperationalMessage(input.maintenanceMessageAr),
    maintenanceMessageEn: normalizeOperationalMessage(input.maintenanceMessageEn),
    fileScanQueuePaused: input.fileScanQueuePaused,
    expectedVersion: assertOperationalVersion(input.expectedVersion),
    confirmedCriticalAction: input.confirmedCriticalAction,
  };
}
