import type { DatabaseClient } from "@itqanak/db";

/** Mirrors @itqanak/ai's GeminiPart/GeminiContent shape exactly (this package
 *  does not depend on @itqanak/ai, which stays framework/DB-agnostic) — a
 *  stored row round-trips straight back into a chat call with no
 *  transformation. */
export interface AssistantMessageRow {
  readonly role: "user" | "model";
  readonly parts: readonly Record<string, unknown>[];
}

interface DbRow {
  readonly role: string;
  readonly parts: unknown;
}

const MAX_HISTORY_TURNS = 40;

export interface AssistantHistoryServiceOptions {
  readonly database: DatabaseClient;
}

/**
 * Persists the AI assistant's turns per signed-in user (student or admin) —
 * the same durability every other conversation in this platform already has.
 * Deliberately minimal: no permission checks here, since every caller already
 * resolved and verified its own `principal` before reaching this service, and
 * a user can only ever read/append their own rows (always keyed by their own
 * `userId`, never an arbitrary one).
 */
export class AssistantHistoryService {
  private readonly database: DatabaseClient;

  public constructor(options: AssistantHistoryServiceOptions) {
    this.database = options.database;
  }

  public async listRecent(userId: string): Promise<readonly AssistantMessageRow[]> {
    const rows = await this.database<DbRow[]>`
      SELECT role, parts FROM (
        SELECT role, parts, created_at, id
        FROM assistant_messages
        WHERE user_id = ${userId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${MAX_HISTORY_TURNS}
      ) AS recent
      ORDER BY created_at ASC, id ASC
    `;
    return rows.map((row) => ({
      role: row.role === "model" ? "model" : "user",
      parts: Array.isArray(row.parts) ? (row.parts as Record<string, unknown>[]) : [],
    }));
  }

  public async append(userId: string, turns: readonly AssistantMessageRow[]): Promise<void> {
    if (turns.length === 0) return;
    await this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      for (const turn of turns) {
        await tx`
          INSERT INTO assistant_messages (user_id, role, parts)
          VALUES (${userId}, ${turn.role}, ${JSON.stringify(turn.parts)}::jsonb)
        `;
      }
    });
  }

  /** Keeps only the most recent MAX_HISTORY_TURNS*3 rows for a user — called
   *  opportunistically after appending, so the table cannot grow without
   *  bound for a single very long-lived conversation. */
  public async trim(userId: string): Promise<void> {
    await this.database`
      DELETE FROM assistant_messages
      WHERE user_id = ${userId}
        AND id NOT IN (
          SELECT id FROM assistant_messages
          WHERE user_id = ${userId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${MAX_HISTORY_TURNS * 3}
        )
    `;
  }
}
