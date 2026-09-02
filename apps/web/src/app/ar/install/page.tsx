import type { Metadata } from "next";

import { InstallLanding } from "@/components/install-landing";
import { webAppManifestHref } from "@/lib/pwa-manifest";

const title = "ثبّت تطبيق بوابة الطالب";
const description =
  "ثبّت بوابة الطالب من إتقانك على جهازك في ثوانٍ: أيقونة على شاشتك الرئيسية، إشعار فوري لكل رد، وفتح أسرع. بدون متجر تطبيقات — يعمل على أندرويد وiPhone والكمبيوتر.";

export const metadata: Metadata = {
  title,
  description,
  manifest: webAppManifestHref("ar", "student"),
  alternates: {
    canonical: "/ar/install",
    languages: { "ar-SA": "/ar/install", en: "/en/install" },
  },
  openGraph: {
    title: `${title} | إتقانك`,
    description,
    type: "website",
    url: "/ar/install",
    locale: "ar_SA",
  },
  twitter: { card: "summary_large_image", title: `${title} | إتقانك`, description },
};

export const dynamic = "force-dynamic";

export default function ArabicInstallPage() {
  return <InstallLanding locale="ar" />;
}
