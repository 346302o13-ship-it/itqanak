import type { DatabaseClient } from "@itqanak/db";
import { describe, expect, it } from "vitest";

import { CatalogService } from "./service.js";
import { pricingModelLabelsAr } from "./types.js";

function createQueryDatabase(
  rows: readonly Readonly<Record<string, unknown>>[],
  queries: string[],
): DatabaseClient {
  const query = async (strings: TemplateStringsArray): Promise<readonly unknown[]> => {
    queries.push(strings.join("?"));
    return rows;
  };
  return query as unknown as DatabaseClient;
}

describe("CatalogService", () => {
  it("groups active categories and services from one joined query", async () => {
    const queries: string[] = [];
    const database = createQueryDatabase(
      [
        {
          category_id: "11111111-1111-4111-8111-111111111111",
          category_slug: "translation",
          category_name_ar: "الترجمة",
          category_description_ar: "خدمات لغوية",
          category_sort_order: 10,
          service_id: "22222222-2222-4222-8222-222222222222",
          service_slug: "document-translation",
          service_name_ar: "ترجمة المستندات",
          service_short_description_ar: "ترجمة ومراجعة",
          service_pricing_model: "STARTING_FROM",
          service_base_price: "75.00",
          service_currency: "SAR",
          service_accepts_files: true,
          service_max_files: 3,
          service_max_file_size_bytes: "10485760",
          service_default_deadline_hours: 48,
          service_sort_order: 10,
        },
        {
          category_id: "33333333-3333-4333-8333-333333333333",
          category_slug: "training-explanation",
          category_name_ar: "التدريب والشرح",
          category_description_ar: "جلسات تعليمية",
          category_sort_order: 20,
          service_id: null,
          service_slug: null,
          service_name_ar: null,
          service_short_description_ar: null,
          service_pricing_model: null,
          service_base_price: null,
          service_currency: null,
          service_accepts_files: null,
          service_max_files: null,
          service_max_file_size_bytes: null,
          service_default_deadline_hours: null,
          service_sort_order: null,
        },
      ],
      queries,
    );

    const catalog = await new CatalogService({ database }).listPublicCatalog();

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("services.active = TRUE");
    expect(queries[0]).toContain("categories.active = TRUE");
    expect(catalog).toHaveLength(2);
    expect(catalog[0]?.services[0]).toMatchObject({
      slug: "document-translation",
      basePrice: "75.00",
      maxFileSizeBytes: 10_485_760,
    });
    expect(catalog[1]?.services).toEqual([]);
  });

  it("resolves an active service by normalized slug", async () => {
    const queries: string[] = [];
    const database = createQueryDatabase(
      [
        {
          id: "22222222-2222-4222-8222-222222222222",
          slug: "document-translation",
          name_ar: "ترجمة المستندات",
          short_description_ar: "ترجمة ومراجعة",
          description_ar: "وصف كامل",
          pricing_model: "STARTING_FROM",
          base_price: "75.00",
          currency: "SAR",
          accepts_files: true,
          max_files: 3,
          max_file_size_bytes: 10_485_760,
          default_deadline_hours: 48,
          sort_order: 10,
          created_at: "2026-08-08T10:00:00.000Z",
          updated_at: "2026-08-08T10:00:00.000Z",
          category_id: "11111111-1111-4111-8111-111111111111",
          category_slug: "translation",
          category_name_ar: "الترجمة",
        },
      ],
      queries,
    );

    const service = await new CatalogService({ database }).getActiveServiceBySlug(
      " Document-Translation ",
    );

    expect(queries).toHaveLength(1);
    expect(service).toMatchObject({
      slug: "document-translation",
      category: { slug: "translation" },
      pricingModel: "STARTING_FROM",
    });
    expect(service?.createdAt).toBeInstanceOf(Date);
  });

  it("rejects malformed public identifiers without querying PostgreSQL", async () => {
    const queries: string[] = [];
    const catalog = new CatalogService({ database: createQueryDatabase([], queries) });

    await expect(catalog.getActiveServiceBySlug("../private")).resolves.toBeUndefined();
    await expect(catalog.getServiceByIdForRequest("not-a-uuid")).resolves.toBeUndefined();
    expect(queries).toHaveLength(0);
  });

  it("provides Arabic labels for every pricing model", () => {
    expect(Object.keys(pricingModelLabelsAr)).toEqual([
      "FIXED",
      "STARTING_FROM",
      "QUOTE_REQUIRED",
      "FREE",
    ]);
    expect(pricingModelLabelsAr.QUOTE_REQUIRED).toContain("السعر");
  });
});
