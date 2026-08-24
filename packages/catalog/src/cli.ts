#!/usr/bin/env node
import { loadConfig } from "@itqanak/config";
import { closeDatabase, createDatabase, type DatabaseClient } from "@itqanak/db";

import {
  assertDevelopmentSeedEnvironment,
  ProductionSeedRefusedError,
  seedDevelopmentCatalog,
} from "./seed.js";

async function run(): Promise<void> {
  if (process.argv[2] !== "seed-development") {
    process.stderr.write("Usage: itqanak-catalog seed-development\n");
    process.exitCode = 2;
    return;
  }

  const declaredEnvironment = process.env.NODE_ENV ?? process.env.APP_ENV ?? "development";
  if (declaredEnvironment === "production") {
    throw new ProductionSeedRefusedError();
  }

  const config = loadConfig({
    serviceName: "catalog-seed",
    requirements: { database: true },
    loadDotenv: declaredEnvironment === "development",
  });
  assertDevelopmentSeedEnvironment(config.nodeEnv);

  let database: DatabaseClient | undefined;
  try {
    database = createDatabase(config.databaseUrl ?? "");
    const result = await seedDevelopmentCatalog(database, config.nodeEnv);
    process.stdout.write(
      `Development catalog seed completed: categories=${result.categoriesUpserted}, services=${result.servicesUpserted}\n`,
    );
  } finally {
    if (database !== undefined) {
      await closeDatabase(database);
    }
  }
}

void run().catch((error: unknown) => {
  if (error instanceof ProductionSeedRefusedError) {
    process.stderr.write("Development catalog seed is disabled in production.\n");
  } else {
    process.stderr.write("Development catalog seed failed.\n");
  }
  process.exitCode = 1;
});
