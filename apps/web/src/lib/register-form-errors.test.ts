import { describe, expect, it } from "vitest";

import { firstErroredField, registerFieldMessages } from "./register-form-errors";

describe("register form error messaging", () => {
  it("maps a known code to a summary plus the matching field message", () => {
    const ar = registerFieldMessages("phone", "ar");
    expect(ar.summary).toBeTruthy();
    expect(ar.phone).toBeTruthy();
    expect(ar.email).toBeUndefined();

    const en = registerFieldMessages("email_taken", "en");
    expect(en.email).toContain("Sign in");
    expect(firstErroredField(en)).toBe("email");
  });

  it("returns a form-level-only summary for page-state codes", () => {
    const csrf = registerFieldMessages("csrf", "ar");
    expect(csrf.summary).toBeTruthy();
    expect(firstErroredField(csrf)).toBeUndefined();
  });

  it("ignores unknown or missing codes", () => {
    expect(registerFieldMessages(undefined, "ar")).toEqual({});
    expect(registerFieldMessages("not-a-code", "en")).toEqual({});
  });

  it("orders the focus target from the top of the form down", () => {
    expect(firstErroredField({ email: "x", password: "y" })).toBe("email");
    expect(firstErroredField({ password: "y", consent: "z" })).toBe("password");
  });
});
