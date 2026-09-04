"use client";

import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { MobileNavBar } from "./mobile-nav-bar";
import { NavLink } from "./nav-link";

import {
  FinanceIcon,
  HomeIcon,
  MessageIcon,
  RequestsIcon,
  ServicesIcon,
  SparkleIcon,
  UserIcon,
} from "./icons";

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
    {
      href: "/ar/student/requests/new",
      label: "اطلب خدمة",
      shortLabel: "اطلب",
      icon: ServicesIcon,
    },
    {
      href: "/ar/student/support",
      label: "المحادثة",
      shortLabel: "المحادثة",
      icon: MessageIcon,
    },
    {
      href: "/ar/student/assistant",
      label: "المساعد الذكي",
      shortLabel: "المساعد",
      icon: SparkleIcon,
    },
    { href: "/ar/student/requests", label: "طلباتي", shortLabel: "طلباتي", icon: RequestsIcon },
    {
      href: "/ar/student/finance",
      label: "المدفوعات والمستحقات",
      shortLabel: "المالية",
      icon: FinanceIcon,
    },
    { href: "/ar/account", label: "الحساب والإعدادات", shortLabel: "حسابي", icon: UserIcon },
  ],
  en: [
    { href: "/en/student", label: "Overview", shortLabel: "Home", exact: true, icon: HomeIcon },
    {
      href: "/en/student/requests/new",
      label: "Request a service",
      shortLabel: "Request",
      icon: ServicesIcon,
    },
    {
      href: "/en/student/support",
      label: "Chat",
      shortLabel: "Chat",
      icon: MessageIcon,
    },
    {
      href: "/en/student/assistant",
      label: "AI assistant",
      shortLabel: "Assistant",
      icon: SparkleIcon,
    },
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
    { href: "/en/account", label: "Account & settings", shortLabel: "Account", icon: UserIcon },
  ],
};

function isActive(pathname: string, item: NavigationItem): boolean {
  if (item.exact === true) {
    return pathname === item.href;
  }
  if (item.href.endsWith("/student/requests") && pathname.endsWith("/student/requests/new")) {
    return false;
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
            className={`group relative flex min-h-11 items-center gap-3 rounded-[var(--itq-radius-control)] px-3 text-sm font-black transition ${
              active
                ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                : "text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)] hover:text-[var(--itq-color-ink)]"
            }`}
            href={item.href}
            key={item.href}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-[var(--itq-color-accent-500)]"
              />
            ) : null}
            <span
              className={`grid size-8 place-items-center rounded-[var(--itq-radius-control)] transition ${
                active
                  ? "bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)]"
                  : "text-[var(--itq-color-muted)] group-hover:text-[var(--itq-color-brand-strong)]"
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
      primaryCount={5}
    />
  );
}
