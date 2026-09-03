import type { Metadata } from "next";

import { ServicesCatalogView, type ServicesCatalogCopy } from "@/components/marketing";
import { PublicShell } from "@/components/public-shell";
import { startingPriceLabel } from "@/lib/catalog-presenters";
import { createCatalogRuntime } from "@/lib/catalog-runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Educational services",
  description:
    "Explore responsible ITQANAK services and choose the right support for your request.",
  alternates: {
    canonical: "/en/services",
    languages: { "ar-SA": "/ar/services", en: "/en/services" },
  },
  openGraph: {
    title: "Educational services | ITQANAK",
    description: "Translation, design, review, technical support, guidance and training.",
    locale: "en_US",
    type: "website",
    url: "/en/services",
    images: [{ url: "/images/itqanak-hero-v2.png", alt: "ITQANAK educational services" }],
  },
};

const catalogCopy = {
  eyebrow: "Responsible educational services",
  title: "Choose the expertise that moves your work forward",
  description:
    "Practical support for understanding, review and presentation—without impersonation or bypassing your institution's rules.",
  categoryNavLabel: "Service categories",
  catalogEyebrow: "Service catalogue",
  catalogTitle: "Know what each service covers before you begin",
  detailsLabel: "Service details",
  acceptsFilesLabel: "Accepts attachments",
  noFilesLabel: "No files required",
  emptyTitle: "No services are available right now",
  emptyDescription: "Services will appear here when activated. Contact us for an update.",
  popularBadge: "Most requested",
  supportEyebrow: "Not sure which service to choose?",
  supportTitle: "Describe your requirement and we will help route it",
  supportDescription:
    "Send us a short WhatsApp message and we will point you to the most suitable starting point, with no obligation.",
  whatsappMessage: "Hello, I need help choosing an ITQANAK service.",
} satisfies ServicesCatalogCopy;

export default async function EnglishServicesPage() {
  const runtime = createCatalogRuntime();
  let categories;
  try {
    categories = await runtime.catalog.listPublicCatalog();
  } finally {
    await runtime.close();
  }

  return (
    <PublicShell active="services" locale="en">
      <ServicesCatalogView
        categories={categories.map((category) => ({
          id: category.id,
          slug: category.slug,
          name: category.nameEn,
          description: category.descriptionEn,
          services: category.services.map((service) => {
            const priceLabel = startingPriceLabel(
              service.pricingModel,
              service.basePrice,
              service.currency,
              "en",
            );
            return {
              id: service.id,
              slug: service.slug,
              name: service.nameEn,
              shortDescription: service.shortDescriptionEn,
              acceptsFiles: service.acceptsFiles,
              ...(priceLabel === undefined ? {} : { priceLabel }),
            };
          }),
        }))}
        copy={catalogCopy}
        locale="en"
      />
    </PublicShell>
  );
}
