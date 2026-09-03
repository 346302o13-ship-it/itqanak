import Link from "next/link";
import type { JSX } from "react";

import type { ContentBlock } from "@itqanak/content";

import { ManagedContentBlocks } from "../managed-content-blocks";

import { FaqList, type FaqItem } from "./faq-list";
import { FeatureCard, type FeatureTone } from "./feature-card";
import { GreenBand } from "./green-band";
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
      {/* Hero — the institutional green band, compact, pulled flush under the
          sticky public header. No photograph. */}
      <GreenBand className="-mt-6 sm:-mt-10" size="compact">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-[0.12em]">
              <MarketingIcon
                className="size-3 text-[var(--itq-color-accent-300)]"
                name="sparkles"
              />
              {copy.hero.eyebrow}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--itq-color-accent-500)] px-2.5 py-1 text-[0.7rem] font-black text-[var(--itq-color-brand-950)]">
              <span
                aria-hidden="true"
                className="size-1 rounded-full bg-[var(--itq-color-brand-950)]"
              />
              {copy.hero.status}
            </span>
          </div>
          <h1 className="mt-4 text-[1.85rem] font-black leading-[1.12] tracking-[-0.015em] sm:text-[2.35rem] lg:text-[2.7rem]">
            {copy.hero.title}{" "}
            <span className="relative whitespace-nowrap text-[var(--itq-color-accent-300)]">
              {copy.hero.highlightedTitle}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-1 h-0.5 bg-[var(--itq-color-accent-500)]"
              />
            </span>
          </h1>
          <p className="mt-3.5 max-w-2xl text-[0.98rem] leading-7 text-white/85 sm:text-base">
            {copy.hero.description}
          </p>
          <div className="mt-5 flex flex-col flex-wrap gap-2.5 sm:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-accent-500)] px-6 font-black text-[var(--itq-color-brand-950)] shadow-[var(--itq-shadow-sm)] transition hover:brightness-105"
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
            <div className="mt-5 flex flex-wrap gap-2">
              {copy.hero.priceChips.map((chip) => (
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[0.8rem] font-black text-white/90"
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

        {copy.hero.quickLinks === undefined || copy.hero.quickLinks.length === 0 ? null : (
          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-4">
            {copy.hero.quickLinksLabel === undefined ? null : (
              <span className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[var(--itq-color-accent-300)]">
                {copy.hero.quickLinksLabel}
              </span>
            )}
            {copy.hero.quickLinks.map((link) => (
              <Link
                className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-black text-white/90 transition hover:bg-white/10 hover:text-white"
                href={quickLinkHref(link)}
                key={link.label}
              >
                {link.label}
                <MarketingIcon
                  className="size-3 text-[var(--itq-color-accent-300)] transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                  name="arrow-right"
                />
              </Link>
            ))}
          </div>
        )}
      </GreenBand>

      {/* Credibility zone: factual figures + the three assurances, one quiet
          block right under the hero. No invented ratings or counts. */}
      <section aria-label={copy.hero.eyebrow} className="border-b border-[var(--itq-color-border)]">
        {copy.stats === undefined || copy.stats.length === 0 ? null : (
          <div className="grid divide-y divide-[var(--itq-color-border)] border-b border-[var(--itq-color-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 rtl:sm:divide-x-reverse">
            {copy.stats.map((stat) => (
              <div className="px-5 py-5 text-center" key={stat.label}>
                <p className="text-xl font-black text-[var(--itq-color-brand-strong)] sm:text-2xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-[0.7rem] font-bold leading-4 text-[var(--itq-color-muted)]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="grid md:grid-cols-3 md:divide-x md:divide-[var(--itq-color-border)] rtl:md:divide-x-reverse">
          {copy.trustItems.map((item) => (
            <article className="flex gap-3.5 px-1 py-6 md:px-6" key={item.title}>
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                <MarketingIcon className="size-5" name={item.icon} />
              </span>
              <div>
                <h2 className="text-sm font-black">{item.title}</h2>
                <p className="mt-1 text-[0.82rem] leading-6 text-[var(--itq-color-muted)]">
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
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        className="itq-section scroll-mt-28 border-y border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)]"
        id="how-it-works"
      >
        <SectionIntro
          align="center"
          description={copy.process.description}
          eyebrow={copy.process.eyebrow}
          title={copy.process.title}
          titleId="process-title"
        />
        <div className="mt-9">
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
          <ul className="mt-6 grid gap-3">
            {copy.portal.points.map((point) => (
              <li className="flex items-start gap-3 text-[0.95rem] font-bold leading-7" key={point}>
                <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                  <MarketingIcon className="size-3.5" name="check" />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <Link
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] px-6 font-black text-white shadow-[var(--itq-shadow-sm)] transition hover:bg-[var(--itq-color-brand-800)]"
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

      <GreenBand ariaLabelledBy="integrity-title" className="mt-0">
        <div className="grid gap-7 lg:grid-cols-[auto_minmax(0,1fr)_minmax(16rem,0.62fr)] lg:items-center lg:gap-9">
          <span className="inline-flex size-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-white/10 text-[var(--itq-color-accent-300)] ring-1 ring-white/20">
            <MarketingIcon className="size-6" name="shield" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--itq-color-accent-300)]">
              {copy.integrity.eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-black leading-8 sm:text-2xl" id="integrity-title">
              {copy.integrity.title}
            </h2>
            <p className="mt-3 max-w-2xl text-[0.95rem] leading-7 text-white/85">
              {copy.integrity.description}
            </p>
          </div>
          <p className="rounded-[var(--itq-radius-control)] border border-white/15 bg-white/[0.07] p-4 text-[0.82rem] font-bold leading-6 text-white/85">
            {copy.integrity.commitment}
          </p>
        </div>
      </GreenBand>

      <section aria-labelledby="faq-title" className="itq-section scroll-mt-28" id="faq">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
          <div className="lg:sticky lg:top-28">
            <SectionIntro
              description={copy.faq.description}
              eyebrow={copy.faq.eyebrow}
              title={copy.faq.title}
              titleId="faq-title"
            />
            <div className="mt-6 rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-5">
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

      <GreenBand ariaLabelledBy="final-cta-title" className="-mb-24 lg:-mb-28">
        <div className="flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-md bg-[var(--itq-color-accent-500)] px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-[0.12em] text-[var(--itq-color-brand-950)]">
              <MarketingIcon className="size-3" name="sparkles" />
              {copy.finalCta.eyebrow}
            </p>
            <h2 className="mt-3.5 text-xl font-black leading-8 sm:text-2xl" id="final-cta-title">
              {copy.finalCta.title}
            </h2>
            <p className="mt-3 text-[0.95rem] leading-7 text-white/85">
              {copy.finalCta.description}
            </p>
          </div>
          <div className="flex w-full flex-col flex-wrap gap-2.5 sm:w-auto sm:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-accent-500)] px-6 font-black text-[var(--itq-color-brand-950)] transition hover:brightness-105"
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
      </GreenBand>
    </>
  );
}
