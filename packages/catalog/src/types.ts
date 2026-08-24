export const pricingModels = ["FIXED", "STARTING_FROM", "QUOTE_REQUIRED", "FREE"] as const;

export type PricingModel = (typeof pricingModels)[number];

export const pricingModelLabelsAr = {
  FIXED: "سعر ثابت",
  STARTING_FROM: "يبدأ من",
  QUOTE_REQUIRED: "يحدد السعر بعد مراجعة الطلب",
  FREE: "مجاني",
} as const satisfies Readonly<Record<PricingModel, string>>;

export interface CatalogCategoryReference {
  readonly id: string;
  readonly slug: string;
  readonly nameAr: string;
  readonly nameEn: string;
}

export interface CatalogServiceSummary {
  readonly id: string;
  readonly slug: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly shortDescriptionAr: string;
  readonly shortDescriptionEn: string;
  readonly pricingModel: PricingModel;
  /** Exact NUMERIC database value. Consumers must not use binary floats for calculations. */
  readonly basePrice: string | null;
  readonly currency: string | null;
  readonly acceptsFiles: boolean;
  readonly maxFiles: number;
  readonly maxFileSizeBytes: number;
  readonly defaultDeadlineHours: number | null;
  readonly sortOrder: number;
}

export interface CatalogServiceDetails extends CatalogServiceSummary {
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly category: CatalogCategoryReference;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CatalogCategory extends CatalogCategoryReference {
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly sortOrder: number;
  readonly services: readonly CatalogServiceSummary[];
}
