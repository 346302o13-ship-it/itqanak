"use client";

import { usePathname } from "next/navigation";

import { MobileNavBar } from "./mobile-nav-bar";
import { NavLink } from "./nav-link";
import {
  BellIcon,
  DashboardIcon,
  FinanceIcon,
  MessageIcon,
  OperationsIcon,
  ServicesIcon,
  UserIcon,
  VerifiedIcon,
} from "./icons";

const itemsByLocale = {
  ar: [
    { href: "/ar/admin", label: "نظرة عامة", mobileLabel: "الرئيسية", Icon: DashboardIcon },
    {
      href: "/ar/admin/support",
      label: "الطلبات والمحادثات",
      mobileLabel: "الطلبات",
      Icon: MessageIcon,
    },
    {
      href: "/ar/admin/students",
      label: "الطلاب وإنشاء الطلبات",
      mobileLabel: "الطلاب",
      Icon: UserIcon,
    },
    {
      href: "/ar/admin/approvals",
      label: "الاعتمادات",
      mobileLabel: "الاعتمادات",
      Icon: VerifiedIcon,
    },
    {
      href: "/ar/admin/finance",
      label: "المدفوعات والمستحقات",
      mobileLabel: "المالية",
      Icon: FinanceIcon,
    },
    {
      href: "/ar/admin/content",
      label: "محتوى الصفحات",
      mobileLabel: "المحتوى",
      Icon: ServicesIcon,
      system: true,
    },
    {
      href: "/ar/admin/operations",
      label: "التشغيل والصيانة",
      mobileLabel: "التشغيل",
      Icon: OperationsIcon,
      system: true,
    },
    {
      href: "/ar/admin/messaging",
      label: "المراسلة والإعلانات",
      mobileLabel: "المراسلة",
      Icon: BellIcon,
      system: true,
    },
    {
      href: "/ar/admin/monitoring",
      label: "المراقبة والتقارير",
      mobileLabel: "المراقبة",
      Icon: DashboardIcon,
      system: true,
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
      href: "/en/admin/support",
      label: "Requests & chat",
      mobileLabel: "Requests",
      Icon: MessageIcon,
    },
    {
      href: "/en/admin/students",
      label: "Students & request creation",
      mobileLabel: "Students",
      Icon: UserIcon,
    },
    {
      href: "/en/admin/approvals",
      label: "Approvals",
      mobileLabel: "Approvals",
      Icon: VerifiedIcon,
    },
    {
      href: "/en/admin/finance",
      label: "Payments & dues",
      mobileLabel: "Finance",
      Icon: FinanceIcon,
    },
    {
      href: "/en/admin/content",
      label: "Page content",
      mobileLabel: "Content",
      Icon: ServicesIcon,
      system: true,
    },
    {
      href: "/en/admin/operations",
      label: "Operations & maintenance",
      mobileLabel: "Operations",
      Icon: OperationsIcon,
      system: true,
    },
    {
      href: "/en/admin/messaging",
      label: "Messaging & alerts",
      mobileLabel: "Messaging",
      Icon: BellIcon,
      system: true,
    },
    {
      href: "/en/admin/monitoring",
      label: "Monitoring & reports",
      mobileLabel: "Monitoring",
      Icon: DashboardIcon,
      system: true,
    },
    {
      href: "/en/account",
      label: "My account & security",
      mobileLabel: "Account",
      Icon: UserIcon,
    },
  ],
} as const;

function adminNavActive(pathname: string, href: string): boolean {
  if (href === "/ar/admin" || href === "/en/admin") return pathname === href;
  if (pathname.startsWith(href)) return true;
  // The request inbox now lives under /admin/support; phone verification and
  // password recovery now live under /admin/approvals. Keep the item lit on the
  // legacy paths that redirect there.
  const legacy: Readonly<Record<string, readonly string[]>> = {
    "/ar/admin/support": ["/ar/admin/requests"],
    "/en/admin/support": ["/en/admin/requests"],
    "/ar/admin/approvals": ["/ar/admin/verifications", "/ar/admin/password-resets"],
    "/en/admin/approvals": ["/en/admin/verifications", "/en/admin/password-resets"],
  };
  return (legacy[href] ?? []).some((prefix) => pathname.startsWith(prefix));
}

export function AdminNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const items = itemsByLocale[locale];
  const firstSystemHref = items.find((item) => "system" in item && item.system)?.href;
  return (
    <nav
      aria-label={locale === "en" ? "Admin navigation" : "التنقل الإداري"}
      className="grid gap-1.5"
    >
      {items.map(({ href, label, Icon }) => {
        const active = adminNavActive(pathname, href);
        return (
          <div className="contents" key={href}>
            {href === firstSystemHref ? (
              <p className="mt-3 px-4 pb-1 text-[11px] font-black uppercase tracking-wide text-[var(--itq-color-muted)]">
                {locale === "en" ? "System" : "النظام"}
              </p>
            ) : null}
            <NavLink
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-black transition ${
                active
                  ? "bg-[var(--itq-color-brand-700)] text-white shadow-sm"
                  : "text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-brand-50)] hover:text-[var(--itq-color-brand-strong)]"
              }`}
              href={href}
            >
              <Icon className="size-5" /> {label}
            </NavLink>
          </div>
        );
      })}
    </nav>
  );
}

export function AdminMobileNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const items = itemsByLocale[locale].map(({ href, mobileLabel, Icon }) => ({
    href,
    label: mobileLabel,
    icon: Icon,
    active: adminNavActive(pathname, href),
  }));
  return (
    <MobileNavBar
      ariaLabel={locale === "en" ? "Mobile admin navigation" : "التنقل الإداري للجوال"}
      items={items}
      moreLabel={locale === "en" ? "More" : "المزيد"}
    />
  );
}
