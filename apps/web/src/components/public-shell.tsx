import Link from "next/link";
import type { JSX, ReactNode } from "react";

import { BrandMark } from "@itqanak/ui";

import { EducationalGuide } from "./educational-guide";
import { InstallAppButton } from "./install-app-button";
import { MarketingIcon, PublicHeader, WhatsAppLink, type MarketingLocale } from "./marketing";
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
      className="itq-screen-min-h bg-[var(--itq-color-canvas)] text-[var(--itq-color-ink)]"
      dir={direction}
      lang={locale}
    >
      <a
        className="fixed start-4 top-3 z-[100] -translate-y-24 rounded-xl bg-[var(--itq-color-brand-800)] px-4 py-3 font-black text-white shadow-lg transition focus:translate-y-0"
        href="#main-content"
      >
        {copy.skipLabel}
      </a>

      <PublicHeader
        brandDescriptor={copy.brandDescriptor}
        brandName={copy.brandName}
        homeHref={prefix}
        items={[
          {
            href: `${prefix}/services`,
            label: copy.servicesLabel,
            current: active === "services",
          },
          { href: `${prefix}#how-it-works`, label: copy.processLabel },
          { href: `${prefix}#why-itqanak`, label: copy.whyLabel },
          { href: `${prefix}#faq`, label: copy.faqLabel },
        ]}
        languageLabel={copy.languageLabel}
        languageName={copy.languageName}
        locale={locale}
        loginHref={`${prefix}/auth/login`}
        loginLabel={copy.loginLabel}
        navigationLabel={copy.navigationLabel}
        oppositeHref={oppositeHref}
        oppositeLocale={oppositeLocale}
      />

      <main
        className="mx-auto w-full max-w-[80rem] px-4 pb-24 pt-6 sm:px-6 sm:pt-10 lg:px-8 lg:pb-28"
        id="main-content"
      >
        {children}
      </main>

      <footer className="relative mt-10 border-t border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] before:absolute before:inset-x-0 before:top-0 before:h-24 before:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--itq-color-brand-50)_55%,transparent),transparent)]">
        <div className="relative mx-auto grid w-full max-w-[80rem] gap-x-8 gap-y-12 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(18rem,1.4fr)_repeat(2,minmax(8rem,0.55fr))_minmax(16rem,0.9fr)] lg:py-20">
          <div className="max-w-md">
            <Link className="inline-flex items-center gap-3" href={prefix}>
              <BrandMark label={copy.brandName} />
              <span className="text-xl font-black">{copy.brandName}</span>
            </Link>
            <p className="mt-5 leading-8 text-[var(--itq-color-muted)]">{copy.footerDescription}</p>
            <ul className="mt-6 grid gap-2 text-xs font-bold text-[var(--itq-color-muted)]">
              {[
                locale === "en" ? "Secure connection" : "اتصال آمن",
                locale === "en" ? "Private files" : "ملفات خاصة",
                locale === "en" ? "Academic-integrity commitment" : "التزام بالنزاهة الأكاديمية",
              ].map((line) => (
                <li className="inline-flex items-center gap-2" key={line}>
                  <MarketingIcon
                    className="size-3.5 text-[var(--itq-color-brand-strong)]"
                    name="check"
                  />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label={copy.footerExploreTitle}>
            <h2 className="text-sm font-black uppercase tracking-wide text-[var(--itq-color-ink-soft)]">
              {copy.footerExploreTitle}
            </h2>
            <ul className="mt-4 grid gap-3 text-sm font-bold text-[var(--itq-color-muted)]">
              <li>
                <Link
                  className="transition hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/services`}
                >
                  {copy.servicesLabel}
                </Link>
              </li>
              <li>
                <Link
                  className="transition hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}#how-it-works`}
                >
                  {copy.processLabel}
                </Link>
              </li>
              <li>
                <Link
                  className="transition hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}#faq`}
                >
                  {copy.faqLabel}
                </Link>
              </li>
              <li>
                <Link
                  className="transition hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/terms`}
                >
                  {copy.termsLabel}
                </Link>
              </li>
              <li>
                <Link
                  className="transition hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/privacy`}
                >
                  {copy.privacyLabel}
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label={copy.footerAccountTitle}>
            <h2 className="text-sm font-black uppercase tracking-wide text-[var(--itq-color-ink-soft)]">
              {copy.footerAccountTitle}
            </h2>
            <ul className="mt-4 grid gap-3 text-sm font-bold text-[var(--itq-color-muted)]">
              <li>
                <Link
                  className="transition hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/auth/login`}
                >
                  {copy.loginLabel}
                </Link>
              </li>
              <li>
                <Link
                  className="transition hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/student`}
                >
                  {copy.studentPortalLabel}
                </Link>
              </li>
              <li>
                <Link
                  className="transition hover:text-[var(--itq-color-brand-strong)]"
                  href={`${prefix}/student/requests/new`}
                >
                  {copy.newRequestLabel}
                </Link>
              </li>
            </ul>
          </nav>

          <div className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-5">
            <h2 className="text-sm font-black uppercase tracking-wide text-[var(--itq-color-ink-soft)]">
              {copy.footerSupportTitle}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--itq-color-muted)]">
              {copy.supportAvailability}
            </p>
            <bdi
              className="mt-3 block text-base font-black text-[var(--itq-color-ink-soft)]"
              dir="ltr"
            >
              +966 56 420 2263
            </bdi>
            <WhatsAppLink
              className="mt-4 w-full"
              label={copy.whatsappLabel}
              locale={locale}
              message={copy.whatsappMessage}
            />
          </div>
        </div>

        <div className="border-t border-[var(--itq-color-border)]">
          <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-3 px-5 py-6 text-xs font-bold text-[var(--itq-color-muted)] sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <p>
              © {new Date().getUTCFullYear()} {copy.rightsLabel}
            </p>
            <p className="inline-flex items-center gap-1.5">
              <MarketingIcon className="size-3.5" name="shield" />
              <bdi dir="ltr">WhatsApp {SUPPORT_WHATSAPP_E164}</bdi>
            </p>
            <a
              className="inline-flex items-center gap-1.5 transition hover:text-[var(--itq-color-brand-strong)]"
              href="#main-content"
            >
              {locale === "en" ? "Back to top" : "العودة للأعلى"}
              <span aria-hidden="true">↑</span>
            </a>
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
