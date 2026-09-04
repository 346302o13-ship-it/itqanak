"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { MobileNavBar } from "./mobile-nav-bar";
import { NavLink } from "./nav-link";
import {
  BellIcon,
  DashboardIcon,
  FinanceIcon,
  MessageIcon,
  OperationsIcon,
  PaperclipIcon,
  RequestsIcon,
  ServicesIcon,
  SparkleIcon,
  UserIcon,
  VerifiedIcon,
} from "./icons";

const itemsByLocale = {
  ar: [
    { href: "/ar/admin", label: "نظرة عامة", mobileLabel: "الرئيسية", Icon: DashboardIcon },
    {
      href: "/ar/admin/support?assistant=1",
      label: "المساعد الذكي",
      mobileLabel: "المساعد",
      Icon: SparkleIcon,
    },
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
      href: "/ar/admin/requests/pending",
      label: "الطلبات المعلّقة",
      mobileLabel: "المعلّقة",
      Icon: RequestsIcon,
      system: true,
    },
    {
      href: "/ar/admin/storage",
      label: "إدارة التخزين",
      mobileLabel: "التخزين",
      Icon: PaperclipIcon,
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
      href: "/ar/admin/monitoring/autobox",
      label: "صندوق الأحداث",
      mobileLabel: "الأحداث",
      Icon: BellIcon,
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
      href: "/en/admin/support?assistant=1",
      label: "AI assistant",
      mobileLabel: "Assistant",
      Icon: SparkleIcon,
    },
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
      href: "/en/admin/requests/pending",
      label: "Stale requests",
      mobileLabel: "Stale",
      Icon: RequestsIcon,
      system: true,
    },
    {
      href: "/en/admin/storage",
      label: "Storage",
      mobileLabel: "Storage",
      Icon: PaperclipIcon,
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
      href: "/en/admin/monitoring/autobox",
      label: "AutoBox events",
      mobileLabel: "Events",
      Icon: BellIcon,
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

/**
 * The assistant and the conversation list are now the same route
 * (/admin/support), told apart only by a ?assistant= query the URL-based
 * pathname matching below can't see — so this takes the current search
 * separately and special-cases those two items before falling through to
 * the ordinary prefix matching.
 */
function adminNavActive(pathname: string, href: string, assistantActive: boolean): boolean {
  const [hrefPath = href, hrefQuery] = href.split("?");
  if (hrefQuery?.includes("assistant") === true) {
    return pathname === hrefPath && assistantActive;
  }
  if (
    (hrefPath === "/ar/admin/support" || hrefPath === "/en/admin/support") &&
    pathname === hrefPath &&
    assistantActive
  ) {
    return false;
  }
  if (href === "/ar/admin" || href === "/en/admin") return pathname === href;
  // The stale-requests page is its own item; without this it would also light
  // the request-inbox item through the legacy "/admin/requests" prefix below.
  if (/^\/(?:ar|en)\/admin\/requests\/pending(?:\/|$)/u.test(pathname)) {
    return href === "/ar/admin/requests/pending" || href === "/en/admin/requests/pending";
  }
  // The AutoBox page sits under /admin/monitoring but is its own nav item.
  if (/^\/(?:ar|en)\/admin\/monitoring\/autobox(?:\/|$)/u.test(pathname)) {
    return href === "/ar/admin/monitoring/autobox" || href === "/en/admin/monitoring/autobox";
  }
  if (pathname.startsWith(hrefPath)) return true;
  // The request inbox now lives under /admin/support; phone verification and
  // password recovery now live under /admin/approvals. Keep the item lit on the
  // legacy paths that redirect there.
  const legacy: Readonly<Record<string, readonly string[]>> = {
    "/ar/admin/support": ["/ar/admin/requests"],
    "/en/admin/support": ["/en/admin/requests"],
    "/ar/admin/approvals": ["/ar/admin/verifications", "/ar/admin/password-resets"],
    "/en/admin/approvals": ["/en/admin/verifications", "/en/admin/password-resets"],
  };
  return (legacy[hrefPath] ?? []).some((prefix) => pathname.startsWith(prefix));
}

export function AdminNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const assistantActive = useSearchParams().has("assistant");
  const items = itemsByLocale[locale];
  const firstSystemHref = items.find((item) => "system" in item && item.system)?.href;
  return (
    <nav
      aria-label={locale === "en" ? "Admin navigation" : "التنقل الإداري"}
      className="grid gap-1.5"
    >
      {items.map(({ href, label, Icon }) => {
        const active = adminNavActive(pathname, href, assistantActive);
        return (
          <div className="contents" key={href}>
            {href === firstSystemHref ? (
              <p className="mt-3 px-3 pb-1 text-[11px] font-black uppercase tracking-wide text-[var(--itq-color-muted)]">
                {locale === "en" ? "System" : "النظام"}
              </p>
            ) : null}
            <NavLink
              aria-current={active ? "page" : undefined}
              className={`group relative flex min-h-11 items-center gap-3 rounded-[var(--itq-radius-control)] px-3 text-sm font-black transition ${
                active
                  ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                  : "text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)] hover:text-[var(--itq-color-ink)]"
              }`}
              href={href}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-[var(--itq-color-accent-500)]"
                />
              ) : null}
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-[var(--itq-radius-control)] transition ${
                  active
                    ? "bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)]"
                    : "text-[var(--itq-color-muted)] group-hover:text-[var(--itq-color-brand-strong)]"
                }`}
              >
                <Icon className="size-5" />
              </span>
              {label}
            </NavLink>
          </div>
        );
      })}
    </nav>
  );
}

export function AdminMobileNavigation({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const pathname = usePathname();
  const assistantActive = useSearchParams().has("assistant");
  const items = itemsByLocale[locale].map(({ href, mobileLabel, Icon }) => ({
    href,
    label: mobileLabel,
    icon: Icon,
    active: adminNavActive(pathname, href, assistantActive),
  }));
  return (
    <MobileNavBar
      ariaLabel={locale === "en" ? "Mobile admin navigation" : "التنقل الإداري للجوال"}
      items={items}
      moreLabel={locale === "en" ? "More" : "المزيد"}
    />
  );
}
