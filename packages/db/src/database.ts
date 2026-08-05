import postgres, { type Sql } from "postgres";

export type DatabaseClient = Sql<Record<string, never>>;

export interface DatabaseOptions {
  readonly maxConnections?: number;
  readonly connectTimeoutSeconds?: number;
}

/**
 * Creates the small typed SQL layer used by services. Domain SQL stays visible
 * at call sites; no ORM state is hidden behind this boundary.
 */
export function createDatabase(databaseUrl: string, options: DatabaseOptions = {}): DatabaseClient {
  return postgres(databaseUrl, {
    max: options.maxConnections ?? 5,
    idle_timeout: 20,
    connect_timeout: options.connectTimeoutSeconds ?? 5,
    prepare: false,
    // PostgreSQL notices (for example CREATE TABLE IF NOT EXISTS) are not
    // application events and should not bypass the structured logger.
    onnotice: () => undefined,
  });
}

export async function checkDatabaseHealth(database: DatabaseClient): Promise<boolean> {
  try {
    await database`SELECT 1 AS ready`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(database: DatabaseClient): Promise<void> {
  await database.end({ timeout: 5 });
}
