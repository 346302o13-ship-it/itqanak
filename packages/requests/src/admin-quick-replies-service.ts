import type { DatabaseClient } from "@itqanak/db";

import { RequestDomainError } from "./errors.js";

export interface AdminQuickReply {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly sortOrder: number;
}

interface DbRow {
  readonly id: string | number;
  readonly title: string;
  readonly body: string;
  readonly sort_order: number | string;
}

const MAX_PER_ADMIN = 40;
const TITLE_MAX = 80;
const BODY_MAX = 2_000;

export interface AdminQuickRepliesServiceOptions {
  readonly database: DatabaseClient;
}

function normalize(input: { readonly title?: unknown; readonly body?: unknown }): {
  title: string;
  body: string;
} {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (
    title.length === 0 ||
    title.length > TITLE_MAX ||
    body.length === 0 ||
    body.length > BODY_MAX
  ) {
    throw new RequestDomainError("INVALID_QUICK_REPLY");
  }
  return { title, body };
}

/**
 * Per-admin canned replies for the support composer. Every query is scoped to
 * the caller's own `adminUserId`; the route that reaches this has already
 * checked the ADMIN role (same split as AssistantHistoryService).
 */
export class AdminQuickRepliesService {
  private readonly database: DatabaseClient;

  public constructor(options: AdminQuickRepliesServiceOptions) {
    this.database = options.database;
  }

  public async list(adminUserId: string): Promise<readonly AdminQuickReply[]> {
    const rows = await this.database<DbRow[]>`
      SELECT id, title, body, sort_order
      FROM admin_quick_replies
      WHERE created_by_user_id = ${adminUserId}
      ORDER BY sort_order ASC, id ASC
    `;
    return rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      body: row.body,
      sortOrder: Number(row.sort_order),
    }));
  }

  public async create(
    adminUserId: string,
    input: { readonly title?: unknown; readonly body?: unknown },
  ): Promise<AdminQuickReply> {
    const { title, body } = normalize(input);
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const [countRow] = await tx<{ count: string }[]>`
        SELECT count(*)::text AS count FROM admin_quick_replies
        WHERE created_by_user_id = ${adminUserId}
      `;
      if (countRow !== undefined && Number(countRow.count) >= MAX_PER_ADMIN) {
        throw new RequestDomainError("QUICK_REPLY_LIMIT");
      }
      const [row] = await tx<DbRow[]>`
        INSERT INTO admin_quick_replies (created_by_user_id, title, body, sort_order)
        VALUES (
          ${adminUserId}, ${title}, ${body},
          COALESCE(
            (SELECT max(sort_order) + 1 FROM admin_quick_replies
             WHERE created_by_user_id = ${adminUserId}),
            0
          )
        )
        RETURNING id, title, body, sort_order
      `;
      if (row === undefined) throw new RequestDomainError("INVALID_QUICK_REPLY");
      return {
        id: String(row.id),
        title: row.title,
        body: row.body,
        sortOrder: Number(row.sort_order),
      };
    });
  }

  public async update(
    adminUserId: string,
    id: string,
    input: { readonly title?: unknown; readonly body?: unknown },
  ): Promise<AdminQuickReply> {
    const { title, body } = normalize(input);
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId < 1) {
      throw new RequestDomainError("QUICK_REPLY_NOT_FOUND");
    }
    const [row] = await this.database<DbRow[]>`
      UPDATE admin_quick_replies
      SET title = ${title}, body = ${body}, updated_at = now()
      WHERE id = ${numericId} AND created_by_user_id = ${adminUserId}
      RETURNING id, title, body, sort_order
    `;
    if (row === undefined) throw new RequestDomainError("QUICK_REPLY_NOT_FOUND");
    return {
      id: String(row.id),
      title: row.title,
      body: row.body,
      sortOrder: Number(row.sort_order),
    };
  }

  public async remove(adminUserId: string, id: string): Promise<void> {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId < 1) {
      throw new RequestDomainError("QUICK_REPLY_NOT_FOUND");
    }
    const rows = await this.database<{ id: string | number }[]>`
      DELETE FROM admin_quick_replies
      WHERE id = ${numericId} AND created_by_user_id = ${adminUserId}
      RETURNING id
    `;
    if (rows.length === 0) throw new RequestDomainError("QUICK_REPLY_NOT_FOUND");
  }
}
