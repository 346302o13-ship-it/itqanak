import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";

import { publicMetadataBase } from "@/lib/seo";
import { webAppManifestHref } from "@/lib/pwa-manifest";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: publicMetadataBase(),
  title: {
    default: "إتقانك | منصة دعم أكاديمي وتعليمي",
    template: "%s | إتقانك",
  },
  description: "منصة إتقانك لخدمات الدعم التعليمي المشروعة والآمنة ومتابعة طلبات الطلاب.",
  manifest: webAppManifestHref("ar", "public"),
  alternates: {
    languages: { "ar-SA": "/ar", en: "/en" },
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#07544f" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1416" },
  ],
  colorScheme: "light dark",
};

// Applies a saved manual theme choice before first paint so switching does not
// flash. No choice = follow the OS via prefers-color-scheme.
const themeBootstrap = `try{var t=localStorage.getItem("itq-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-itqanak-locale") === "en" ? "en" : "ar";
  return (
    <html dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
