import { describe, expect, it } from "vitest";

import { hasAdminAccess, hasPermission, requireAdmin, requirePermission } from "./authorization.js";
import { permissionCodes, type AuthenticatedPrincipal } from "./types.js";

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

  it("recognizes every Phase 3 permission as a typed, explicit capability", () => {
    expect(permissionCodes).toEqual(
      expect.arrayContaining([
        "catalog.read",
        "requests.create",
        "requests.read.own",
        "requests.update.own",
        "requests.cancel.own",
        "requests.attachments.create.own",
        "requests.attachments.read.own",
        "requests.attachments.delete.own",
        "requests.chat.read.own",
        "requests.chat.send.own",
        "admin.requests.read",
        "admin.requests.manage",
        "admin.requests.assign",
        "admin.requests.chat.read",
        "admin.requests.chat.send",
        "admin.requests.attachments.create",
        "admin.requests.attachments.read",
        "admin.catalog.read",
        "admin.catalog.manage",
        "admin.content.read",
        "admin.content.manage",
        "admin.passwordresets.read",
        "admin.passwordresets.manage",
        "admin.operations.read",
        "admin.operations.manage",
        "support.chat.read.own",
        "support.chat.send.own",
        "admin.support.chat.read",
        "admin.support.chat.send",
        "finance.read.own",
        "admin.finance.read",
        "admin.finance.manage",
        "admin.finance.reports.read",
      ]),
    );
  });

  it("does not infer student ownership or administrator capabilities from a role", () => {
    const studentWithoutGrant = principal(["STUDENT"]);
    const adminWithoutGrant = principal(["ADMIN"]);

    expect(hasPermission(studentWithoutGrant, "requests.read.own")).toBe(false);
    expect(hasPermission(adminWithoutGrant, "admin.requests.manage")).toBe(false);
    expect(() => requirePermission(adminWithoutGrant, "admin.catalog.manage")).toThrow(
      "required permission",
    );
  });

  it("allows only the exact permission explicitly attached to the principal", () => {
    const student = principal(["STUDENT"], ["requests.read.own"]);

    expect(requirePermission(student, "requests.read.own")).toBe(student);
    expect(hasPermission(student, "requests.update.own")).toBe(false);
    expect(hasPermission(student, "admin.requests.read")).toBe(false);
  });
});
