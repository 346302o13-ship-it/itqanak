import "server-only";

export function adminLoginHref(locale: "ar" | "en" = "ar"): string {
  const configured = process.env.ADMIN_APP_URL ?? "https://admin.itqanqhelpstudent.online";
  const url = new URL(`/${locale}/auth/login`, configured);
  url.searchParams.set("next", `/${locale}/admin`);
  return url.toString();
}
