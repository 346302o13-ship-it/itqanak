import { describe, expect, it } from "vitest";

import { RequestDomainError } from "./errors.js";
import {
  assertRequestFieldsSubmittable,
  assertRequestSubmission,
  normalizeDraftRequestInput,
  requestSubmissionFingerprint,
} from "./validation.js";

const now = new Date("2026-08-08T12:00:00.000Z");
const base = {
  serviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  submissionKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  title: "مراجعة عرض تقديمي",
  description: "أحتاج إلى مراجعة تنظيم العرض وتوضيح الأفكار.",
  deadlineAt: "2026-08-10T12:00:00.000Z",
  urgency: "NORMAL" as const,
  budgetAmount: "125.50",
  budgetCurrency: "sar",
  languageCode: "ar" as const,
  academicLevel: "BACHELOR" as const,
  privacyRequested: true,
};

describe("request validation", () => {
  it("normalizes a bounded draft and produces a stable fingerprint", () => {
    const first = normalizeDraftRequestInput(base, now);
    const second = normalizeDraftRequestInput({ ...base }, now);
    expect(first.budgetCurrency).toBe("SAR");
    expect(first.budgetAmount).toBe("125.50");
    expect(requestSubmissionFingerprint(first.serviceId, first)).toBe(
      requestSubmissionFingerprint(second.serviceId, second),
    );
    expect(() => assertRequestFieldsSubmittable(first, now)).not.toThrow();
  });

  it("allows an incomplete draft but rejects it for submission", () => {
    const draft = normalizeDraftRequestInput(
      { serviceId: base.serviceId, submissionKey: base.submissionKey },
      now,
    );
    expect(draft.title).toBe("");
    expect(() => assertRequestFieldsSubmittable(draft, now)).toThrow(RequestDomainError);
  });

  it("rejects stale deadlines, excessive budgets, and malformed submission keys", () => {
    expect(() =>
      normalizeDraftRequestInput({ ...base, deadlineAt: "2026-08-07T00:00:00Z" }, now),
    ).toThrowError(expect.objectContaining({ code: "INVALID_DEADLINE" }));
    expect(() =>
      normalizeDraftRequestInput({ ...base, budgetAmount: "1000001" }, now),
    ).toThrowError(expect.objectContaining({ code: "INVALID_BUDGET" }));
    expect(() =>
      normalizeDraftRequestInput({ ...base, submissionKey: "not-a-uuid" }, now),
    ).toThrowError(expect.objectContaining({ code: "INVALID_SUBMISSION_KEY" }));
    expect(() =>
      normalizeDraftRequestInput({ ...base, deadlineAt: "2026-08-10T12:00:00" }, now),
    ).toThrowError(expect.objectContaining({ code: "INVALID_DEADLINE" }));
  });

  it("uses the canonical academic-integrity policy check at submission", () => {
    const draft = normalizeDraftRequestInput(base, now);
    expect(() => assertRequestSubmission(draft, false, "2026-08", "2026-08", now)).toThrowError(
      expect.objectContaining({ code: "ACADEMIC_INTEGRITY_REQUIRED" }),
    );
    expect(() => assertRequestSubmission(draft, true, "old-version", "2026-08", now)).toThrowError(
      expect.objectContaining({
        code: "ACADEMIC_INTEGRITY_VERSION_MISMATCH",
      }),
    );
    expect(() => assertRequestSubmission(draft, true, "2026-08", "2026-08", now)).not.toThrow();
  });
});
