import {
  recordAuditEvent,
  requireAdmin,
  requirePermission,
  type AuthenticatedPrincipal,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";

import {
  ContentBlockError,
  type ContentBlock,
  type ContentTarget,
  type CreateContentBlockInput,
  type DeleteContentBlockInput,
  type SetContentBlockVisibilityInput,
  type UpdateContentBlockInput,
} from "./types.js";
import {
  assertContentBlockId,
  assertContentTarget,
  assertContentVersion,
  normalizeContentBlockFields,
} from "./validation.js";

interface ContentBlockRow {
  readonly id: string;
  readonly slug: string;
  readonly target: ContentTarget;
  readonly variant: ContentBlock["variant"];
  readonly title_ar: string;
  readonly title_en: string;
  readonly body_ar: string;
  readonly body_en: string;
  readonly action_label_ar: string | null;
  readonly action_label_en: string | null;
  readonly action_href: string | null;
  readonly active: boolean;
  readonly sort_order: number;
  readonly version: number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

export interface ContentBlockServiceOptions {
  readonly database: DatabaseClient;
}

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Content row contains an invalid timestamp.");
  return parsed;
}

function toBlock(row: ContentBlockRow): ContentBlock {
  return {
    id: row.id,
    slug: row.slug,
    target: row.target,
    variant: row.variant,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    bodyAr: row.body_ar,
    bodyEn: row.body_en,
    actionLabelAr: row.action_label_ar,
    actionLabelEn: row.action_label_en,
    actionHref: row.action_href,
    active: row.active,
    sortOrder: Number(row.sort_order),
    version: Number(row.version),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "23505" &&
    "constraint_name" in error &&
    (error as { readonly constraint_name?: unknown }).constraint_name ===
      "content_blocks_live_slug_idx"
  );
}

function requireContentPermission(
  principal: AuthenticatedPrincipal,
  permission: "admin.content.read" | "admin.content.manage",
): AuthenticatedPrincipal {
  return requirePermission(requireAdmin(principal), permission);
}

async function resolveMissingMutation(database: DatabaseClient, id: string): Promise<never> {
  const rows = await database<{ readonly version: number }[]>`
    SELECT version
    FROM content_blocks
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;
  throw new ContentBlockError(rows.length === 0 ? "CONTENT_NOT_FOUND" : "VERSION_CONFLICT");
}

async function recordContentEvent(
  database: DatabaseClient,
  principal: AuthenticatedPrincipal,
  block: ContentBlock,
  eventType: "CREATED" | "UPDATED" | "VISIBILITY_CHANGED" | "DELETED",
  context: RequestAuditContext,
): Promise<void> {
  await database`
    INSERT INTO content_block_events (
      content_block_id, event_type, actor_user_id, version, details
    ) VALUES (
      ${block.id}, ${eventType}, ${principal.userId}, ${block.version},
      ${database.json({ active: block.active, target: block.target, variant: block.variant })}
    )
  `;
  await recordAuditEvent(database, {
    ...context,
    eventType: `CONTENT_BLOCK_${eventType}`,
    outcome: "SUCCESS",
    actorUserId: principal.userId,
    sessionId: principal.sessionId,
    resourceType: "content_block",
    resourceId: block.id,
    metadata: { active: block.active, target: block.target, variant: block.variant },
  });
}

export class ContentBlockService {
  private readonly database: DatabaseClient;

  public constructor(options: ContentBlockServiceOptions) {
    this.database = options.database;
  }

  public async listPublishedBlocks(target: ContentTarget): Promise<readonly ContentBlock[]> {
    const normalizedTarget = assertContentTarget(target);
    const rows = await this.database<ContentBlockRow[]>`
      SELECT
        id, slug, target, variant, title_ar, title_en, body_ar, body_en,
        action_label_ar, action_label_en, action_href, active, sort_order,
        version, created_at, updated_at
      FROM content_blocks
      WHERE target = ${normalizedTarget}
        AND active = TRUE
        AND deleted_at IS NULL
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `;
    return rows.map(toBlock);
  }

  public async listAdminBlocks(
    principal: AuthenticatedPrincipal,
  ): Promise<readonly ContentBlock[]> {
    requireContentPermission(principal, "admin.content.read");
    const rows = await this.database<ContentBlockRow[]>`
      SELECT
        id, slug, target, variant, title_ar, title_en, body_ar, body_en,
        action_label_ar, action_label_en, action_href, active, sort_order,
        version, created_at, updated_at
      FROM content_blocks
      WHERE deleted_at IS NULL
      ORDER BY target ASC, sort_order ASC, updated_at DESC, id ASC
      LIMIT 500
    `;
    return rows.map(toBlock);
  }

  public async createBlock(
    principal: AuthenticatedPrincipal,
    input: CreateContentBlockInput,
    context: RequestAuditContext = {},
  ): Promise<ContentBlock> {
    requireContentPermission(principal, "admin.content.manage");
    const fields = normalizeContentBlockFields(input);
    try {
      return await this.database.begin(async (transaction) => {
        const tx = transaction as DatabaseClient;
        const rows = await tx<ContentBlockRow[]>`
          INSERT INTO content_blocks (
            slug, target, variant, title_ar, title_en, body_ar, body_en,
            action_label_ar, action_label_en, action_href, active, sort_order,
            created_by_user_id, updated_by_user_id
          ) VALUES (
            ${fields.slug}, ${fields.target}, ${fields.variant},
            ${fields.titleAr}, ${fields.titleEn}, ${fields.bodyAr}, ${fields.bodyEn},
            ${fields.actionLabelAr}, ${fields.actionLabelEn}, ${fields.actionHref},
            ${fields.active}, ${fields.sortOrder}, ${principal.userId}, ${principal.userId}
          )
          RETURNING
            id, slug, target, variant, title_ar, title_en, body_ar, body_en,
            action_label_ar, action_label_en, action_href, active, sort_order,
            version, created_at, updated_at
        `;
        const row = rows[0];
        if (row === undefined) throw new Error("Content insert did not return a row.");
        const block = toBlock(row);
        await recordContentEvent(tx, principal, block, "CREATED", context);
        return block;
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new ContentBlockError("SLUG_CONFLICT");
      throw error;
    }
  }

  public async updateBlock(
    principal: AuthenticatedPrincipal,
    id: string,
    input: UpdateContentBlockInput,
    context: RequestAuditContext = {},
  ): Promise<ContentBlock> {
    requireContentPermission(principal, "admin.content.manage");
    const blockId = assertContentBlockId(id);
    const expectedVersion = assertContentVersion(input.expectedVersion);
    const fields = normalizeContentBlockFields(input);
    try {
      return await this.database.begin(async (transaction) => {
        const tx = transaction as DatabaseClient;
        const rows = await tx<ContentBlockRow[]>`
          UPDATE content_blocks
          SET
            slug = ${fields.slug},
            target = ${fields.target},
            variant = ${fields.variant},
            title_ar = ${fields.titleAr},
            title_en = ${fields.titleEn},
            body_ar = ${fields.bodyAr},
            body_en = ${fields.bodyEn},
            action_label_ar = ${fields.actionLabelAr},
            action_label_en = ${fields.actionLabelEn},
            action_href = ${fields.actionHref},
            active = ${fields.active},
            sort_order = ${fields.sortOrder},
            updated_by_user_id = ${principal.userId},
            updated_at = now(),
            version = version + 1
          WHERE id = ${blockId}
            AND version = ${expectedVersion}
            AND deleted_at IS NULL
          RETURNING
            id, slug, target, variant, title_ar, title_en, body_ar, body_en,
            action_label_ar, action_label_en, action_href, active, sort_order,
            version, created_at, updated_at
        `;
        const row = rows[0];
        if (row === undefined) return resolveMissingMutation(tx, blockId);
        const block = toBlock(row);
        await recordContentEvent(tx, principal, block, "UPDATED", context);
        return block;
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new ContentBlockError("SLUG_CONFLICT");
      throw error;
    }
  }

  public async setBlockVisibility(
    principal: AuthenticatedPrincipal,
    id: string,
    input: SetContentBlockVisibilityInput,
    context: RequestAuditContext = {},
  ): Promise<ContentBlock> {
    requireContentPermission(principal, "admin.content.manage");
    const blockId = assertContentBlockId(id);
    const expectedVersion = assertContentVersion(input.expectedVersion);
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<ContentBlockRow[]>`
        UPDATE content_blocks
        SET
          active = ${input.active},
          updated_by_user_id = ${principal.userId},
          updated_at = now(),
          version = version + 1
        WHERE id = ${blockId}
          AND version = ${expectedVersion}
          AND deleted_at IS NULL
        RETURNING
          id, slug, target, variant, title_ar, title_en, body_ar, body_en,
          action_label_ar, action_label_en, action_href, active, sort_order,
          version, created_at, updated_at
      `;
      const row = rows[0];
      if (row === undefined) return resolveMissingMutation(tx, blockId);
      const block = toBlock(row);
      await recordContentEvent(tx, principal, block, "VISIBILITY_CHANGED", context);
      return block;
    });
  }

  public async deleteBlock(
    principal: AuthenticatedPrincipal,
    id: string,
    input: DeleteContentBlockInput,
    context: RequestAuditContext = {},
  ): Promise<void> {
    requireContentPermission(principal, "admin.content.manage");
    const blockId = assertContentBlockId(id);
    const expectedVersion = assertContentVersion(input.expectedVersion);
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const rows = await tx<ContentBlockRow[]>`
        UPDATE content_blocks
        SET
          active = FALSE,
          deleted_at = now(),
          deleted_by_user_id = ${principal.userId},
          updated_by_user_id = ${principal.userId},
          updated_at = now(),
          version = version + 1
        WHERE id = ${blockId}
          AND version = ${expectedVersion}
          AND deleted_at IS NULL
        RETURNING
          id, slug, target, variant, title_ar, title_en, body_ar, body_en,
          action_label_ar, action_label_en, action_href, active, sort_order,
          version, created_at, updated_at
      `;
      const row = rows[0];
      if (row === undefined) return resolveMissingMutation(tx, blockId);
      await recordContentEvent(tx, principal, toBlock(row), "DELETED", context);
    });
  }
}
