import {
  assertOperationalVersion,
  OperationalControlError,
  type UpdatePlatformOperationalStateInput,
} from "@itqanak/operations";

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function strictBoolean(formData: FormData, key: string): boolean {
  const value = formValue(formData, key);
  if (value !== "true" && value !== "false") {
    throw new OperationalControlError("INVALID_STATE");
  }
  return value === "true";
}

function version(formData: FormData): number {
  const value = formValue(formData, "version");
  if (!/^\d{1,9}$/u.test(value)) {
    throw new OperationalControlError("INVALID_VERSION");
  }
  return assertOperationalVersion(Number(value));
}

export function operationalUpdateFromForm(formData: FormData): UpdatePlatformOperationalStateInput {
  return {
    maintenanceEnabled: strictBoolean(formData, "maintenanceEnabled"),
    maintenanceMessageAr: formValue(formData, "maintenanceMessageAr"),
    maintenanceMessageEn: formValue(formData, "maintenanceMessageEn"),
    fileScanQueuePaused: strictBoolean(formData, "fileScanQueuePaused"),
    expectedVersion: version(formData),
    confirmedCriticalAction: formValue(formData, "confirmCriticalAction") === "true",
  };
}
