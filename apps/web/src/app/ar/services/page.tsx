import type { Metadata } from "next";

import { ServicesCatalogView, type ServicesCatalogCopy } from "@/components/marketing";
import { PublicShell } from "@/components/public-shell";
import { createCatalogRuntime } from "@/lib/catalog-runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "الخدمات التعليمية",
  description: "استعرض خدمات إتقانك التعليمية المشروعة واختر الخدمة المناسبة لطلبك.",
  alternates: {
    canonical: "/ar/services",
    languages: { "ar-SA": "/ar/services", en: "/en/services" },
  },
  openGraph: {
    title: "الخدمات التعليمية | إتقانك",
    description: "خدمات ترجمة وتصميم ومراجعة ودعم وإرشاد وتدريب ملتزمة بالنزاهة الأكاديمية.",
    locale: "ar_SA",
    type: "website",
    url: "/ar/services",
    images: [{ url: "/images/itqanak-hero-v2.png", alt: "خدمات منصة إتقانك التعليمية" }],
  },
};

const catalogCopy = {
  eyebrow: "خدمات تعليمية مسؤولة",
  title: "اختر الخبرة التي تقرّبك من النتيجة التي تريدها",
  description:
    "خدمات عملية تدعم الفهم وتحسين العرض والمراجعة، دون انتحال العمل الأكاديمي أو تجاوز أنظمة المؤسسة التعليمية.",
  categoryNavLabel: "فئات الخدمات",
  catalogEyebrow: "كتالوج الخدمات",
  catalogTitle: "كل خدمة موضحة قبل أن تبدأ",
  detailsLabel: "تفاصيل الخدمة",
  acceptsFilesLabel: "تقبل مرفقات",
  noFilesLabel: "لا تحتاج ملفات",
  emptyTitle: "لا توجد خدمات متاحة حالياً",
  emptyDescription: "ستظهر الخدمات هنا عند تفعيلها. يمكنك التواصل معنا لمعرفة المستجدات.",
  supportEyebrow: "لست متأكداً من الاختيار؟",
  supportTitle: "صف لنا احتياجك وسنساعدك في تحديد الخدمة",
  supportDescription:
    "أرسل وصفاً مختصراً لما تحتاجه عبر واتساب، وسنوجّهك إلى نقطة البداية الأنسب دون التزام.",
  whatsappMessage: "مرحباً، أحتاج مساعدة في اختيار خدمة مناسبة من منصة إتقانك.",
} satisfies ServicesCatalogCopy;

export default async function ServicesPage() {
  const runtime = createCatalogRuntime();
  let categories;
  try {
    categories = await runtime.catalog.listPublicCatalog();
  } finally {
    await runtime.close();
  }

  const publicCategories = categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.nameAr,
    description: category.descriptionAr,
    services: category.services.map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.nameAr,
      shortDescription: service.shortDescriptionAr,
      acceptsFiles: service.acceptsFiles,
    })),
  }));

  return (
    <PublicShell active="services" locale="ar">
      <ServicesCatalogView categories={publicCategories} copy={catalogCopy} locale="ar" />
    </PublicShell>
  );
}
