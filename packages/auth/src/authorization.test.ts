import { describe, expect, it } from "vitest";

import { hasAdminAccess, requireAdmin } from "./authorization.js";
import type { AuthenticatedPrincipal } from "./types.js";

function principal(
  roles: AuthenticatedPrincipal["roles"],
  permissions: AuthenticatedPrincipal["permissions"] = [],
): AuthenticatedPrincipal {
  return {
    userId: "user-1",
    sessionId: "session-1",
    roles,
    permissions,
    displayName: "طالب اختبار",
    email: "student@example.test",
    status: "ACTIVE",
  };
}

describe("authorization", () => {
  it("requires an administrator role for administration", () => {
    expect(hasAdminAccess(principal(["STUDENT"]))).toBe(false);
    expect(() => requireAdmin(principal(["STUDENT"]))).toThrow("required permission");
  });

  it("requires ADMIN and an explicit dashboard permission", () => {
    expect(hasAdminAccess(principal(["ADMIN"]))).toBe(false);
    expect(hasAdminAccess(principal(["ADMIN"], ["admin.dashboard.view"]))).toBe(true);
  });
});
