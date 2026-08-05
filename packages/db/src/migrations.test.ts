import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadMigrationFiles, MigrationError } from "./migrations.js";

async function createMigrationDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "itqanak-migration-loader-"));
}

describe("migration file loading", () => {
  it("orders files by their numeric identifiers", async () => {
    const directory = await createMigrationDirectory();
    await writeFile(join(directory, "1000_later.sql"), "SELECT 1000;\n", "utf8");
    await writeFile(join(directory, "999_earlier.sql"), "SELECT 999;\n", "utf8");

    const migrations = await loadMigrationFiles(directory);

    expect(migrations.map((migration) => migration.filename)).toEqual([
      "999_earlier.sql",
      "1000_later.sql",
    ]);
  });

  it("rejects a malformed SQL migration filename instead of silently skipping it", async () => {
    const directory = await createMigrationDirectory();
    await writeFile(join(directory, "001_valid.sql"), "SELECT 1;\n", "utf8");
    await writeFile(join(directory, "not-a-migration.sql"), "SELECT 2;\n", "utf8");

    await expect(loadMigrationFiles(directory)).rejects.toBeInstanceOf(MigrationError);
  });
});
