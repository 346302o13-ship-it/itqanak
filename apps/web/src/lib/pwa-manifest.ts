import type { MetadataRoute } from "next";

const productionAdminHostname = "admin.itqanqhelpstudent.online";

export type WebAppSurface = "public" | "student" | "admin";
export type WebAppLocale = "ar" | "en";

export function normalizeManifestHostname(rawHost: string | null | undefined): string {
  const firstForwardedHost = rawHost?.split(",", 1)[0]?.trim().toLocaleLowerCase() ?? "";
  if (firstForwardedHost.startsWith("[")) {
    const closingBracket = firstForwardedHost.indexOf("]");
    return closingBracket > 1 ? firstForwardedHost.slice(1, closingBracket) : "";
  }
  return (firstForwardedHost.split(":", 1)[0] ?? "").replace(/\.$/u, "");
}

export function isAdminManifestHost(rawHost: string | null | undefined): boolean {
  const hostname = normalizeManifestHostname(rawHost);
  return hostname === productionAdminHostname || hostname.startsWith("admin.");
}

export function webAppManifestHref(locale: WebAppLocale, surface: WebAppSurface): string {
  return `/manifest.webmanifest?locale=${locale}&surface=${surface}`;
}

export function webAppManifestForContext(
  rawHost: string | null | undefined,
  locale: WebAppLocale,
  requestedSurface: WebAppSurface,
): MetadataRoute.Manifest {
  const surface = isAdminManifestHost(rawHost) ? "admin" : requestedSurface;
  const english = locale === "en";
  const name =
    surface === "admin"
      ? english
        ? "ITQANAK | Admin Center"
        : "إتقانك | مركز الإدارة"
      : surface === "student"
        ? english
          ? "ITQANAK | Student Portal"
          : "إتقانك | بوابة الطالب"
        : english
          ? "ITQANAK"
          : "إتقانك";
  const shortName =
    surface === "admin"
      ? english
        ? "ITQANAK Admin"
        : "إدارة إتقانك"
      : surface === "student"
        ? english
          ? "ITQANAK Portal"
          : "بوابة إتقانك"
        : english
          ? "ITQANAK"
          : "إتقانك";
  // A visitor who installs the app almost always wants the student portal, not
  // the marketing page — and an unauthenticated hit on /student redirects to
  // login, then straight back. Admin installs still open the admin center.
  const startUrl = surface === "admin" ? `/${locale}/admin` : `/${locale}/student`;
  return {
    id: surface === "admin" ? "/admin" : surface === "student" ? "/student" : "/",
    name,
    short_name: shortName,
    description: english
      ? surface === "admin"
        ? "Manage ITQANAK requests, conversations, accounts, and page content."
        : surface === "student"
          ? "Track educational service requests, messages, and private files."
          : "Clear, responsible educational support and request tracking."
      : surface === "admin"
        ? "إدارة طلبات ومحادثات وحسابات ومحتوى منصة إتقانك."
        : surface === "student"
          ? "متابعة الطلبات التعليمية والمحادثات والملفات الخاصة."
          : "دعم تعليمي مسؤول وواضح مع متابعة منظمة للطلبات.",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    dir: locale === "ar" ? "rtl" : "ltr",
    lang: locale,
    background_color: "#f7f5ef",
    theme_color: "#07544f",
    icons: [
      {
        src: "/install-icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

export function webAppManifestForHost(rawHost: string | null | undefined): MetadataRoute.Manifest {
  return webAppManifestForContext(rawHost, "ar", "public");
}
