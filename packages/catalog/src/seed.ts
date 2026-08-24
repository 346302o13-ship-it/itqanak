import type { RuntimeEnvironment } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";

import type { PricingModel } from "./types.js";

interface DevelopmentServiceSeed {
  readonly slug: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly shortDescriptionAr: string;
  readonly shortDescriptionEn: string;
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly pricingModel: PricingModel;
  readonly basePrice: string | null;
  readonly currency: string | null;
  readonly acceptsFiles: boolean;
  readonly maxFiles: number;
  readonly maxFileSizeBytes: number;
  readonly defaultDeadlineHours: number | null;
  readonly sortOrder: number;
}

interface DevelopmentCategorySeed {
  readonly slug: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly sortOrder: number;
  readonly services: readonly DevelopmentServiceSeed[];
}

interface IdRow {
  readonly id: string;
}

export interface DevelopmentSeedResult {
  readonly categoriesUpserted: number;
  readonly servicesUpserted: number;
}

interface SavepointCapableDatabase {
  savepoint<T>(callback: (transaction: DatabaseClient) => Promise<T>): Promise<T>;
}

const tenMebibytes = 10 * 1024 * 1024;

export const developmentCatalogSeed: readonly DevelopmentCategorySeed[] = [
  {
    slug: "translation",
    nameAr: "الترجمة",
    nameEn: "Translation & language",
    descriptionAr: "مساعدة لغوية احترافية للمحتوى الذي يملكه الطالب أو يحق له استخدامه.",
    descriptionEn: "Professional language support for content you own or are authorised to use.",
    sortOrder: 10,
    services: [
      {
        slug: "document-translation",
        nameAr: "ترجمة المستندات",
        nameEn: "Document translation",
        shortDescriptionAr: "ترجمة بشرية واضحة مع الحفاظ على معنى النص وتنسيقه الأساسي.",
        shortDescriptionEn:
          "Clear human translation that preserves meaning and essential formatting.",
        descriptionAr:
          "ترجمة مستند يقدمه الطالب مع مراجعة لغوية وبيان المصطلحات، مع بقاء مسؤولية المحتوى العلمي والتسليم الأكاديمي على الطالب.",
        descriptionEn:
          "Human translation of a document supplied by you, including language review and terminology notes. You remain responsible for the academic content and submission.",
        pricingModel: "STARTING_FROM",
        basePrice: "75.00",
        currency: "SAR",
        acceptsFiles: true,
        maxFiles: 3,
        maxFileSizeBytes: tenMebibytes,
        defaultDeadlineHours: 48,
        sortOrder: 10,
      },
    ],
  },
  {
    slug: "design-presentations",
    nameAr: "التصميم والعروض",
    nameEn: "Design & presentations",
    descriptionAr: "تحسين العرض البصري للمحتوى الذي يعده الطالب.",
    descriptionEn: "Clear, polished visual communication built around your own content.",
    sortOrder: 20,
    services: [
      {
        slug: "presentation-visual-design",
        nameAr: "التصميم البصري للعروض",
        nameEn: "Presentation design",
        shortDescriptionAr: "قالب متناسق وتنظيم بصري لمحتوى العرض المقدم من الطالب.",
        shortDescriptionEn:
          "A consistent visual system and readable slides for content you provide.",
        descriptionAr:
          "تصميم هوية بصرية وشرائح قابلة للقراءة انطلاقًا من المحتوى الذي يقدمه الطالب، دون إنشاء إجابات تقييمية بالنيابة عنه.",
        descriptionEn:
          "A clear visual identity and readable slide design based on content you supply, without creating assessed answers on your behalf.",
        pricingModel: "STARTING_FROM",
        basePrice: "120.00",
        currency: "SAR",
        acceptsFiles: true,
        maxFiles: 5,
        maxFileSizeBytes: tenMebibytes,
        defaultDeadlineHours: 72,
        sortOrder: 10,
      },
    ],
  },
  {
    slug: "formatting-review",
    nameAr: "التنسيق والمراجعة",
    nameEn: "Formatting & review",
    descriptionAr: "تنسيق المستندات ومراجعة سلامة اللغة دون تغيير أصالة العمل.",
    descriptionEn:
      "Document formatting and language review without changing the originality of your work.",
    sortOrder: 30,
    services: [
      {
        slug: "document-formatting-review",
        nameAr: "تنسيق ومراجعة المستند",
        nameEn: "Document formatting & review",
        shortDescriptionAr: "تنسيق احترافي ومراجعة لغوية للنص المكتوب مسبقًا.",
        shortDescriptionEn: "Professional formatting and language review for an existing document.",
        descriptionAr:
          "ضبط الأنماط والعناوين والمراجع الظاهرة ومراجعة الأخطاء اللغوية في نص أعده الطالب، دون إضافة نتائج أو ادعاءات بحثية جديدة.",
        descriptionEn:
          "Styles, headings, visible references and language issues are reviewed in a document you have already written, without adding new research claims or findings.",
        pricingModel: "STARTING_FROM",
        basePrice: "60.00",
        currency: "SAR",
        acceptsFiles: true,
        maxFiles: 3,
        maxFileSizeBytes: tenMebibytes,
        defaultDeadlineHours: 48,
        sortOrder: 10,
      },
    ],
  },
  {
    slug: "technical-support",
    nameAr: "الدعم التقني",
    nameEn: "Technical support",
    descriptionAr: "تشخيص المشكلات التقنية وشرح خطوات الحل للطالب.",
    descriptionEn: "Practical diagnosis and guided solutions for technical issues.",
    sortOrder: 40,
    services: [
      {
        slug: "technical-consultation",
        nameAr: "استشارة دعم تقني",
        nameEn: "Technical consultation",
        shortDescriptionAr: "تشخيص مشكلة تقنية وتقديم خطوات عملية وآمنة لمعالجتها.",
        shortDescriptionEn:
          "Diagnose a technical issue and receive practical, secure steps to resolve it.",
        descriptionAr:
          "جلسة مساعدة لتحديد سبب المشكلة وشرح طريقة المعالجة، مع احترام خصوصية الحسابات وعدم طلب بيانات دخول.",
        descriptionEn:
          "A guided session to identify the cause of a technical problem and explain a safe solution. We never request account passwords.",
        pricingModel: "QUOTE_REQUIRED",
        basePrice: null,
        currency: null,
        acceptsFiles: true,
        maxFiles: 5,
        maxFileSizeBytes: tenMebibytes,
        defaultDeadlineHours: 24,
        sortOrder: 10,
      },
    ],
  },
  {
    slug: "research-guidance",
    nameAr: "الإرشاد البحثي",
    nameEn: "Research guidance",
    descriptionAr: "إرشاد منهجي يساعد الطالب على تطوير عمله بنفسه.",
    descriptionEn: "Methodological guidance that helps you develop your own research skills.",
    sortOrder: 50,
    services: [
      {
        slug: "research-method-guidance",
        nameAr: "إرشاد المنهج البحثي",
        nameEn: "Research methods guidance",
        shortDescriptionAr: "مناقشة المنهج وخطة البحث ومصادر التعلم المناسبة.",
        shortDescriptionEn:
          "Discuss methodology, research planning and appropriate learning resources.",
        descriptionAr:
          "إرشاد تعليمي حول صياغة الخطة واختيار المنهج وتقييم المصادر، دون كتابة البحث أو إنتاج نتائج نيابة عن الطالب.",
        descriptionEn:
          "Educational guidance on planning, choosing a methodology and evaluating sources, without writing the research or producing findings for you.",
        pricingModel: "QUOTE_REQUIRED",
        basePrice: null,
        currency: null,
        acceptsFiles: true,
        maxFiles: 3,
        maxFileSizeBytes: tenMebibytes,
        defaultDeadlineHours: 48,
        sortOrder: 10,
      },
    ],
  },
  {
    slug: "training-explanation",
    nameAr: "التدريب والشرح",
    nameEn: "Training & explanation",
    descriptionAr: "جلسات تعليمية تركز على الفهم وبناء مهارة مستقلة.",
    descriptionEn: "One-to-one explanations and training focused on lasting understanding.",
    sortOrder: 60,
    services: [
      {
        slug: "guided-learning-session",
        nameAr: "جلسة تدريب وشرح",
        nameEn: "Guided learning session",
        shortDescriptionAr: "شرح تفاعلي لمفهوم أو أداة مع تمارين تعليمية موجهة.",
        shortDescriptionEn: "An interactive explanation of a concept or tool with guided practice.",
        descriptionAr:
          "جلسة تدريبية تساعد الطالب على فهم المفهوم وتطبيقه بنفسه من خلال أمثلة وتمارين تعليمية غير تقييمية.",
        descriptionEn:
          "A focused training session that helps you understand a concept and practise it independently using non-assessed examples.",
        pricingModel: "FIXED",
        basePrice: "100.00",
        currency: "SAR",
        acceptsFiles: true,
        maxFiles: 3,
        maxFileSizeBytes: tenMebibytes,
        defaultDeadlineHours: null,
        sortOrder: 10,
      },
    ],
  },
] as const;

export class ProductionSeedRefusedError extends Error {
  public constructor() {
    super("Development catalog seed is disabled in production.");
    this.name = "ProductionSeedRefusedError";
  }
}

export function assertDevelopmentSeedEnvironment(environment: RuntimeEnvironment): void {
  if (environment === "production") {
    throw new ProductionSeedRefusedError();
  }
}

export async function seedDevelopmentCatalog(
  database: DatabaseClient,
  environment: RuntimeEnvironment,
): Promise<DevelopmentSeedResult> {
  assertDevelopmentSeedEnvironment(environment);

  const runSeed = async (tx: DatabaseClient): Promise<DevelopmentSeedResult> => {
    let servicesUpserted = 0;

    for (const category of developmentCatalogSeed) {
      const categoryRows = await tx<IdRow[]>`
        INSERT INTO service_categories (
          slug,
          name_ar,
          name_en,
          description_ar,
          description_en,
          sort_order,
          active
        ) VALUES (
          ${category.slug},
          ${category.nameAr},
          ${category.nameEn},
          ${category.descriptionAr},
          ${category.descriptionEn},
          ${category.sortOrder},
          TRUE
        )
        ON CONFLICT (slug) DO UPDATE SET
          name_ar = EXCLUDED.name_ar,
          name_en = EXCLUDED.name_en,
          description_ar = EXCLUDED.description_ar,
          description_en = EXCLUDED.description_en,
          sort_order = EXCLUDED.sort_order,
          active = TRUE,
          updated_at = NOW()
        RETURNING id
      `;
      const categoryId = categoryRows[0]?.id;
      if (categoryId === undefined) {
        throw new Error("Catalog category upsert did not return an id.");
      }

      for (const service of category.services) {
        await tx`
          INSERT INTO services (
            category_id,
            slug,
            name_ar,
            name_en,
            short_description_ar,
            short_description_en,
            description_ar,
            description_en,
            pricing_model,
            base_price,
            currency,
            active,
            accepts_files,
            max_files,
            max_file_size_bytes,
            default_deadline_hours,
            sort_order
          ) VALUES (
            ${categoryId},
            ${service.slug},
            ${service.nameAr},
            ${service.nameEn},
            ${service.shortDescriptionAr},
            ${service.shortDescriptionEn},
            ${service.descriptionAr},
            ${service.descriptionEn},
            ${service.pricingModel},
            ${service.basePrice},
            ${service.currency},
            TRUE,
            ${service.acceptsFiles},
            ${service.maxFiles},
            ${service.maxFileSizeBytes},
            ${service.defaultDeadlineHours},
            ${service.sortOrder}
          )
          ON CONFLICT (slug) DO UPDATE SET
            category_id = EXCLUDED.category_id,
            name_ar = EXCLUDED.name_ar,
            name_en = EXCLUDED.name_en,
            short_description_ar = EXCLUDED.short_description_ar,
            short_description_en = EXCLUDED.short_description_en,
            description_ar = EXCLUDED.description_ar,
            description_en = EXCLUDED.description_en,
            pricing_model = EXCLUDED.pricing_model,
            base_price = EXCLUDED.base_price,
            currency = EXCLUDED.currency,
            active = TRUE,
            accepts_files = EXCLUDED.accepts_files,
            max_files = EXCLUDED.max_files,
            max_file_size_bytes = EXCLUDED.max_file_size_bytes,
            default_deadline_hours = EXCLUDED.default_deadline_hours,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
        `;
        servicesUpserted += 1;
      }
    }

    return {
      categoriesUpserted: developmentCatalogSeed.length,
      servicesUpserted,
    };
  };

  const transaction = database as unknown as Partial<SavepointCapableDatabase>;
  if (typeof transaction.savepoint === "function") {
    return transaction.savepoint((savepoint) => runSeed(savepoint as DatabaseClient));
  }
  return database.begin((topLevelTransaction) => runSeed(topLevelTransaction as DatabaseClient));
}
