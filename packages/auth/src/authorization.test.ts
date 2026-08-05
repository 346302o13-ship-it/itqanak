import { describe, expect, it } from "vitest";

import { hasAdminAccess, requireAdmin } from "./authorization.js";

describe("authorization", () => {
  it("requires an administrator role for administration", () => {
    expect(hasAdminAccess({ subjectId: "student-1", roles: ["STUDENT"] })).toBe(false);
    expect(() => requireAdmin({ subjectId: "student-1", roles: ["STUDENT"] })).toThrow(
      "required permission",
    );
  });

  it("permits the system principal", () => {
    expect(hasAdminAccess({ subjectId: "system", roles: ["SYSTEM"] })).toBe(true);
  });
});
