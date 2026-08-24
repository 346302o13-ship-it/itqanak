import {
  createRequestSubmissionFingerprint,
  normalizeSubmissionKey,
  RequestValidationError,
  validateDraftRequestInput,
  validateSubmittableRequest,
  type ValidatedDraftRequestInput,
  type RequestBudgetCurrency,
} from "@itqanak/core";

import { RequestDomainError } from "./errors.js";
import type { DraftRequestInput, NormalizedRequestFields } from "./types.js";

function mapValidationError(error: unknown): never {
  if (!(error instanceof RequestValidationError)) {
    throw error;
  }
  const fields = new Set(error.issues.map((item) => item.field));
  if (fields.has("submissionKey")) {
    throw new RequestDomainError("INVALID_SUBMISSION_KEY");
  }
  if (fields.has("deadlineAt")) {
    throw new RequestDomainError("INVALID_DEADLINE");
  }
  if (fields.has("budgetAmount") || fields.has("budgetCurrency")) {
    throw new RequestDomainError("INVALID_BUDGET");
  }
  if (fields.has("academicIntegrityVersion")) {
    throw new RequestDomainError("ACADEMIC_INTEGRITY_VERSION_MISMATCH");
  }
  if (fields.has("academicIntegrityAccepted")) {
    throw new RequestDomainError("ACADEMIC_INTEGRITY_REQUIRED");
  }
  throw new RequestDomainError("INVALID_REQUEST");
}

function toNormalizedFields(value: ValidatedDraftRequestInput): NormalizedRequestFields {
  return {
    title: value.title,
    description: value.description,
    urgency: value.urgency,
    privacyRequested: value.privacyRequested,
    ...(value.deadlineAt === null ? {} : { deadlineAt: value.deadlineAt }),
    ...(value.budgetAmount === null ? {} : { budgetAmount: value.budgetAmount }),
    ...(value.budgetCurrency === null ? {} : { budgetCurrency: value.budgetCurrency }),
    ...(value.languageCode === null ? {} : { languageCode: value.languageCode }),
    ...(value.academicLevel === null ? {} : { academicLevel: value.academicLevel }),
    ...(value.institutionName === null ? {} : { institutionName: value.institutionName }),
  };
}

export function normalizeDraftRequestInput(
  input: DraftRequestInput,
  now = new Date(),
): { readonly serviceId: string; readonly submissionKey: string } & NormalizedRequestFields {
  try {
    const validated = validateDraftRequestInput(input, { now });
    return {
      serviceId: validated.serviceId,
      submissionKey: validated.submissionKey,
      ...toNormalizedFields(validated),
    };
  } catch (error: unknown) {
    return mapValidationError(error);
  }
}

export function assertRequestFieldsSubmittable(
  fields: NormalizedRequestFields,
  now = new Date(),
): void {
  try {
    validateSubmittableRequest(
      {
        serviceId: "00000000-0000-4000-8000-000000000000",
        submissionKey: "00000000-0000-4000-8000-000000000001",
        ...fields,
        academicIntegrityAccepted: true,
        academicIntegrityVersion: "validated-by-service",
      },
      { now, expectedAcademicIntegrityVersion: "validated-by-service" },
    );
  } catch (error: unknown) {
    mapValidationError(error);
  }
}

export function assertRequestSubmission(
  fields: NormalizedRequestFields,
  acceptedAcademicIntegrity: boolean,
  academicIntegrityVersion: string,
  expectedAcademicIntegrityVersion: string,
  now = new Date(),
): void {
  try {
    validateSubmittableRequest(
      {
        serviceId: "00000000-0000-4000-8000-000000000000",
        submissionKey: "00000000-0000-4000-8000-000000000001",
        ...fields,
        academicIntegrityAccepted: acceptedAcademicIntegrity,
        academicIntegrityVersion,
      },
      { now, expectedAcademicIntegrityVersion },
    );
  } catch (error: unknown) {
    mapValidationError(error);
  }
}

export function requestSubmissionFingerprint(
  serviceId: string,
  fields: NormalizedRequestFields,
): string {
  // `fields` are already the output of normalizeDraftRequestInput. Re-running
  // time-sensitive deadline validation here would make an idempotency key
  // change from valid to invalid merely because time passed between requests.
  return createRequestSubmissionFingerprint({
    serviceId,
    submissionKey: normalizeSubmissionKey("00000000-0000-4000-8000-000000000001"),
    requestKind: "SERVICE",
    title: fields.title,
    description: fields.description,
    deadlineAt: fields.deadlineAt ?? null,
    urgency: fields.urgency,
    budgetAmount: fields.budgetAmount ?? null,
    budgetCurrency: (fields.budgetCurrency as RequestBudgetCurrency | undefined) ?? null,
    languageCode: fields.languageCode ?? null,
    academicLevel: fields.academicLevel ?? null,
    institutionName: fields.institutionName ?? null,
    privacyRequested: fields.privacyRequested,
    academicIntegrityAccepted: false,
    academicIntegrityVersion: null,
  });
}
