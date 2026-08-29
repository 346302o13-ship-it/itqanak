import Link from "next/link";
import type { JSX, ReactNode } from "react";

import { BrandMark, classNames } from "@itqanak/ui";

import { EducationalGuide } from "./educational-guide";
import { InstallAppButton } from "./install-app-button";
import { MarketingIcon, WhatsAppLink, type MarketingLocale } from "./marketing";
import { adminLoginHref } from "@/lib/admin-access";
import { SUPPORT_WHATSAPP_E164 } from "@/lib/support-contact";

export interface PublicShellCopy {
  readonly brandName: string;
  readonly brandDescriptor: string;
  readonly skipLabel: string;
  readonly navigationLabel: string;
  readonly servicesLabel: string;
  readonly processLabel: string;
  readonly whyLabel: string;
  readonly faqLabel: string;
  readonly loginLabel: string;
  readonly languageLabel: string;
  readonly languageName: string;
  readonly whatsappLabel: string;
  readonly whatsappMessage: string;
  readonly footerDescription: string;
  readonly footerExploreTitle: string;
  readonly footerAccountTitle: string;
  readonly footerSupportTitle: string;
  readonly footerLegalTitle: string;
  readonly termsLabel: string;
  readonly privacyLabel: string;
  readonly studentPortalLabel: string;
  readonly adminPortalLabel: string;
  readonly newRequestLabel: string;
  readonly supportAvailability: string;
  readonly rightsLabel: string;
}

const copyByLocale: Readonly<Record<MarketingLocale, PublicShellCopy>> = {
  ar: {
    brandName: "إتقانك",
    brandDescriptor: "دعم تعليمي بوضوح",
    skipLabel: "تجاوز إلى المحتوى الرئيسي",
    navigationLabel: "التنقل الرئيسي",
    servicesLabel: "الخدمات",
    processLabel: "كيف تعمل المنصة",
    whyLabel: "لماذا إتقانك",
    faqLabel: "الأسئلة الشائعة",
    loginLabel: "دخول الحساب",
    languageLabel: "Switch to English",
    languageName: "EN",
    whatsappLabel: "واتساب",
    whatsappMessage: "مرحباً، أود الاستفسار عن خدمات منصة إتقانك.",
    footerDescription:
      "منصة عربية لخدمات الدعم التعليمي المشروعة، تجمع وضوح الطلب وخصوصية الملفات والمتابعة في مكان واحد.",
    footerExploreTitle: "استكشف",
    footerAccountTitle: "حسابك",
    footerSupportTitle: "الدعم",
    footerLegalTitle: "الشروط والخصوصية",
    termsLabel: "شروط الاستخدام",
    privacyLabel: "سياسة الخصوصية",
    studentPortalLabel: "بوابة الطالب",
    adminPortalLabel: "دخول مركز الإدارة",
    newRequestLabel: "إنشاء طلب",
    supportAvailability: "للاستفسار ومساعدتك في اختيار الخدمة المناسبة.",
    rightsLabel: "جميع الحقوق محفوظة لمنصة إتقانك.",
  },
  en: {
    brandName: "ITQANAK",
    brandDescriptor: "Educational support, clearly",
    skipLabel: "Skip to main content",
    navigationLabel: "Main navigation",
    servicesLabel: "Services",
    processLabel: "How it works",
    whyLabel: "Why ITQANAK",
    faqLabel: "FAQ",
    loginLabel: "Sign in",
    languageLabel: "التبديل إلى العربية",
    languageName: "ع",
    whatsappLabel: "WhatsApp",
    whatsappMessage: "Hello, I would like to ask about ITQANAK services.",
    footerDescription:
      "A platform for responsible educational support, bringing clear requests, private files, and progress tracking together.",
    footerExploreTitle: "Explore",
    footerAccountTitle: "Your account",
    footerSupportTitle: "Support",
    footerLegalTitle: "Terms and privacy",
    termsLabel: "Terms of Use",
    privacyLabel: "Privacy Policy",
    studentPortalLabel: "Student portal",
    adminPortalLabel: "Admin center sign-in",
    newRequestLabel: "Create a request",
    supportAvailability: "Ask us for help choosing the service that fits your needs.",
    rightsLabel: "All rights reserved to ITQANAK.",
  },
};

interface PublicShellProps {
  readonly children: ReactNode;
  readonly locale?: MarketingLocale;
  readonly active?: "home" | "services";
  readonly alternateHref?: string;
  readonly copy?: Partial<PublicShellCopy>;
}

export function PublicShell({
  active,
  alternateHref,
  children,
  copy: copyOverrides,
  locale = "ar",
}: PublicShellProps): JSX.Element {
  const copy = { ...copyByLocale[locale], ...copyOverrides };
  const prefix = `/${locale}`;
  const oppositeLocale = locale === "ar" ? "en" : "ar";
  const direction = locale === "ar" ? "rtl" : "ltr";
  const oppositeHref =
    alternateHref ?? (active === "services" ? `/${oppositeLocale}/services` : `/${oppositeLocale}`);

  return (
    <div
      className="min-h-[100svh] min-h-[100dvh] bg-[var(--itq-color-canvas)] text-[var(--itq-color-ink)]"
      dir={direction}
      lang={locale}
    >
      <a
        className="fixed start-4 top-3 z-[100] -translate-y-24 rounded-xl bg-[var(--itq-color-brand-800)] px-4 py-3 font-black text-white shadow-lg transition focus:translate-y-0"
        href="#main-content"
      >
        {copy.skipLabel}
      </a>

      <header className="sticky top-0 z-50 itq-safe-t border-b border-[var(--itq-color-border)]/80 bg-[var(--itq-color-canvas)]/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.75rem] w-full max-w-[80rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            aria-current={active === "home" ? "page" : undefined}
            className="inline-flex shrink-0 items-center gap-3 rounded-xl"
            href={prefix}
          >
            <BrandMark label={copy.brandName} />
            <span>
              <span className="block text-lg font-black leading-5">{copy.brandName}</span>
              <span className="mt-1 hidden text-[0.65rem] font-bold text-[var(--itq-color-muted)] sm:block">
                {copy.brandDescriptor}
              </span>
            </span>
          </Link>

          <nav
            aria-label={copy.navigationLabel}
            className="hidden items-center gap-1 text-sm font-black lg:flex"
          >
            <Link
              aria-current={active === "services" ? "page" : undefined}
              className={classNames(
                "rounded-xl px-4 py-3 transition hover:bg-[var(--itq-color-surface)]",
                active === "services" &&
                  "bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-sm)]",
              )}
              href={`${prefix}/services`}
            >
              {copy.servicesLabel}
            </Link>
            <Link
              className="rounded-xl px-4 py-3 transition hover:bg-[var(--itq-color-surface)]"
              href={`${prefix}#how-it-works`}
            >
              {copy.processLabel}
            </Link>
            <Link
              className="rounded-xl px-4 py-3 transition hover:bg-[var(--itq-color-surface)]"
              href={`${prefix}#why-itqanak`}
            >
              {copy.whyLabel}
            </Link>
            <Link
              className="rounded-xl px-4 py-3 transition hover:bg-[var(--itq-color-surface)]"
              href={`${prefix}#faq`}
            >
              {copy.faqLabel}
            </Link>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <InstallAppButton compact locale={locale} surface="public" />
            <Link
              aria-label={copy.languageLabel}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] text-xs font-black text-[var(--itq-color-brand-strong)] shadow-sm transition hover:bg-[var(--itq-color-brand-50)]"
              href={oppositeHref}
              hrefLang={oppositeLocale}
              lang={oppositeLocale}
            >
              {copy.languageName}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--itq-color-brand-700)] px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[var(--itq-color-brand-800)] sm:px-5 sm:text-sm"
              href={`${prefix}/auth/login`}
            >
              {copy.loginLabel}
            </Link>
          </div>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-[80rem] px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-28"
        id="main-content"
      >
        {children}
      </main>

      <footer className="border-t border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]">
        <div className="mx-auto grid w-full max-w-[80rem] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(16rem,1.5fr)_repeat(3,minmax(9rem,0.65fr))] lg:py-16">
          <div className="max-w-md">
            <Link className="inline-flex items-center gap-3" href={prefix}>
              <BrandMark label={copy.brandName} />
              <span className="text-xl font-black">{copy.brandName}</span>
            </Link>
            <p className="mt-5 leading-8 text-[var(--itq-color-muted)]">{copy.footerDescription}</p>
          </div>
          <nav aria-label={copy.footerExploreTitle}>
            <h2 className="font-black">{copy.footerExploreTitle}</h2>
            <ul className="mt-4 grid gap-3 text-sm font-bold text-[var(--itq-color-muted)]">
              <li>
                <Link
                  className="hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/services`}
                >
                  {copy.servicesLabel}
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}#how-it-works`}
                >
                  {copy.processLabel}
                </Link>
              </li>
              <li>
                <Link className="hover:text-[var(--itq-color-brand-strong)]" href={`${prefix}#faq`}>
                  {copy.faqLabel}
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label={copy.footerAccountTitle}>
            <h2 className="font-black">{copy.footerAccountTitle}</h2>
            <ul className="mt-4 grid gap-3 text-sm font-bold text-[var(--itq-color-muted)]">
              <li>
                <Link
                  className="hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/auth/login`}
                >
                  {copy.loginLabel}
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/student`}
                >
                  {copy.studentPortalLabel}
                </Link>
              </li>
              <li>
                <a
                  className="hover:text-[var(--itq-color-brand-strong)]"
                  href={adminLoginHref(locale)}
                >
                  {copy.adminPortalLabel}
                </a>
              </li>
              <li>
                <Link
                  className="hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/student/requests/new`}
                >
                  {copy.newRequestLabel}
                </Link>
              </li>
            </ul>
          </nav>
          <div>
            <h2 className="font-black">{copy.footerSupportTitle}</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--itq-color-muted)]">
              {copy.supportAvailability}
            </p>
            <bdi
              className="mt-3 block text-sm font-black text-[var(--itq-color-ink-soft)]"
              dir="ltr"
            >
              +966 56 420 2263
            </bdi>
            <WhatsAppLink
              className="mt-4 min-h-11 px-4 py-2"
              label={copy.whatsappLabel}
              locale={locale}
              message={copy.whatsappMessage}
            />
          </div>
        </div>
        <div className="border-t border-[var(--itq-color-border)]">
          <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-3 px-5 py-5 text-xs font-bold text-[var(--itq-color-muted)] sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <p>
              © {new Date().getUTCFullYear()} {copy.rightsLabel}
            </p>
            <nav aria-label={copy.footerLegalTitle} className="flex flex-wrap items-center gap-4">
              <Link
                className="underline-offset-4 hover:text-[var(--itq-color-brand-strong)] hover:underline"
                href={`${prefix}/terms`}
              >
                {copy.termsLabel}
              </Link>
              <Link
                className="underline-offset-4 hover:text-[var(--itq-color-brand-strong)] hover:underline"
                href={`${prefix}/privacy`}
              >
                {copy.privacyLabel}
              </Link>
            </nav>
            <InstallAppButton locale={locale} surface="public" />
            <p className="inline-flex items-center gap-1.5">
              <MarketingIcon className="size-3.5" name="shield" />
              <bdi dir="ltr">WA {SUPPORT_WHATSAPP_E164}</bdi>
            </p>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-4 start-4 z-40 sm:bottom-6 sm:start-6 print:hidden">
        <InstallAppButton locale={locale} surface="public" variant="fab" />
      </div>
      <EducationalGuide audience="public" locale={locale} />
    </div>
  );
}
