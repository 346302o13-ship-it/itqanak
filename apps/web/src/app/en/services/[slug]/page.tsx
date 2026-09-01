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
    return { title: "Service not found", robots: { index: false, follow: false } };
  }
  const canonical = `/en/services/${service.slug}`;
  return {
    title: service.nameEn,
    description: service.shortDescriptionEn,
    alternates: {
      canonical,
      languages: { "ar-SA": `/ar/services/${service.slug}`, en: canonical },
    },
    openGraph: {
      title: `${service.nameEn} | ITQANAK`,
      description: service.shortDescriptionEn,
      locale: "en_US",
      type: "website",
      url: canonical,
      images: [{ url: "/images/itqanak-hero-v2.png", alt: service.nameEn }],
    },
  };
}

const detailCopy = {
  backLabel: "Back to all services",
  requestLabel: "Request this service",
  askLabel: "Ask about the service",
  whatsappMessage: "Hello, I would like to ask about this ITQANAK service:",
  overviewLabel: "At a glance",
  processFact: "Tracking",
  processFactValue: "In a private request portal",
  filesFact: "Attachments",
  filesAccepted: (maximumFiles: number) => `Attach up to ${maximumFiles} files`,
  filesNotNeeded: "No files required",
  timingFact: "Expected timing",
  timingValue: (hours: number) => `Around ${hours} hours, depending on the details`,
  timingFlexible: "Confirmed after reviewing the scope",
  benefitsEyebrow: "What to expect",
  benefitsTitle: "A service organised around a clear outcome",
  benefitsDescription:
    "The work begins with the details you provide, while its updates and files stay linked to one request.",
  benefits: [
    {
      icon: "document",
      title: "Understandable scope",
      description: "A clear description of what the service covers before you submit.",
    },
    {
      icon: "route",
      title: "Ordered progress",
      description: "A current status and timeline for the important stages of your request.",
    },
    {
      icon: "shield",
      title: "Request privacy",
      description: "Your details and attachments are tied to your account, never a public page.",
    },
  ],
  stepsEyebrow: "How to begin",
  stepsTitle: "From details to tracking in three steps",
  stepsDescription: "Save a draft first, review everything, then submit when the request is ready.",
  steps: [
    {
      title: "Create the request",
      description: "Choose the service and add a title and description of the outcome you need.",
    },
    {
      title: "Complete the context",
      description: "Add timing, level and language, plus files where the service supports them.",
    },
    {
      title: "Submit and follow",
      description:
        "Review the draft, accept the integrity policy and follow progress in your portal.",
    },
  ],
  prepareTitle: "What helps us understand your request?",
  prepareDescription: "Specific context makes it easier to review the need and route it correctly.",
  prepareItems: [
    "A short description of the outcome",
    "Your deadline, if there is one",
    "Relevant source files",
    "The appropriate language, level or context",
  ],
  integrityTitle: "Responsible, legitimate support",
  integrityDescription:
    "This service supports learning and improvement. It never includes taking a test or assessed assignment, accessing an account, or producing impersonated academic work.",
  finalTitle: "Is this the service you need?",
  finalDescription:
    "Start a private request and complete it at your own pace, or ask us on WhatsApp before you begin.",
} satisfies ServiceDetailCopy;

export default async function EnglishServicePage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = await activeService(slug);
  if (service === undefined) {
    notFound();
  }
  const priceLabel = startingPriceLabel(
    service.pricingModel,
    service.basePrice,
    service.currency,
    "en",
  );
  return (
    <PublicShell active="services" locale="en">
      <ServiceDetailView
        copy={detailCopy}
        locale="en"
        service={{
          slug: service.slug,
          name: service.nameEn,
          description: service.descriptionEn,
          categoryName: service.category.nameEn,
          acceptsFiles: service.acceptsFiles,
          maximumFiles: service.maxFiles,
          defaultDeadlineHours: service.defaultDeadlineHours,
          ...(priceLabel === undefined ? {} : { priceLabel }),
        }}
      />
    </PublicShell>
  );
}
