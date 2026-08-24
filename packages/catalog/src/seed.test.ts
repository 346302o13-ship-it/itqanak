import type { RuntimeEnvironment } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";
import { describe, expect, it } from "vitest";

import {
  developmentCatalogSeed,
  ProductionSeedRefusedError,
  seedDevelopmentCatalog,
} from "./seed.js";

interface FakeSeedState {
  readonly categorySlugs: Set<string>;
  readonly serviceSlugs: Set<string>;
}

function createSeedDatabase(state: FakeSeedState): DatabaseClient {
  const query = async (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<readonly Readonly<Record<string, unknown>>[]> => {
    const statement = strings.join("?");
    if (statement.includes("INSERT INTO service_categories")) {
      const slug = String(values[0]);
      state.categorySlugs.add(slug);
      return [{ id: `category-${slug}` }];
    }
    if (statement.includes("INSERT INTO services")) {
      state.serviceSlugs.add(String(values[1]));
      return [];
    }
    throw new Error("Unexpected seed query.");
  };

  const callable = query as unknown as DatabaseClient;
  const begin = async <T>(callback: (transaction: DatabaseClient) => Promise<T>): Promise<T> =>
    callback(database);
  const database = Object.assign(callable, { begin }) as DatabaseClient;
  return database;
}

describe("development catalog seed", () => {
  it("contains a small, unique set of legitimate Arabic services", () => {
    const categories = developmentCatalogSeed.map((category) => category.slug);
    const services = developmentCatalogSeed.flatMap((category) => category.services);
    const serviceSlugs = services.map((service) => service.slug);
    const allArabicCopy = JSON.stringify(developmentCatalogSeed);

    expect(categories).toHaveLength(6);
    expect(new Set(categories).size).toBe(categories.length);
    expect(services).toHaveLength(6);
    expect(new Set(serviceSlugs).size).toBe(serviceSlugs.length);
    expect(allArabicCopy).not.toMatch(/غش|حل اختبار|انتحال|دخول حساب|أداء امتحان/);
    expect(services.every((service) => service.nameAr.length > 0)).toBe(true);
  });

  it("refuses production before starting a database transaction", async () => {
    let transactionStarted = false;
    const database = {
      begin: () => {
        transactionStarted = true;
        throw new Error("must not start");
      },
    } as unknown as DatabaseClient;

    await expect(seedDevelopmentCatalog(database, "production")).rejects.toBeInstanceOf(
      ProductionSeedRefusedError,
    );
    expect(transactionStarted).toBe(false);
  });

  it.each(["development", "test"] satisfies readonly RuntimeEnvironment[])(
    "is idempotent in %s because stable slugs are upserted",
    async (environment) => {
      const state: FakeSeedState = { categorySlugs: new Set(), serviceSlugs: new Set() };
      const database = createSeedDatabase(state);

      const first = await seedDevelopmentCatalog(database, environment);
      const second = await seedDevelopmentCatalog(database, environment);

      expect(first).toEqual({ categoriesUpserted: 6, servicesUpserted: 6 });
      expect(second).toEqual(first);
      expect(state.categorySlugs.size).toBe(6);
      expect(state.serviceSlugs.size).toBe(6);
    },
  );

  it("uses a savepoint when called inside an existing PostgreSQL transaction", async () => {
    const state: FakeSeedState = { categorySlugs: new Set(), serviceSlugs: new Set() };
    const database = createSeedDatabase(state);
    let savepointStarted = false;
    Object.assign(database, {
      savepoint: async <T>(callback: (transaction: DatabaseClient) => Promise<T>): Promise<T> => {
        savepointStarted = true;
        return callback(database);
      },
    });

    await expect(seedDevelopmentCatalog(database, "test")).resolves.toEqual({
      categoriesUpserted: 6,
      servicesUpserted: 6,
    });
    expect(savepointStarted).toBe(true);
  });
});
