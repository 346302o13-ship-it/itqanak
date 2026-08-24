import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";

import { CatalogService } from "../src/service.js";
import { developmentCatalogSeed, seedDevelopmentCatalog } from "../src/seed.js";

// Never fall back to DATABASE_URL: this suite may only touch an explicitly selected test database.
const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const rollbackMarker = { catalogIntegrationRollback: true } as const;

interface SeededServiceRow {
  readonly id: string;
  readonly slug: string;
  readonly category_id: string;
}

function allServiceSlugs(): readonly string[] {
  return developmentCatalogSeed.flatMap((category) =>
    category.services.map((service) => service.slug),
  );
}

function idsBySlug(rows: readonly SeededServiceRow[]): ReadonlyMap<string, string> {
  return new Map(rows.map((row) => [row.slug, row.id]));
}

integrationDescribe("catalog integration", () => {
  let database: DatabaseClient;

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
  });

  afterAll(async () => {
    await closeDatabase(database);
  });

  it("seeds idempotently and exposes only active services in active categories", async () => {
    try {
      await database.begin(async (transaction) => {
        const tx = transaction as DatabaseClient;
        const serviceSlugs = allServiceSlugs();

        const firstSeed = await seedDevelopmentCatalog(tx, "test");
        const firstRows = await tx<SeededServiceRow[]>`
          SELECT id, slug, category_id
          FROM services
          WHERE slug IN ${tx(serviceSlugs)}
          ORDER BY slug ASC
        `;
        const secondSeed = await seedDevelopmentCatalog(tx, "test");
        const secondRows = await tx<SeededServiceRow[]>`
          SELECT id, slug, category_id
          FROM services
          WHERE slug IN ${tx(serviceSlugs)}
          ORDER BY slug ASC
        `;

        expect(firstSeed).toEqual({ categoriesUpserted: 6, servicesUpserted: 6 });
        expect(secondSeed).toEqual(firstSeed);
        expect(firstRows).toHaveLength(serviceSlugs.length);
        expect(secondRows).toHaveLength(serviceSlugs.length);
        expect(idsBySlug(secondRows)).toEqual(idsBySlug(firstRows));

        const selectedSeed = developmentCatalogSeed[0]?.services[0];
        const selectedRow = secondRows.find((row) => row.slug === selectedSeed?.slug);
        if (selectedSeed === undefined || selectedRow === undefined) {
          throw new Error("Expected catalog integration seed was not found.");
        }

        const catalog = new CatalogService({ database: tx });
        const publicSlugs = (await catalog.listPublicCatalog()).flatMap((category) =>
          category.services.map((service) => service.slug),
        );
        expect(publicSlugs).toEqual(expect.arrayContaining([...serviceSlugs]));
        await expect(catalog.getActiveServiceBySlug(selectedSeed.slug)).resolves.toMatchObject({
          id: selectedRow.id,
          slug: selectedSeed.slug,
        });
        await expect(catalog.getServiceByIdForRequest(selectedRow.id)).resolves.toMatchObject({
          id: selectedRow.id,
          slug: selectedSeed.slug,
        });

        await tx`UPDATE services SET active = FALSE WHERE id = ${selectedRow.id}`;
        const withoutInactiveService = (await catalog.listPublicCatalog()).flatMap((category) =>
          category.services.map((service) => service.slug),
        );
        expect(withoutInactiveService).not.toContain(selectedSeed.slug);
        await expect(catalog.getActiveServiceBySlug(selectedSeed.slug)).resolves.toBeUndefined();
        await expect(catalog.getServiceByIdForRequest(selectedRow.id)).resolves.toBeUndefined();

        await tx`UPDATE services SET active = TRUE WHERE id = ${selectedRow.id}`;
        await tx`
          UPDATE service_categories SET active = FALSE WHERE id = ${selectedRow.category_id}
        `;
        const withoutInactiveCategory = await catalog.listPublicCatalog();
        expect(
          withoutInactiveCategory.some((category) => category.id === selectedRow.category_id),
        ).toBe(false);
        await expect(catalog.getActiveServiceBySlug(selectedSeed.slug)).resolves.toBeUndefined();
        await expect(catalog.getServiceByIdForRequest(selectedRow.id)).resolves.toBeUndefined();

        // Force PostgreSQL to roll back every seed and status mutation made by this test.
        throw rollbackMarker;
      });
      throw new Error("Catalog integration transaction unexpectedly committed.");
    } catch (error: unknown) {
      if (error !== rollbackMarker) {
        throw error;
      }
    }
  });
});
