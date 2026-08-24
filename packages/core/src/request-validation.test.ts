import { describe, expect, it } from "vitest";

import {
  assertBudget,
  assertDeadline,
  createRequestSubmissionFingerprint,
  RequestValidationError,
  validateDraftRequestInput,
  validateSubmittableRequest,
} from "./request-validation.js";

const now = new Date("2026-08-08T12:00:00.000Z");
const validInput = {
  serviceId: "901d3995-22cf-4d54-9380-ca729e093be1",
  submissionKey: "2579b66f-7912-44dd-8a5a-dada5127e585",
  title: "مراجعة العرض التقديمي",
  description: "أحتاج إلى مراجعة تنظيم العرض وتوضيح الملاحظات التعليمية.",
  deadlineAt: "2026-08-15T12:00:00.000Z",
  urgency: "NORMAL",
  budgetAmount: "150.5",
  budgetCurrency: "sar",
  languageCode: "AR",
  academicLevel: "bachelor",
  institutionName: "جامعة تجريبية",
  privacyRequested: true,
  academicIntegrityAccepted: true,
  academicIntegrityVersion: "2026-08",
} as const;

describe("request validation", () => {
  it("allows an intentionally incomplete draft and normalizes its safe fields", () => {
    const draft = validateDraftRequestInput(
      {
        serviceId: validInput.serviceId,
        submissionKey: validInput.submissionKey,
        title: "",
        description: "",
      },
      { now },
    );

    expect(draft.title).toBe("");
    expect(draft.description).toBe("");
    expect(draft.requestKind).toBe("SERVICE");
    expect(draft.urgency).toBe("NORMAL");
    expect(draft.deadlineAt).toBeNull();
  });

  it("normalizes money without floating point storage", () => {
    expect(assertBudget("000150.5", "sar")).toEqual({ amount: "150.50", currency: "SAR" });
    expect(assertBudget(0, "USD")).toEqual({ amount: "0.00", currency: "USD" });
    expect(() => assertBudget("1.001", "SAR")).toThrow(RequestValidationError);
    expect(() => assertBudget("1", undefined)).toThrow(RequestValidationError);
  });

  it("requires an absolute, future, reasonably bounded deadline", () => {
    expect(assertDeadline("2026-08-09T12:00:00Z", { now })?.toISOString()).toBe(
      "2026-08-09T12:00:00.000Z",
    );
    expect(() => assertDeadline("2026-08-09T12:00:00", { now })).toThrow(RequestValidationError);
    expect(() => assertDeadline("2026-08-01T12:00:00Z", { now })).toThrow(RequestValidationError);
    expect(() => assertDeadline("2030-08-01T12:00:00Z", { now })).toThrow(RequestValidationError);
  });

  it("enforces required submission fields and the current integrity policy", () => {
    expect(
      validateSubmittableRequest(validInput, {
        now,
        expectedAcademicIntegrityVersion: "2026-08",
      }).budgetAmount,
    ).toBe("150.50");

    expect(() =>
      validateSubmittableRequest(
        { ...validInput, academicIntegrityVersion: "2025-01" },
        { now, expectedAcademicIntegrityVersion: "2026-08" },
      ),
    ).toThrow(RequestValidationError);
    expect(() =>
      validateSubmittableRequest(
        { ...validInput, title: "", description: "" },
        { now, expectedAcademicIntegrityVersion: "2026-08" },
      ),
    ).toThrow(RequestValidationError);
  });

  it("rejects non-service request kinds in Phase 3", () => {
    expect(() =>
      validateDraftRequestInput({ ...validInput, requestKind: "CONVERSATION" }, { now }),
    ).toThrow(RequestValidationError);
  });

  it("creates a stable SHA-256 fingerprint without including the submission key", async () => {
    const first = validateDraftRequestInput(validInput, { now });
    const second = validateDraftRequestInput(
      {
        ...validInput,
        submissionKey: "9113ab2c-c42f-49fa-b0b9-8e2857065e16",
      },
      { now },
    );
    const firstFingerprint = await createRequestSubmissionFingerprint(first);
    const secondFingerprint = await createRequestSubmissionFingerprint(second);

    expect(firstFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(secondFingerprint).toBe(firstFingerprint);
    expect(
      await createRequestSubmissionFingerprint({ ...first, title: "عنوان آخر صالح" }),
    ).not.toBe(firstFingerprint);
  });
});
