"use client";

import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { MobileNavBar } from "./mobile-nav-bar";
import { NavLink } from "./nav-link";

import { FinanceIcon, HomeIcon, MessageIcon, RequestsIcon, ServicesIcon, UserIcon } from "./icons";

type NavigationItem = Readonly<{
  href: string;
  label: string;
  shortLabel: string;
  exact?: boolean;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}>;

const itemsByLocale: Readonly<Record<"ar" | "en", readonly NavigationItem[]>> = {
  ar: [
    {
      href: "/ar/student",
      label: "نظرة عامة",
      shortLabel: "الرئيسية",
      exact: true,
      icon: HomeIcon,
    },
    { href: "/ar/student/requests", label: "طلباتي", shortLabel: "طلباتي", icon: RequestsIcon },
    {
      href: "/ar/student/finance",
      label: "المدفوعات والمستحقات",
      shortLabel: "المالية",
      icon: FinanceIcon,
    },
    { href: "/ar/services", label: "استكشف الخدمات", shortLabel: "الخدمات", icon: ServicesIcon },
    {
      href: "/ar/student/support",
      label: "المحادثة الموحدة",
      shortLabel: "المحادثة",
      icon: MessageIcon,
    },
    { href: "/ar/account", label: "الحساب والإعدادات", shortLabel: "حسابي", icon: UserIcon },
  ],
  en: [
    { href: "/en/student", label: "Overview", shortLabel: "Home", exact: true, icon: HomeIcon },
    {
      href: "/en/student/requests",
      label: "My requests",
      shortLabel: "Requests",
      icon: RequestsIcon,
    },
    {
      href: "/en/student/finance",
      label: "Payments & dues",
      shortLabel: "Finance",
      icon: FinanceIcon,
    },
    { href: "/en/services", label: "Explore services", shortLabel: "Services", icon: ServicesIcon },
    {
      href: "/en/student/support",
      label: "Unified conversation",
      shortLabel: "Chat",
      icon: MessageIcon,
    },
    { href: "/en/account", label: "Account & settings", shortLabel: "Account", icon: UserIcon },
  ],
};

function isActive(pathname: string, item: NavigationItem): boolean {
  if (item.exact === true) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function StudentNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const items = itemsByLocale[locale];
  return (
    <nav aria-label={locale === "en" ? "Student portal" : "بوابة الطالب"} className="grid gap-1.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        const ItemIcon = item.icon;
        return (
          <NavLink
            aria-current={active ? "page" : undefined}
            className={`group relative flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-sm font-extrabold transition ${
              active
                ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-800)]"
                : "text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)] hover:text-[var(--itq-color-ink)]"
            }`}
            href={item.href}
            key={item.href}
          >
            <span
              className={`grid size-9 place-items-center rounded-xl transition ${
                active
                  ? "bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-700)] shadow-sm"
                  : "text-[var(--itq-color-muted)] group-hover:text-[var(--itq-color-brand-700)]"
              }`}
            >
              <ItemIcon className="size-5" />
            </span>
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function StudentMobileNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const items = itemsByLocale[locale].map((item) => ({
    href: item.href,
    label: item.shortLabel,
    icon: item.icon,
    active: isActive(pathname, item),
  }));
  return (
    <MobileNavBar
      ariaLabel={locale === "en" ? "Quick navigation" : "التنقل السريع"}
      items={items}
      moreLabel={locale === "en" ? "More" : "المزيد"}
    />
  );
}
