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
  // Matches the institutional green header/hero band (brand-800) — this had
  // been left at the pre-retint teal (#07544f) and never updated with the
  // rest of the palette.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#00522a" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1416" },
  ],
  colorScheme: "light dark",
  // Draw under the notch / home indicator so installed on a phone it fills the
  // screen like a native app; components pad with env(safe-area-inset-*).
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

// Applies a saved manual theme choice before first paint so switching does not
// flash. No choice = follow the OS via prefers-color-scheme.
const themeBootstrap = `try{var t=localStorage.getItem("itq-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

// Ad platforms hand out pixel ids as short alphanumeric/digit tokens. Anything
// else is refused rather than interpolated, since these ultimately land in a
// `dangerouslySetInnerHTML` script body — defense in depth against a
// misconfigured deploy env, not against an untrusted caller (only an operator
// sets these).
const PIXEL_ID_PATTERN = /^[A-Za-z0-9_-]{4,32}$/;

function safePixelId(value: string | undefined): string | undefined {
  return value !== undefined && PIXEL_ID_PATTERN.test(value) ? value : undefined;
}

/** Meta (Facebook/Instagram) Pixel — base snippet, `PageView` only. Loads only
 *  when `FB_PIXEL_ID` is set; the CSP in `next.config.ts` mirrors this same
 *  condition. No conversion events (Lead/Purchase) are fired yet — that needs
 *  wiring into the real request-submitted / payment-confirmed points with
 *  real values, not guessed ones. */
function metaPixelScript(pixelId: string): string {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`;
}

/** TikTok Pixel — base snippet, `PageView` only. Same gating as the Meta pixel. */
function tiktokPixelScript(pixelId: string): string {
  return `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<e.methods.length;n++)ttq.setAndDefer(e,e.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${pixelId}');ttq.page();}(window,document,'ttq');`;
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-itqanak-locale") === "en" ? "en" : "ar";
  const fbPixelId = safePixelId(process.env.FB_PIXEL_ID);
  const tiktokPixelId = safePixelId(process.env.TIKTOK_PIXEL_ID);
  return (
    <html dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        {fbPixelId === undefined ? null : (
          <script dangerouslySetInnerHTML={{ __html: metaPixelScript(fbPixelId) }} />
        )}
        {tiktokPixelId === undefined ? null : (
          <script dangerouslySetInnerHTML={{ __html: tiktokPixelScript(tiktokPixelId) }} />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
