import type { Metadata } from "next";

import { webAppManifestHref } from "./pwa-manifest";

// One source of truth for the install landing pages so /install, /ar/install and
// /en/install carry identical Open Graph / Twitter tags. /install must render
// these tags itself (not redirect) — several link-preview crawlers do not
// follow a 3xx before scraping.
const copy = {
  ar: {
    title: "ثبّت تطبيق بوابة الطالب",
    description:
      "ثبّت بوابة الطالب من إتقانك على جهازك في ثوانٍ: أيقونة على شاشتك الرئيسية، إشعار فوري لكل رد، وفتح أسرع. بدون متجر تطبيقات — يعمل على أندرويد وiPhone والكمبيوتر.",
    siteName: "إتقانك",
    ogLocale: "ar_SA",
  },
  en: {
    title: "Install the student portal app",
    description:
      "Install the ITQANAK student portal on your device in seconds: a home-screen icon, an instant alert for every reply, and a faster open. No app store — works on Android, iPhone, and desktop.",
    siteName: "ITQANAK",
    ogLocale: "en_US",
  },
} as const;

export function buildInstallMetadata(
  locale: "ar" | "en",
  ogPath: string,
  canonicalPath: string = ogPath,
): Metadata {
  const text = copy[locale];
  const brandedTitle = `${text.title} | ${text.siteName}`;
  return {
    title: text.title,
    description: text.description,
    manifest: webAppManifestHref(locale, "student"),
    alternates: {
      canonical: canonicalPath,
      languages: { "ar-SA": "/ar/install", en: "/en/install" },
    },
    openGraph: {
      title: brandedTitle,
      description: text.description,
      type: "website",
      url: ogPath,
      locale: text.ogLocale,
      siteName: text.siteName,
    },
    twitter: {
      card: "summary_large_image",
      title: brandedTitle,
      description: text.description,
    },
  };
}
