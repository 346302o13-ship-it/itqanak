"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { RequestsIcon, ShieldCheckIcon, UserIcon, VerifiedIcon } from "./icons";

const navigationByLocale = {
  ar: [
    { href: "/ar/student", label: "بوابة الطالب", icon: RequestsIcon },
    { href: "/ar/account", label: "الملف الشخصي", exact: true, icon: UserIcon },
    { href: "/ar/account/security", label: "كلمة المرور والأمان", icon: ShieldCheckIcon },
    { href: "/ar/account/sessions", label: "الأجهزة والجلسات", icon: VerifiedIcon },
  ],
  en: [
    { href: "/en/student", label: "Student portal", icon: RequestsIcon },
    { href: "/en/account", label: "Profile", exact: true, icon: UserIcon },
    { href: "/en/account/security", label: "Password & security", icon: ShieldCheckIcon },
    { href: "/en/account/sessions", label: "Devices & sessions", icon: VerifiedIcon },
  ],
} as const;

export function AccountNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const navigation = navigationByLocale[locale];
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
          <Link
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-sm font-extrabold transition ${
              active
                ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-800)]"
                : "text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)] hover:text-[var(--itq-color-ink)]"
            }`}
            href={item.href}
            key={item.href}
          >
            <ItemIcon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
