import { describe, expect, it } from "vitest";

import { RequestDomainError } from "@itqanak/requests";

import {
  adminRequestEditInput,
  attachmentIdentifier,
  createDraftInput,
  requestVersionHeader,
  updateDraftInput,
  uploadFilename,
} from "./request-form";

describe("student request form boundary", () => {
  it("normalizes only explicit HTTP form fields", () => {
    const form = new FormData();
    form.set("serviceId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    form.set("submissionKey", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    form.set("title", "  عنوان آمن  ");
    form.set("description", " وصف الطلب ");
    form.set("urgency", "URGENT");
    form.set("languageCode", "ar");
    form.set("privacyRequested", "true");

    expect(createDraftInput(form)).toMatchObject({
      serviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      submissionKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "  عنوان آمن  ",
      description: " وصف الطلب ",
      urgency: "URGENT",
      languageCode: "ar",
      privacyRequested: true,
    });
  });

  it("rejects invalid allowlists, versions, and attachment identifiers", () => {
    const form = new FormData();
    form.set("serviceId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    form.set("submissionKey", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    form.set("urgency", "NOW");

    expect(() => createDraftInput(form)).toThrow(RequestDomainError);
    expect(() => requestVersionHeader("0 OR 1=1")).toThrow(RequestDomainError);
    expect(() => attachmentIdentifier("../../private")).toThrow(RequestDomainError);
  });

  it("accepts percent-encoded Unicode filenames and rejects malformed escapes", () => {
    expect(uploadFilename(encodeURIComponent("مشروع.pdf"))).toBe("مشروع.pdf");
    expect(() => uploadFilename("%not-encoded")).toThrow(RequestDomainError);
  });

  it("preserves explicit clears for every optional draft field", () => {
    const form = new FormData();
    form.set("version", "7");
    form.set("title", "عنوان المسودة");
    form.set("description", "وصف المسودة القابل للتعديل");

    expect(updateDraftInput(form)).toMatchObject({
      expectedVersion: 7,
      deadlineAt: null,
      budgetAmount: null,
      budgetCurrency: null,
      languageCode: null,
      academicLevel: null,
      institutionName: null,
    });
  });

  it("parses only the allowlisted administrative request fields", () => {
    const form = new FormData();
    form.set("version", "4");
    form.set("title", "عنوان محدث");
    form.set("description", "وصف محدث يظل ضمن الطلب نفسه.");
    form.set("deadlineAt", "2026-08-20T12:00:00.000Z");
    form.set("urgency", "URGENT");
    form.set("studentUserId", "attacker-controlled-owner");
    form.set("serviceId", "attacker-controlled-service");

    expect(adminRequestEditInput(form)).toEqual({
      expectedVersion: 4,
      title: "عنوان محدث",
      description: "وصف محدث يظل ضمن الطلب نفسه.",
      deadlineAt: "2026-08-20T12:00:00.000Z",
      urgency: "URGENT",
    });
  });
});
