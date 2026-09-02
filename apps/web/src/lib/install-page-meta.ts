import type { Metadata } from "next";

import { webAppManifestHref } from "./pwa-manifest";

// One source of truth for the install landing pages so /install, /ar/install and
// /en/install carry identical Open Graph / Twitter tags. /install must render
// these tags itself (not redirect) — several link-preview crawlers do not
// follow a 3xx before scraping.

// The advert card: the poster's hero band (brand + hook) exported landscape
// (~1200x722) so WhatsApp, Telegram and X all render a LARGE preview — a
// portrait image is shrunk to a side thumbnail on WhatsApp. Lives in public/;
// resolved to an absolute URL against metadataBase at request time.
const shareImagePath = "/install-share.jpg";
const shareImageWidth = 1200;
const shareImageHeight = 722;

const copy = {
  ar: {
    title: "منصة إتقانك — ثبّت تطبيق بوابة الطالب",
    description:
      "إتقانك منصة دعم تعليمي: حل واجبات، مشاريع، أبحاث وتقارير، عروض تقديمية، ترجمة وشرح — بجودة عالية، تسليم في الوقت، وخصوصية تامة. ثبّت بوابة الطالب على جهازك وتابع طلباتك بإشعارات فورية للردود.",
    siteName: "إتقانك",
    ogLocale: "ar_SA",
    imageAlt: "منصة إتقانك للدعم التعليمي — ثبّت تطبيق بوابة الطالب",
  },
  en: {
    title: "ITQANAK — install the student portal app",
    description:
      "ITQANAK is an educational-support platform: assignments, projects, research and reports, presentations, translation and tutoring — high quality, on-time delivery, full privacy. Install the student portal to follow your requests with instant reply alerts.",
    siteName: "ITQANAK",
    ogLocale: "en_US",
    imageAlt: "ITQANAK educational-support platform — install the student portal app",
  },
} as const;

export function buildInstallMetadata(
  locale: "ar" | "en",
  ogPath: string,
  canonicalPath: string = ogPath,
): Metadata {
  const text = copy[locale];
  return {
    title: text.title,
    description: text.description,
    manifest: webAppManifestHref(locale, "student"),
    alternates: {
      canonical: canonicalPath,
      languages: { "ar-SA": "/ar/install", en: "/en/install" },
    },
    openGraph: {
      title: text.title,
      description: text.description,
      type: "website",
      url: ogPath,
      locale: text.ogLocale,
      siteName: text.siteName,
      images: [
        {
          url: shareImagePath,
          width: shareImageWidth,
          height: shareImageHeight,
          type: "image/jpeg",
          alt: text.imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: text.title,
      description: text.description,
      images: [shareImagePath],
    },
  };
}
