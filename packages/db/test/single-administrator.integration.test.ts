import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "../src/index.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;

integrationDescribe.sequential("single administrator database invariant", () => {
  let database: DatabaseClient;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await database`DELETE FROM users WHERE id = ${userId}`;
    }
    await closeDatabase(database);
  });

  it("rejects a second ADMIN role at the storage boundary", async () => {
    const firstUserId = randomUUID();
    const secondUserId = randomUUID();
    createdUserIds.push(firstUserId, secondUserId);
    await database`
      INSERT INTO users (id, email, email_normalized, display_name, status, email_verified_at)
      VALUES
        (${firstUserId}, ${`owner-one-${firstUserId}@example.test`},
         ${`owner-one-${firstUserId}@example.test`}, 'Owner one', 'ACTIVE', now()),
        (${secondUserId}, ${`owner-two-${secondUserId}@example.test`},
         ${`owner-two-${secondUserId}@example.test`}, 'Owner two', 'ACTIVE', now())
    `;
    await database`
      INSERT INTO user_roles (user_id, role_code) VALUES (${firstUserId}, 'ADMIN')
    `;
    await expect(
      database`INSERT INTO user_roles (user_id, role_code) VALUES (${secondUserId}, 'ADMIN')`,
    ).rejects.toMatchObject({ code: "23505" });
  });
});
