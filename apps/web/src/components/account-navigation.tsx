"use client";

import { usePathname } from "next/navigation";

import { NavLink } from "./nav-link";
import { RequestsIcon, ShieldCheckIcon, UserIcon, VerifiedIcon } from "./icons";

const portalLinkByLocale = {
  ar: {
    student: { href: "/ar/student", label: "بوابة الطالب" },
    admin: { href: "/ar/admin", label: "مركز الإدارة" },
  },
  en: {
    student: { href: "/en/student", label: "Student portal" },
    admin: { href: "/en/admin", label: "Admin center" },
  },
} as const;

const settingsLinksByLocale = {
  ar: [
    { href: "/ar/account", label: "الملف الشخصي", exact: true, icon: UserIcon },
    { href: "/ar/account/security", label: "كلمة المرور والأمان", icon: ShieldCheckIcon },
    { href: "/ar/account/sessions", label: "الأجهزة والجلسات", icon: VerifiedIcon },
  ],
  en: [
    { href: "/en/account", label: "Profile", exact: true, icon: UserIcon },
    { href: "/en/account/security", label: "Password & security", icon: ShieldCheckIcon },
    { href: "/en/account/sessions", label: "Devices & sessions", icon: VerifiedIcon },
  ],
} as const;

export function AccountNavigation({
  locale = "ar",
  surface = "student",
}: Readonly<{ locale?: "ar" | "en"; surface?: "student" | "admin" }>) {
  const pathname = usePathname();
  const portal = portalLinkByLocale[locale][surface];
  const navigation = [{ ...portal, icon: RequestsIcon }, ...settingsLinksByLocale[locale]];
  return (
    <nav
      aria-label={locale === "en" ? "Account management" : "إدارة الحساب"}
      className="grid gap-1.5"
    >
      {navigation.map((item) => {
        const active =
          "exact" in item && item.exact === true
            ? pathname === item.href
            : pathname.startsWith(item.href);
        const ItemIcon = item.icon;
        return (
          <NavLink
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-sm font-extrabold transition ${
              active
                ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                : "text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)] hover:text-[var(--itq-color-ink)]"
            }`}
            href={item.href}
            key={item.href}
          >
            <ItemIcon className="size-5" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
