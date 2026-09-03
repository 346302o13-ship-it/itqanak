import Link from "next/link";
import type { CSSProperties, JSX } from "react";

import type { ContentBlock } from "@itqanak/content";

import { ManagedContentBlocks } from "../managed-content-blocks";

import { FaqList, type FaqItem } from "./faq-list";
import { FeatureCard, type FeatureTone } from "./feature-card";
import { MarketingIcon, type MarketingIconName } from "./marketing-icon";
import { ProcessSteps, type ProcessStep } from "./process-steps";
import { RequestPreview } from "./request-preview";
import { SectionIntro } from "./section-intro";
import { WhatsAppLink, type MarketingLocale } from "./whatsapp-link";

interface LandingFeature {
  readonly icon: MarketingIconName;
  readonly title: string;
  readonly description: string;
}

interface LandingService extends LandingFeature {
  readonly slug?: string;
  readonly emoji?: string;
  readonly tone?: FeatureTone;
  readonly badge?: string;
  readonly priceLabel?: string;
}

interface QuickLink {
  readonly label: string;
  readonly slug?: string;
}

interface LandingStat {
  readonly value: string;
  readonly label: string;
}

export interface LandingPageCopy {
  readonly hero: {
    readonly eyebrow: string;
    readonly title: string;
    readonly highlightedTitle: string;
    readonly description: string;
    readonly status: string;
    readonly primaryLabel: string;
    readonly whatsappLabel: string;
    readonly whatsappMessage: string;
    readonly imageAlt: string;
    readonly priceChips?: readonly string[];
    readonly quickLinksLabel?: string;
    readonly quickLinks?: readonly QuickLink[];
  };
  readonly stats?: readonly LandingStat[];
  readonly trustItems: readonly LandingFeature[];
  readonly services: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly items: readonly LandingService[];
    readonly itemCta: string;
    readonly allCta: string;
  };
  readonly process: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly steps: readonly ProcessStep[];
  };
  readonly portal: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly points: readonly string[];
    readonly cta: string;
  };
  readonly why: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly items: readonly LandingFeature[];
  };
  readonly integrity: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly commitment: string;
  };
  readonly faq: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly items: readonly FaqItem[];
    readonly supportTitle: string;
    readonly supportDescription: string;
    readonly whatsappLabel: string;
  };
  readonly finalCta: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly primaryLabel: string;
    readonly whatsappLabel: string;
  };
}

interface LandingPageProps {
  readonly locale?: MarketingLocale;
  readonly copy: LandingPageCopy;
  readonly contentBlocks?: readonly ContentBlock[];
}

/** Low-contrast eight-point-star tile for the hero, drawn as an inline SVG data
 *  URI so it never leaves the origin (CSP `img-src 'self' data:`). */
const geometryStyle: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.10' stroke-width='1.3'%3E%3Crect x='18' y='18' width='36' height='36'/%3E%3Crect x='18' y='18' width='36' height='36' transform='rotate(45 36 36)'/%3E%3Ccircle cx='36' cy='36' r='3'/%3E%3C/g%3E%3C/svg%3E\")",
  backgroundSize: "72px 72px",
};

export function LandingPage({
  contentBlocks = [],
  copy,
  locale = "ar",
}: LandingPageProps): JSX.Element {
  const prefix = `/${locale}`;
  const quickLinkHref = (link: QuickLink) =>
    link.slug === undefined ? `${prefix}/services` : `${prefix}/services/${link.slug}`;
  return (
    <>
      {/* Hero — a solid institutional green panel with a faint geometric field,
          a gold top rule, and a quick-links strip, in the manner of a Saudi
          university / ministry landing. No photograph. */}
      <section className="itq-hero-h relative isolate flex flex-col overflow-hidden rounded-[var(--itq-radius-hero)] bg-[linear-gradient(160deg,var(--itq-color-brand-800),var(--itq-color-brand-950))] text-white shadow-[var(--itq-shadow-card)]">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-[var(--itq-color-accent-500)]"
        />
        <div aria-hidden="true" className="absolute inset-0 opacity-70" style={geometryStyle} />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--itq-color-brand-950)_55%,transparent))]"
        />
        <div className="relative flex flex-1 flex-col px-6 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
          <div className="flex flex-1 flex-col justify-center">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black tracking-wide">
                  <MarketingIcon
                    className="size-3.5 text-[var(--itq-color-accent-300)]"
                    name="sparkles"
                  />
                  {copy.hero.eyebrow}
                </span>
                <span className="inline-flex items-center gap-2 rounded-md bg-[var(--itq-color-accent-500)] px-2.5 py-1.5 text-xs font-black text-[var(--itq-color-brand-950)]">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-[var(--itq-color-brand-950)]"
                  />
                  {copy.hero.status}
                </span>
              </div>
              <h1 className="mt-6 text-[2.15rem] font-black leading-[1.15] tracking-[-0.01em] sm:text-[2.9rem] lg:text-[3.4rem]">
                {copy.hero.title}{" "}
                <span className="relative whitespace-nowrap text-[var(--itq-color-accent-300)]">
                  {copy.hero.highlightedTitle}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-1 h-0.5 bg-[var(--itq-color-accent-500)]"
                  />
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-[1.02rem] leading-8 text-white/80 sm:text-lg">
                {copy.hero.description}
              </p>
              <div className="mt-8 flex flex-col flex-wrap gap-3 sm:flex-row">
                <Link
                  className="inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-accent-500)] px-6 py-3 font-black text-[var(--itq-color-brand-950)] shadow-[var(--itq-shadow-sm)] transition hover:brightness-105"
                  href={`${prefix}/services`}
                >
                  {copy.hero.primaryLabel}
                </Link>
                <WhatsAppLink
                  appearance="glass"
                  label={copy.hero.whatsappLabel}
                  locale={locale}
                  message={copy.hero.whatsappMessage}
                />
              </div>
              {copy.hero.priceChips === undefined ? null : (
                <div className="mt-7 flex flex-wrap gap-2">
                  {copy.hero.priceChips.map((chip) => (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/[0.08] px-3 py-1.5 text-sm font-black text-white/90"
                      key={chip}
                    >
                      <span
                        aria-hidden="true"
                        className="size-1 rounded-full bg-[var(--itq-color-accent-300)]"
                      />
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {copy.hero.quickLinks === undefined || copy.hero.quickLinks.length === 0 ? null : (
            <div className="mt-10 border-t border-white/15 pt-6">
              {copy.hero.quickLinksLabel === undefined ? null : (
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--itq-color-accent-300)]">
                  {copy.hero.quickLinksLabel}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2.5">
                {copy.hero.quickLinks.map((link) => (
                  <Link
                    className="group inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/[0.06] px-3.5 py-2 text-sm font-black text-white transition hover:border-[var(--itq-color-accent-300)] hover:bg-white/[0.12]"
                    href={quickLinkHref(link)}
                    key={link.label}
                  >
                    {link.label}
                    <MarketingIcon
                      className="size-3.5 text-[var(--itq-color-accent-300)] transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                      name="arrow-right"
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Credibility strip — factual figures, no invented ratings or counts. */}
      {copy.stats === undefined || copy.stats.length === 0 ? null : (
        <section
          aria-label={copy.hero.eyebrow}
          className="mt-6 overflow-hidden rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]"
        >
          <div className="grid divide-y divide-[var(--itq-color-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 rtl:sm:divide-x-reverse">
            {copy.stats.map((stat) => (
              <div className="px-6 py-6 text-center" key={stat.label}>
                <p className="text-2xl font-black text-[var(--itq-color-brand-strong)] sm:text-3xl">
                  {stat.value}
                </p>
                <p className="mt-1.5 text-xs font-bold leading-5 text-[var(--itq-color-muted)]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label={copy.hero.eyebrow} className="mt-6">
        <div className="grid overflow-hidden rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] md:grid-cols-3">
          {copy.trustItems.map((item, index) => (
            <article
              className={
                index > 0
                  ? "flex gap-4 border-t border-[var(--itq-color-border)] p-6 md:border-s md:border-t-0"
                  : "flex gap-4 p-6"
              }
              key={item.title}
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                <MarketingIcon className="size-5" name={item.icon} />
              </span>
              <div>
                <h2 className="font-black">{item.title}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--itq-color-muted)]">
                  {item.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <ManagedContentBlocks blocks={contentBlocks} locale={locale} surface="landing" />

      <section aria-labelledby="services-preview-title" className="itq-section">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionIntro
            description={copy.services.description}
            eyebrow={copy.services.eyebrow}
            title={copy.services.title}
            titleId="services-preview-title"
          />
          <Link
            className="group inline-flex min-h-11 w-fit items-center gap-2 rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-5 py-2 text-sm font-black text-[var(--itq-color-brand-strong)] transition hover:border-[var(--itq-color-brand-300)] hover:bg-[var(--itq-color-brand-50)]"
            href={`${prefix}/services`}
          >
            {copy.services.allCta}
            <MarketingIcon
              className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
              name="arrow-right"
            />
          </Link>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {copy.services.items.map((service) => (
            <FeatureCard
              description={service.description}
              icon={service.icon}
              key={service.title}
              title={service.title}
              {...(service.tone === undefined ? {} : { tone: service.tone })}
              {...(service.badge === undefined ? {} : { badge: service.badge })}
              {...(service.priceLabel === undefined ? {} : { priceLabel: service.priceLabel })}
            >
              <Link
                className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-black text-[var(--itq-color-brand-strong)] transition hover:gap-2.5"
                href={
                  service.slug === undefined
                    ? `${prefix}/services`
                    : `${prefix}/services/${service.slug}`
                }
              >
                {copy.services.itemCta}
                <MarketingIcon className="size-4 rtl:-scale-x-100" name="arrow-right" />
              </Link>
            </FeatureCard>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="process-title"
        className="scroll-mt-28 rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] px-5 py-14 sm:px-12 sm:py-16"
        id="how-it-works"
      >
        <SectionIntro
          align="center"
          description={copy.process.description}
          eyebrow={copy.process.eyebrow}
          title={copy.process.title}
          titleId="process-title"
        />
        <div className="mt-10">
          <ProcessSteps locale={locale} steps={copy.process.steps} />
        </div>
      </section>

      <section className="itq-section grid items-center gap-12 lg:grid-cols-2">
        <div>
          <RequestPreview locale={locale} />
        </div>
        <div>
          <SectionIntro
            description={copy.portal.description}
            eyebrow={copy.portal.eyebrow}
            title={copy.portal.title}
          />
          <ul className="mt-7 grid gap-3.5">
            {copy.portal.points.map((point) => (
              <li className="flex items-start gap-3 font-bold leading-7" key={point}>
                <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                  <MarketingIcon className="size-3.5" name="check" />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <Link
            className="mt-8 inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] px-6 py-3 font-black text-white shadow-[var(--itq-shadow-sm)] transition hover:bg-[var(--itq-color-brand-800)]"
            href={`${prefix}/auth/login`}
          >
            {copy.portal.cta}
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="why-title"
        className="itq-section scroll-mt-28 border-y border-[var(--itq-color-border)]"
        id="why-itqanak"
      >
        <SectionIntro
          align="center"
          description={copy.why.description}
          eyebrow={copy.why.eyebrow}
          title={copy.why.title}
          titleId="why-title"
        />
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {copy.why.items.map((item) => (
            <FeatureCard
              description={item.description}
              icon={item.icon}
              key={item.title}
              title={item.title}
            />
          ))}
        </div>
      </section>

      <section className="itq-section">
        <div className="relative overflow-hidden rounded-[var(--itq-radius-panel)] bg-[linear-gradient(160deg,var(--itq-color-brand-800),var(--itq-color-brand-950))] p-7 text-white shadow-[var(--itq-shadow-card)] sm:p-12">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-[var(--itq-color-accent-500)]"
          />
          <div aria-hidden="true" className="absolute inset-0 opacity-60" style={geometryStyle} />
          <div className="relative grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)_minmax(17rem,0.6fr)] lg:items-center">
            <span className="inline-flex size-14 items-center justify-center rounded-[var(--itq-radius-control)] bg-white/10 text-[var(--itq-color-accent-300)] ring-1 ring-white/20">
              <MarketingIcon className="size-7" name="shield" />
            </span>
            <div>
              <p className="text-sm font-black text-[var(--itq-color-accent-300)]">
                {copy.integrity.eyebrow}
              </p>
              <h2 className="mt-2 text-2xl font-black leading-9 sm:text-3xl">
                {copy.integrity.title}
              </h2>
              <p className="mt-4 max-w-2xl leading-8 text-white/75">{copy.integrity.description}</p>
            </div>
            <p className="rounded-[var(--itq-radius-control)] border border-white/15 bg-white/10 p-5 text-sm font-bold leading-7 text-white/85">
              {copy.integrity.commitment}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="itq-section scroll-mt-28 !pt-0" id="faq">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
          <div className="lg:sticky lg:top-28">
            <SectionIntro
              description={copy.faq.description}
              eyebrow={copy.faq.eyebrow}
              title={copy.faq.title}
              titleId="faq-title"
            />
            <div className="mt-7 rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-5">
              <p className="font-black">{copy.faq.supportTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
                {copy.faq.supportDescription}
              </p>
              <WhatsAppLink
                className="mt-4 w-full sm:w-auto"
                label={copy.faq.whatsappLabel}
                locale={locale}
                message={copy.hero.whatsappMessage}
              />
            </div>
          </div>
          <FaqList items={copy.faq.items} />
        </div>
      </section>

      <section className="mb-6">
        <div className="relative overflow-hidden rounded-[var(--itq-radius-panel)] bg-[linear-gradient(160deg,var(--itq-color-brand-800),var(--itq-color-brand-950))] p-7 text-white shadow-[var(--itq-shadow-card)] sm:p-12">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-[var(--itq-color-accent-500)]"
          />
          <div aria-hidden="true" className="absolute inset-0 opacity-60" style={geometryStyle} />
          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-md bg-[var(--itq-color-accent-500)] px-3 py-1.5 text-xs font-black text-[var(--itq-color-brand-950)]">
                <MarketingIcon className="size-3.5" name="sparkles" />
                {copy.finalCta.eyebrow}
              </p>
              <h2 className="mt-4 text-2xl font-black leading-9 sm:text-3xl">
                {copy.finalCta.title}
              </h2>
              <p className="mt-4 leading-8 text-white/75">{copy.finalCta.description}</p>
            </div>
            <div className="flex w-full flex-col flex-wrap gap-3 sm:w-auto sm:flex-row">
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-accent-500)] px-6 py-3 font-black text-[var(--itq-color-brand-950)] transition hover:brightness-105"
                href={`${prefix}/services`}
              >
                {copy.finalCta.primaryLabel}
              </Link>
              <WhatsAppLink
                appearance="glass"
                label={copy.finalCta.whatsappLabel}
                locale={locale}
                message={copy.hero.whatsappMessage}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
