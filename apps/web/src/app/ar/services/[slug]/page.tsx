import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ServiceDetailView, type ServiceDetailCopy } from "@/components/marketing";
import { PublicShell } from "@/components/public-shell";
import { startingPriceLabel } from "@/lib/catalog-presenters";
import { createCatalogRuntime } from "@/lib/catalog-runtime";

interface ServicePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export const dynamic = "force-dynamic";

async function activeService(slug: string) {
  const runtime = createCatalogRuntime();
  try {
    return await runtime.catalog.getActiveServiceBySlug(slug);
  } finally {
    await runtime.close();
  }
}

export async function generateMetadata({ params }: ServicePageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await activeService(slug);
  if (service === undefined) {
    return { title: "الخدمة غير موجودة", robots: { index: false, follow: false } };
  }
  const canonical = `/ar/services/${service.slug}`;
  return {
    title: service.nameAr,
    description: service.shortDescriptionAr,
    alternates: {
      canonical,
      languages: { "ar-SA": canonical, en: `/en/services/${service.slug}` },
    },
    openGraph: {
      title: `${service.nameAr} | إتقانك`,
      description: service.shortDescriptionAr,
      locale: "ar_SA",
      type: "website",
      url: canonical,
      images: [{ url: "/images/itqanak-hero-v2.png", alt: service.nameAr }],
    },
  };
}

const detailCopy = {
  backLabel: "العودة إلى جميع الخدمات",
  requestLabel: "اطلب الخدمة",
  askLabel: "اسأل عن الخدمة",
  whatsappMessage: "مرحباً، أود الاستفسار عن هذه الخدمة في منصة إتقانك:",
  overviewLabel: "الخدمة باختصار",
  processFact: "المتابعة",
  processFactValue: "من بوابة طلب خاصة",
  filesFact: "المرفقات",
  filesAccepted: (maximumFiles: number) => `يمكن إرفاق حتى ${maximumFiles} ملفات`,
  filesNotNeeded: "لا تتطلب ملفات",
  timingFact: "الوقت المتوقع",
  timingValue: (hours: number) =>
    `نحو ${new Intl.NumberFormat("ar-SA").format(hours)} ساعة بحسب التفاصيل`,
  timingFlexible: "يُحدد بحسب نطاق الطلب",
  benefitsEyebrow: "ما الذي تتوقعه؟",
  benefitsTitle: "خدمة منظمة حول نتيجة واضحة",
  benefitsDescription:
    "تبدأ الخدمة من التفاصيل التي تقدمها أنت، وتبقى خطواتها وملفاتها مرتبطة بطلب واحد يسهل الرجوع إليه.",
  benefits: [
    {
      icon: "document",
      title: "نطاق مفهوم",
      description: "وصف واضح لما تشمله الخدمة قبل إرسال الطلب، حتى تعرف نقطة البداية.",
    },
    {
      icon: "route",
      title: "متابعة مرتبة",
      description: "حالة محدثة وسجل زمني يحفظ المحطات المهمة المتعلقة بطلبك.",
    },
    {
      icon: "shield",
      title: "خصوصية الطلب",
      description: "تفاصيل الطلب والمرفقات مرتبطة بحسابك ولا تُعرض على صفحات عامة.",
    },
  ],
  stepsEyebrow: "كيف تبدأ؟",
  stepsTitle: "من التفاصيل إلى المتابعة في ثلاث خطوات",
  stepsDescription: "أنشئ مسودة أولاً، راجع ما أرسلته، ثم أرسل الطلب عندما تصبح بياناته جاهزة.",
  steps: [
    {
      title: "أنشئ الطلب",
      description: "اختر الخدمة وأضف عنواناً ووصفاً يوضحان النتيجة التي تحتاجها.",
    },
    {
      title: "أكمل التفاصيل",
      description: "حدد الموعد والمستوى واللغة، وارفع الملفات إذا كانت الخدمة تسمح بذلك.",
    },
    {
      title: "أرسل وتابع",
      description: "راجع المسودة، وافق على سياسة النزاهة، ثم تابع الحالة من بوابتك.",
    },
  ],
  prepareTitle: "ما الذي يساعد على فهم طلبك؟",
  prepareDescription:
    "كلما كانت التفاصيل محددة، كان من الأسهل مراجعة الاحتياج وتوجيهه إلى المسار المناسب.",
  prepareItems: [
    "وصف مختصر للنتيجة المطلوبة",
    "الموعد النهائي إن وجد",
    "الملفات المرتبطة بالطلب",
    "اللغة والمستوى أو السياق المناسب",
  ],
  integrityTitle: "دعم مشروع ومسؤول",
  integrityDescription:
    "تقدم الخدمة للتعلم والتحسين المشروع، ولا تشمل أداء اختبار أو واجب مقيم، أو الدخول إلى حساب، أو إنتاج عمل أكاديمي منتحل نيابة عن الطالب.",
  finalTitle: "هل هذه هي الخدمة التي تبحث عنها؟",
  finalDescription:
    "ابدأ طلباً خاصاً وأكمل تفاصيله على مهل، أو اسألنا عبر واتساب إذا كنت تحتاج توضيحاً قبل البدء.",
} satisfies ServiceDetailCopy;

export default async function ServicePage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = await activeService(slug);
  if (service === undefined) {
    notFound();
  }

  const priceLabel = startingPriceLabel(
    service.pricingModel,
    service.basePrice,
    service.currency,
    "ar",
  );
  return (
    <PublicShell active="services" locale="ar">
      <ServiceDetailView
        copy={detailCopy}
        locale="ar"
        service={{
          slug: service.slug,
          name: service.nameAr,
          description: service.descriptionAr,
          categoryName: service.category.nameAr,
          acceptsFiles: service.acceptsFiles,
          maximumFiles: service.maxFiles,
          defaultDeadlineHours: service.defaultDeadlineHours,
          ...(priceLabel === undefined ? {} : { priceLabel }),
        }}
      />
    </PublicShell>
  );
}
