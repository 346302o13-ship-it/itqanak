import type { AuthenticatedPrincipal } from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";
import { describe, expect, it } from "vitest";

import { ContentBlockService } from "./service.js";

function principal(permissions: AuthenticatedPrincipal["permissions"]): AuthenticatedPrincipal {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    displayName: "مدير المحتوى",
    roles: ["ADMIN"],
    permissions,
    status: "ACTIVE",
  };
}

function queryDatabase(
  rows: readonly Readonly<Record<string, unknown>>[],
  statements: string[],
): DatabaseClient {
  const query = async (strings: TemplateStringsArray): Promise<readonly unknown[]> => {
    statements.push(strings.join("?"));
    return rows;
  };
  return query as unknown as DatabaseClient;
}

describe("ContentBlockService", () => {
  it("publishes only through the constrained target query and preserves ordering", async () => {
    const statements: string[] = [];
    const service = new ContentBlockService({
      database: queryDatabase(
        [
          {
            id: "11111111-1111-4111-8111-111111111111",
            slug: "welcome",
            target: "LANDING",
            variant: "INFO",
            title_ar: "مرحباً بك",
            title_en: "Welcome",
            body_ar: "محتوى عربي",
            body_en: "English content",
            action_label_ar: null,
            action_label_en: null,
            action_href: null,
            active: true,
            sort_order: 10,
            version: 1,
            created_at: "2026-08-13T00:00:00.000Z",
            updated_at: "2026-08-13T00:00:00.000Z",
          },
        ],
        statements,
      ),
    });

    await expect(service.listPublishedBlocks("LANDING")).resolves.toMatchObject([
      { slug: "welcome", active: true, titleEn: "Welcome" },
    ]);
    expect(statements[0]).toContain("active = TRUE");
    expect(statements[0]).toContain("deleted_at IS NULL");
    expect(statements[0]).toContain("ORDER BY sort_order ASC");
  });

  it("refuses admin reads without the explicit content permission before querying", async () => {
    const statements: string[] = [];
    const service = new ContentBlockService({ database: queryDatabase([], statements) });

    await expect(service.listAdminBlocks(principal(["admin.dashboard.view"]))).rejects.toThrow(
      "required permission",
    );
    expect(statements).toHaveLength(0);
  });

  it("does not treat the manage permission as an implied read permission", async () => {
    const statements: string[] = [];
    const service = new ContentBlockService({ database: queryDatabase([], statements) });

    await expect(
      service.listAdminBlocks(principal(["admin.dashboard.view", "admin.content.manage"])),
    ).rejects.toThrow("required permission");
    expect(statements).toHaveLength(0);
  });

  it("does not treat read access as permission to mutate content", async () => {
    const statements: string[] = [];
    const service = new ContentBlockService({ database: queryDatabase([], statements) });

    await expect(
      service.createBlock(principal(["admin.dashboard.view", "admin.content.read"]), {
        slug: "denied-change",
        target: "LANDING",
        variant: "INFO",
        titleAr: "تغيير مرفوض",
        titleEn: "Denied change",
        bodyAr: "لا يجب أن يصل هذا النص إلى قاعدة البيانات.",
        bodyEn: "This text must never reach the database.",
        actionLabelAr: null,
        actionLabelEn: null,
        actionHref: null,
        active: false,
        sortOrder: 10,
      }),
    ).rejects.toThrow("required permission");
    expect(statements).toHaveLength(0);
  });
});
