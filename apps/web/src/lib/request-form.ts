import {
  academicLevels,
  RequestDomainError,
  requestLanguageCodes,
  requestUrgencies,
  type AdminRequestEditInput,
  type DraftRequestInput,
  type UpdateDraftRequestInput,
} from "@itqanak/requests";

import { positiveVersion } from "./request-http";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== "string") {
    return "";
  }
  return value;
}

function requiredText(formData: FormData, field: string): string {
  const value = text(formData, field).trim();
  if (value.length === 0) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  return value;
}

function optionalText(formData: FormData, field: string): string | undefined {
  const value = text(formData, field).trim();
  return value.length === 0 ? undefined : value;
}

function allowlisted<T extends string>(value: string, allowed: readonly T[]): T | null {
  if (value.length === 0) {
    return null;
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  return value as T;
}

function editableFields(formData: FormData): Omit<UpdateDraftRequestInput, "expectedVersion"> {
  const deadlineAt = optionalText(formData, "deadlineAt") ?? null;
  const budgetAmount = optionalText(formData, "budgetAmount") ?? null;
  const budgetCurrency = optionalText(formData, "budgetCurrency") ?? null;
  const languageCode = allowlisted(text(formData, "languageCode").trim(), requestLanguageCodes);
  const academicLevel = allowlisted(text(formData, "academicLevel").trim(), academicLevels);
  const urgency = allowlisted(text(formData, "urgency").trim(), requestUrgencies);
  const institutionName = optionalText(formData, "institutionName") ?? null;

  return {
    title: text(formData, "title"),
    description: text(formData, "description"),
    deadlineAt,
    budgetAmount,
    budgetCurrency,
    languageCode,
    academicLevel,
    institutionName,
    privacyRequested: formData.get("privacyRequested") === "true",
    ...(urgency === null ? {} : { urgency }),
  };
}

export function createDraftInput(formData: FormData): DraftRequestInput {
  return {
    serviceId: requiredText(formData, "serviceId"),
    submissionKey: requiredText(formData, "submissionKey"),
    ...editableFields(formData),
  };
}

export function updateDraftInput(formData: FormData): UpdateDraftRequestInput {
  return {
    ...editableFields(formData),
    expectedVersion: positiveVersion(formData.get("version")),
  };
}

export function adminRequestEditInput(formData: FormData): AdminRequestEditInput {
  const urgency = allowlisted(text(formData, "urgency").trim(), requestUrgencies);
  if (urgency === null) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  return {
    expectedVersion: positiveVersion(formData.get("version")),
    title: requiredText(formData, "title"),
    description: requiredText(formData, "description"),
    deadlineAt: optionalText(formData, "deadlineAt") ?? null,
    urgency,
  };
}

export function requestVersion(formData: FormData): number {
  return positiveVersion(formData.get("version"));
}

export function requestVersionHeader(value: string | null): number {
  if (value === null) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  const formData = new FormData();
  formData.set("version", value);
  return requestVersion(formData);
}

export function attachmentIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)
  ) {
    throw new RequestDomainError("ATTACHMENT_NOT_FOUND");
  }
  return normalized;
}

export function uploadFilename(value: string | null): string {
  if (value === null || value.length < 1 || value.length > 1_024) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  try {
    return decodeURIComponent(value);
  } catch {
    throw new RequestDomainError("INVALID_REQUEST");
  }
}
