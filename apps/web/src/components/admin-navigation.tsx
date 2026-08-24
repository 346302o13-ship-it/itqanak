"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DashboardIcon,
  FinanceIcon,
  MessageIcon,
  OperationsIcon,
  ServicesIcon,
  ShieldCheckIcon,
  UserIcon,
  VerifiedIcon,
} from "./icons";

const itemsByLocale = {
  ar: [
    { href: "/ar/admin", label: "نظرة عامة", mobileLabel: "الرئيسية", Icon: DashboardIcon },
    {
      href: "/ar/admin/requests",
      label: "إدارة الطلبات",
      mobileLabel: "الطلبات",
      Icon: MessageIcon,
    },
    {
      href: "/ar/admin/support",
      label: "مركز المحادثات الموحد",
      mobileLabel: "المحادثات",
      Icon: MessageIcon,
    },
    {
      href: "/ar/admin/students",
      label: "الطلاب وإنشاء الطلبات",
      mobileLabel: "الطلاب",
      Icon: UserIcon,
    },
    {
      href: "/ar/admin/verifications",
      label: "توثيق الحسابات",
      mobileLabel: "التوثيق",
      Icon: VerifiedIcon,
    },
    {
      href: "/ar/admin/content",
      label: "محتوى الصفحات",
      mobileLabel: "المحتوى",
      Icon: ServicesIcon,
    },
    {
      href: "/ar/admin/password-resets",
      label: "استعادة كلمات المرور",
      mobileLabel: "الاستعادة",
      Icon: ShieldCheckIcon,
    },
    {
      href: "/ar/admin/finance",
      label: "المدفوعات والمستحقات",
      mobileLabel: "المالية",
      Icon: FinanceIcon,
    },
    {
      href: "/ar/admin/operations",
      label: "التشغيل والصيانة",
      mobileLabel: "التشغيل",
      Icon: OperationsIcon,
    },
    {
      href: "/ar/admin/monitoring",
      label: "المراقبة والتقارير",
      mobileLabel: "المراقبة",
      Icon: DashboardIcon,
    },
    {
      href: "/ar/account",
      label: "حسابي وإعدادات الأمان",
      mobileLabel: "حسابي",
      Icon: UserIcon,
    },
  ],
  en: [
    { href: "/en/admin", label: "Overview", mobileLabel: "Home", Icon: DashboardIcon },
    {
      href: "/en/admin/requests",
      label: "Request management",
      mobileLabel: "Requests",
      Icon: MessageIcon,
    },
    {
      href: "/en/admin/support",
      label: "Unified conversation center",
      mobileLabel: "Chats",
      Icon: MessageIcon,
    },
    {
      href: "/en/admin/students",
      label: "Students & request creation",
      mobileLabel: "Students",
      Icon: UserIcon,
    },
    {
      href: "/en/admin/verifications",
      label: "Account verification",
      mobileLabel: "Verify",
      Icon: VerifiedIcon,
    },
    {
      href: "/en/admin/content",
      label: "Page content",
      mobileLabel: "Content",
      Icon: ServicesIcon,
    },
    {
      href: "/en/admin/password-resets",
      label: "Password recovery",
      mobileLabel: "Recovery",
      Icon: ShieldCheckIcon,
    },
    {
      href: "/en/admin/finance",
      label: "Payments & dues",
      mobileLabel: "Finance",
      Icon: FinanceIcon,
    },
    {
      href: "/en/admin/operations",
      label: "Operations & maintenance",
      mobileLabel: "Operations",
      Icon: OperationsIcon,
    },
    {
      href: "/en/admin/monitoring",
      label: "Monitoring & reports",
      mobileLabel: "Monitoring",
      Icon: DashboardIcon,
    },
    {
      href: "/en/account",
      label: "My account & security",
      mobileLabel: "Account",
      Icon: UserIcon,
    },
  ],
} as const;

export function AdminNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const items = itemsByLocale[locale];
  return (
    <nav
      aria-label={locale === "en" ? "Admin navigation" : "التنقل الإداري"}
      className="grid gap-1.5"
    >
      {items.map(({ href, label, Icon }) => {
        const active =
          href === "/ar/admin" || href === "/en/admin"
            ? pathname === href
            : pathname.startsWith(href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-black transition ${
              active
                ? "bg-[var(--itq-color-brand-700)] text-white shadow-sm"
                : "text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-brand-50)] hover:text-[var(--itq-color-brand-800)]"
            }`}
            href={href}
            key={href}
          >
            <Icon className="size-5" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminMobileNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const items = itemsByLocale[locale];
  return (
    <nav
      aria-label={locale === "en" ? "Mobile admin navigation" : "التنقل الإداري للجوال"}
      className="fixed inset-x-3 bottom-3 z-40 flex overflow-x-auto rounded-2xl border border-[var(--itq-color-border)] bg-white/95 p-1.5 shadow-xl backdrop-blur lg:hidden"
    >
      {items.map(({ href, mobileLabel, Icon }) => {
        const active =
          href === "/ar/admin" || href === "/en/admin"
            ? pathname === href
            : pathname.startsWith(href);
        return (
          <Link
            className={`flex min-h-14 min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-black ${active ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-800)]" : "text-[var(--itq-color-muted)]"}`}
            href={href}
            key={href}
          >
            <Icon className="size-5" /> {mobileLabel}
          </Link>
        );
      })}
    </nav>
  );
}
