import type { DatabaseClient } from "@itqanak/db";

import {
  type CatalogCategory,
  type CatalogCategoryReference,
  type CatalogServiceDetails,
  type CatalogServiceSummary,
  type PricingModel,
  pricingModels,
} from "./types.js";

interface CatalogJoinRow {
  readonly category_id: string;
  readonly category_slug: string;
  readonly category_name_ar: string;
  readonly category_name_en: string;
  readonly category_description_ar: string;
  readonly category_description_en: string;
  readonly category_sort_order: number | string;
  readonly service_id: string | null;
  readonly service_slug: string | null;
  readonly service_name_ar: string | null;
  readonly service_name_en: string | null;
  readonly service_short_description_ar: string | null;
  readonly service_short_description_en: string | null;
  readonly service_pricing_model: string | null;
  readonly service_base_price: string | number | null;
  readonly service_currency: string | null;
  readonly service_accepts_files: boolean | null;
  readonly service_max_files: number | string | null;
  readonly service_max_file_size_bytes: number | string | null;
  readonly service_default_deadline_hours: number | string | null;
  readonly service_sort_order: number | string | null;
}

interface ServiceDetailsRow {
  readonly id: string;
  readonly slug: string;
  readonly name_ar: string;
  readonly name_en: string;
  readonly short_description_ar: string;
  readonly short_description_en: string;
  readonly description_ar: string;
  readonly description_en: string;
  readonly pricing_model: string;
  readonly base_price: string | number | null;
  readonly currency: string | null;
  readonly accepts_files: boolean;
  readonly max_files: number | string;
  readonly max_file_size_bytes: number | string;
  readonly default_deadline_hours: number | string | null;
  readonly sort_order: number | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly category_id: string;
  readonly category_slug: string;
  readonly category_name_ar: string;
  readonly category_name_en: string;
}

export interface CatalogServiceOptions {
  readonly database: DatabaseClient;
}

function isPricingModel(value: string): value is PricingModel {
  return (pricingModels as readonly string[]).includes(value);
}

function toPricingModel(value: string): PricingModel {
  if (!isPricingModel(value)) {
    throw new Error("Catalog row contains an unsupported pricing model.");
  }
  return value;
}

function toNonNegativeInteger(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Catalog row contains an invalid ${field}.`);
  }
  return parsed;
}

function toOptionalNonNegativeInteger(value: number | string | null, field: string): number | null {
  return value === null ? null : toNonNegativeInteger(value, field);
}

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Catalog row contains an invalid timestamp.");
  }
  return parsed;
}

function toMoney(value: string | number | null): string | null {
  return value === null ? null : String(value);
}

function toServiceSummary(row: CatalogJoinRow): CatalogServiceSummary | undefined {
  if (row.service_id === null) {
    return undefined;
  }
  if (
    row.service_slug === null ||
    row.service_name_ar === null ||
    row.service_name_en === null ||
    row.service_short_description_ar === null ||
    row.service_short_description_en === null ||
    row.service_pricing_model === null ||
    row.service_accepts_files === null ||
    row.service_max_files === null ||
    row.service_max_file_size_bytes === null ||
    row.service_sort_order === null
  ) {
    throw new Error("Catalog service row is incomplete.");
  }

  return {
    id: row.service_id,
    slug: row.service_slug,
    nameAr: row.service_name_ar,
    nameEn: row.service_name_en,
    shortDescriptionAr: row.service_short_description_ar,
    shortDescriptionEn: row.service_short_description_en,
    pricingModel: toPricingModel(row.service_pricing_model),
    basePrice: toMoney(row.service_base_price),
    currency: row.service_currency,
    acceptsFiles: row.service_accepts_files,
    maxFiles: toNonNegativeInteger(row.service_max_files, "max_files"),
    maxFileSizeBytes: toNonNegativeInteger(row.service_max_file_size_bytes, "max_file_size_bytes"),
    defaultDeadlineHours: toOptionalNonNegativeInteger(
      row.service_default_deadline_hours,
      "default_deadline_hours",
    ),
    sortOrder: toNonNegativeInteger(row.service_sort_order, "sort_order"),
  };
}

function toServiceDetails(row: ServiceDetailsRow): CatalogServiceDetails {
  return {
    id: row.id,
    slug: row.slug,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    shortDescriptionAr: row.short_description_ar,
    shortDescriptionEn: row.short_description_en,
    descriptionEn: row.description_en,
    descriptionAr: row.description_ar,
    pricingModel: toPricingModel(row.pricing_model),
    basePrice: toMoney(row.base_price),
    currency: row.currency,
    acceptsFiles: row.accepts_files,
    maxFiles: toNonNegativeInteger(row.max_files, "max_files"),
    maxFileSizeBytes: toNonNegativeInteger(row.max_file_size_bytes, "max_file_size_bytes"),
    defaultDeadlineHours: toOptionalNonNegativeInteger(
      row.default_deadline_hours,
      "default_deadline_hours",
    ),
    sortOrder: toNonNegativeInteger(row.sort_order, "sort_order"),
    category: {
      id: row.category_id,
      slug: row.category_slug,
      nameAr: row.category_name_ar,
      nameEn: row.category_name_en,
    },
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function isCatalogSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class CatalogService {
  private readonly database: DatabaseClient;

  public constructor(options: CatalogServiceOptions) {
    this.database = options.database;
  }

  /** Lists the complete public catalog with one joined query (no category N+1 queries). */
  public async listPublicCatalog(): Promise<readonly CatalogCategory[]> {
    const rows = await this.database<CatalogJoinRow[]>`
      SELECT
        categories.id AS category_id,
        categories.slug AS category_slug,
        categories.name_ar AS category_name_ar,
        categories.name_en AS category_name_en,
        categories.description_ar AS category_description_ar,
        categories.description_en AS category_description_en,
        categories.sort_order AS category_sort_order,
        services.id AS service_id,
        services.slug AS service_slug,
        services.name_ar AS service_name_ar,
        services.name_en AS service_name_en,
        services.short_description_ar AS service_short_description_ar,
        services.short_description_en AS service_short_description_en,
        services.pricing_model AS service_pricing_model,
        services.base_price AS service_base_price,
        services.currency AS service_currency,
        services.accepts_files AS service_accepts_files,
        services.max_files AS service_max_files,
        services.max_file_size_bytes AS service_max_file_size_bytes,
        services.default_deadline_hours AS service_default_deadline_hours,
        services.sort_order AS service_sort_order
      FROM service_categories AS categories
      LEFT JOIN services
        ON services.category_id = categories.id
       AND services.active = TRUE
      WHERE categories.active = TRUE
      ORDER BY
        categories.sort_order ASC,
        categories.name_ar ASC,
        services.sort_order ASC,
        services.name_ar ASC
    `;

    const categories = new Map<
      string,
      CatalogCategoryReference & {
        readonly descriptionAr: string;
        readonly descriptionEn: string;
        readonly sortOrder: number;
        readonly services: CatalogServiceSummary[];
      }
    >();
    for (const row of rows) {
      let category = categories.get(row.category_id);
      if (category === undefined) {
        category = {
          id: row.category_id,
          slug: row.category_slug,
          nameAr: row.category_name_ar,
          nameEn: row.category_name_en,
          descriptionAr: row.category_description_ar,
          descriptionEn: row.category_description_en,
          sortOrder: toNonNegativeInteger(row.category_sort_order, "sort_order"),
          services: [],
        };
        categories.set(row.category_id, category);
      }
      const service = toServiceSummary(row);
      if (service !== undefined) {
        category.services.push(service);
      }
    }
    return [...categories.values()];
  }

  public async getActiveServiceBySlug(slug: string): Promise<CatalogServiceDetails | undefined> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!isCatalogSlug(normalizedSlug)) {
      return undefined;
    }
    return this.findActiveService("slug", normalizedSlug);
  }

  /** Resolves an active service after the request layer has authenticated the student. */
  public async getServiceByIdForRequest(id: string): Promise<CatalogServiceDetails | undefined> {
    const normalizedId = id.trim().toLowerCase();
    if (!isUuid(normalizedId)) {
      return undefined;
    }
    return this.findActiveService("id", normalizedId);
  }

  private async findActiveService(
    field: "id" | "slug",
    value: string,
  ): Promise<CatalogServiceDetails | undefined> {
    const rows =
      field === "id"
        ? await this.database<ServiceDetailsRow[]>`
            SELECT
              services.id,
              services.slug,
              services.name_ar,
              services.name_en,
              services.short_description_ar,
              services.short_description_en,
              services.description_ar,
              services.description_en,
              services.pricing_model,
              services.base_price,
              services.currency,
              services.accepts_files,
              services.max_files,
              services.max_file_size_bytes,
              services.default_deadline_hours,
              services.sort_order,
              services.created_at,
              services.updated_at,
              categories.id AS category_id,
              categories.slug AS category_slug,
              categories.name_ar AS category_name_ar,
              categories.name_en AS category_name_en
            FROM services
            INNER JOIN service_categories AS categories ON categories.id = services.category_id
            WHERE services.id = ${value}
              AND services.active = TRUE
              AND categories.active = TRUE
            LIMIT 1
          `
        : await this.database<ServiceDetailsRow[]>`
            SELECT
              services.id,
              services.slug,
              services.name_ar,
              services.name_en,
              services.short_description_ar,
              services.short_description_en,
              services.description_ar,
              services.description_en,
              services.pricing_model,
              services.base_price,
              services.currency,
              services.accepts_files,
              services.max_files,
              services.max_file_size_bytes,
              services.default_deadline_hours,
              services.sort_order,
              services.created_at,
              services.updated_at,
              categories.id AS category_id,
              categories.slug AS category_slug,
              categories.name_ar AS category_name_ar,
              categories.name_en AS category_name_en
            FROM services
            INNER JOIN service_categories AS categories ON categories.id = services.category_id
            WHERE services.slug = ${value}
              AND services.active = TRUE
              AND categories.active = TRUE
            LIMIT 1
          `;
    const row = rows[0];
    return row === undefined ? undefined : toServiceDetails(row);
  }
}
