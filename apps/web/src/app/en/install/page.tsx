import type { Metadata } from "next";

import { InstallLanding } from "@/components/install-landing";
import { webAppManifestHref } from "@/lib/pwa-manifest";

const title = "Install the student portal app";
const description =
  "Install the ITQANAK student portal on your device in seconds: a home-screen icon, an instant alert for every reply, and a faster open. No app store — works on Android, iPhone, and desktop.";

export const metadata: Metadata = {
  title,
  description,
  manifest: webAppManifestHref("en", "student"),
  alternates: {
    canonical: "/en/install",
    languages: { "ar-SA": "/ar/install", en: "/en/install" },
  },
  openGraph: {
    title: `${title} | ITQANAK`,
    description,
    type: "website",
    url: "/en/install",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: `${title} | ITQANAK`, description },
};

export const dynamic = "force-dynamic";

export default function EnglishInstallPage() {
  return <InstallLanding locale="en" />;
}
