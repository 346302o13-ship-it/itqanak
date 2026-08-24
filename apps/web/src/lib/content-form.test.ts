import { describe, expect, it } from "vitest";

import { contentBlockFieldsFromForm, contentVersionFromForm } from "./content-form";

function validForm(): FormData {
  const form = new FormData();
  form.set("slug", "welcome-message");
  form.set("target", "STUDENT_DASHBOARD");
  form.set("variant", "HIGHLIGHT");
  form.set("titleAr", "أهلاً بك");
  form.set("titleEn", "Welcome");
  form.set("bodyAr", "نص عربي");
  form.set("bodyEn", "English body");
  form.set("actionLabelAr", "");
  form.set("actionLabelEn", "");
  form.set("actionHref", "");
  form.set("active", "true");
  form.set("sortOrder", "30");
  form.set("version", "4");
  return form;
}

describe("managed content form parsing", () => {
  it("maps a bounded form to the typed service contract", () => {
    expect(contentBlockFieldsFromForm(validForm())).toMatchObject({
      slug: "welcome-message",
      target: "STUDENT_DASHBOARD",
      variant: "HIGHLIGHT",
      actionHref: null,
      active: true,
      sortOrder: 30,
    });
    expect(contentVersionFromForm(validForm())).toBe(4);
  });

  it("rejects arbitrary targets and malformed versions", () => {
    const form = validForm();
    form.set("target", "ADMIN_DASHBOARD");
    expect(() => contentBlockFieldsFromForm(form)).toThrowError("INVALID_TARGET");
    form.set("version", "1e3");
    expect(() => contentVersionFromForm(form)).toThrowError("INVALID_VERSION");
  });
});
