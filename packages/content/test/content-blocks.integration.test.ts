import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal, Permission } from "@itqanak/auth";
import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";

import { ContentBlockService } from "../src/service.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const adminPermissions = [
  "admin.dashboard.view",
  "admin.content.read",
  "admin.content.manage",
] as const satisfies readonly Permission[];

integrationDescribe.sequential("managed content blocks integration", () => {
  let database: DatabaseClient;
  let principal: AuthenticatedPrincipal;
  let content: ContentBlockService;

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
    const userId = randomUUID();
    const sessionId = randomUUID();
    const email = `content-admin-${randomUUID()}@example.test`;
    await database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      await tx`
        INSERT INTO users (
          id, email, email_normalized, display_name, status, email_verified_at
        ) VALUES (
          ${userId}, ${email}, ${email}, 'مدير محتوى اختبار', 'ACTIVE', now()
        )
      `;
      await tx`INSERT INTO user_roles (user_id, role_code) VALUES (${userId}, 'ADMIN')`;
      await tx`
        INSERT INTO user_sessions (
          id, user_id, selector, validator_hash, expires_at, idle_expires_at
        ) VALUES (
          ${sessionId}, ${userId}, ${randomUUID().replaceAll("-", "")},
          ${"c".repeat(64)}, now() + interval '1 day', now() + interval '1 day'
        )
      `;
    });
    principal = {
      userId,
      sessionId,
      displayName: "مدير محتوى اختبار",
      roles: ["ADMIN"],
      permissions: adminPermissions,
      email,
      status: "ACTIVE",
    };
    content = new ContentBlockService({ database });
  });

  afterAll(async () => {
    // Content and security ledgers retain the actor. Remove only the bounded
    // test capability so migration 018's single-admin invariant is available
    // to the following serial suite.
    await database`
      DELETE FROM user_roles
      WHERE user_id = ${principal.userId} AND role_code = 'ADMIN'
    `;
    await closeDatabase(database);
  });

  it("creates, publishes, updates, hides, and soft-deletes bilingual content", async () => {
    const slug = `integration-${randomUUID()}`;
    const created = await content.createBlock(principal, {
      slug,
      target: "LANDING",
      variant: "ANNOUNCEMENT",
      titleAr: "إعلان تكاملي",
      titleEn: "Integration announcement",
      bodyAr: "هذا محتوى آمن للاختبار المتكامل.",
      bodyEn: "This is safe integration-test content.",
      actionLabelAr: "استعرض الخدمات",
      actionLabelEn: "Browse services",
      actionHref: "/ar/services",
      active: true,
      sortOrder: 15,
    });
    expect(created.version).toBe(1);
    await expect(content.listPublishedBlocks("LANDING")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, slug, active: true })]),
    );

    const updated = await content.updateBlock(principal, created.id, {
      ...created,
      titleAr: "إعلان محدّث",
      titleEn: "Updated announcement",
      expectedVersion: created.version,
    });
    expect(updated).toMatchObject({ version: 2, titleEn: "Updated announcement" });
    await expect(
      content.updateBlock(principal, created.id, {
        ...updated,
        expectedVersion: created.version,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const hidden = await content.setBlockVisibility(principal, created.id, {
      active: false,
      expectedVersion: updated.version,
    });
    expect(hidden).toMatchObject({ active: false, version: 3 });
    expect(
      (await content.listPublishedBlocks("LANDING")).some((item) => item.id === created.id),
    ).toBe(false);

    await content.deleteBlock(principal, created.id, { expectedVersion: hidden.version });
    expect((await content.listAdminBlocks(principal)).some((item) => item.id === created.id)).toBe(
      false,
    );
    const events = await database<{ readonly event_type: string }[]>`
      SELECT event_type FROM content_block_events
      WHERE content_block_id = ${created.id}
      ORDER BY id ASC
    `;
    expect(events.map((event) => event.event_type)).toEqual([
      "CREATED",
      "UPDATED",
      "VISIBILITY_CHANGED",
      "DELETED",
    ]);
  });

  it("keeps content history append-only", async () => {
    const event = await database<{ readonly id: string }[]>`
      SELECT id::text AS id FROM content_block_events ORDER BY id DESC LIMIT 1
    `;
    await expect(
      database`
        UPDATE content_block_events SET details = '{"changed":true}'::jsonb
        WHERE id = ${event[0]?.id ?? "0"}::bigint
      `,
    ).rejects.toThrow(/append-only/i);
  });
});
