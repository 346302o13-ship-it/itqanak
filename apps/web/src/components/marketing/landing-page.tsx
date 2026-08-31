import Image from "next/image";
import Link from "next/link";
import type { JSX } from "react";

import type { ContentBlock } from "@itqanak/content";
import { classNames } from "@itqanak/ui";

import { InstallAppButton } from "../install-app-button";
import { ManagedContentBlocks } from "../managed-content-blocks";

import { FaqList, type FaqItem } from "./faq-list";
import { FeatureCard } from "./feature-card";
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
  };
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
  return (
    <>
      <section className="itq-aurora relative isolate overflow-hidden rounded-[var(--itq-radius-hero)] border border-[var(--itq-color-border)] bg-[var(--itq-color-canvas-warm)] shadow-[var(--itq-shadow-card)] lg:min-h-[39rem]">
        <Image
          alt=""
          aria-hidden="true"
          className={classNames(
            "absolute inset-0 hidden size-full object-cover lg:block",
            locale === "en" && "-scale-x-100",
          )}
          fill
          priority
          sizes="(min-width: 1280px) 1280px, 100vw"
          src="/images/itqanak-hero-v2.png"
        />
        <div
          aria-hidden="true"
          className={classNames(
            "absolute inset-0 hidden lg:block",
            locale === "ar"
              ? "bg-gradient-to-l from-[var(--itq-color-canvas-warm)] via-[var(--itq-color-canvas-warm)]/95 via-45% to-transparent to-75%"
              : "bg-gradient-to-r from-[var(--itq-color-canvas-warm)] via-[var(--itq-color-canvas-warm)]/95 via-45% to-transparent to-75%",
          )}
        />
        <span
          aria-hidden="true"
          className="itq-float-slow pointer-events-none absolute -start-16 top-10 -z-0 size-56 rounded-full bg-[radial-gradient(circle_at_30%_30%,color-mix(in_srgb,var(--itq-color-brand-300)_55%,transparent),transparent_70%)] blur-2xl"
        />
        <span
          aria-hidden="true"
          className="itq-float-slower pointer-events-none absolute end-24 bottom-8 -z-0 size-64 rounded-full bg-[radial-gradient(circle_at_60%_40%,color-mix(in_srgb,var(--itq-color-accent-300)_50%,transparent),transparent_70%)] blur-2xl"
        />
        <div className="relative flex min-h-[35rem] items-center px-6 py-10 sm:px-10 lg:w-[58%] lg:px-14 lg:py-16">
          <div className="itq-rise">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 py-2 text-sm font-black text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-sm)]">
                <MarketingIcon className="size-4" name="sparkles" />
                {copy.hero.eyebrow}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--itq-color-success-50)] px-3 py-2 text-xs font-black text-[var(--itq-color-success-700)]">
                <span aria-hidden="true" className="relative flex size-2">
                  <span className="itq-halo absolute inset-0 rounded-full bg-current" />
                  <span className="relative size-2 rounded-full bg-current" />
                </span>
                {copy.hero.status}
              </span>
            </div>
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.25] tracking-tight text-[var(--itq-color-ink)] sm:text-5xl lg:text-[3.5rem]">
              {copy.hero.title}{" "}
              <span className="bg-[linear-gradient(120deg,var(--itq-color-brand-strong),var(--itq-color-brand-500))] bg-clip-text text-transparent">
                {copy.hero.highlightedTitle}
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-9 text-[var(--itq-color-muted)]">
              {copy.hero.description}
            </p>
            <div className="mt-8 flex flex-col flex-wrap gap-3 sm:flex-row">
              <Link
                className="itq-sheen inline-flex min-h-12 items-center justify-center rounded-xl bg-[linear-gradient(120deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] px-6 py-3 font-black text-white shadow-[var(--itq-shadow-float)] transition hover:-translate-y-0.5 hover:shadow-[var(--itq-shadow-lg)]"
                href={`${prefix}/services`}
              >
                {copy.hero.primaryLabel}
              </Link>
              <WhatsAppLink
                appearance="light"
                label={copy.hero.whatsappLabel}
                locale={locale}
                message={copy.hero.whatsappMessage}
              />
              <InstallAppButton locale={locale} surface="public" variant="hero" />
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm font-bold text-[var(--itq-color-ink-soft)]">
              {copy.trustItems.slice(0, 3).map((item) => (
                <span className="inline-flex items-center gap-2" key={item.title}>
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                    <MarketingIcon className="size-3" name="check" />
                  </span>
                  {item.title}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="relative border-t border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] lg:hidden">
          <Image
            alt={copy.hero.imageAlt}
            className={classNames("h-auto w-full", locale === "en" && "-scale-x-100")}
            height={887}
            priority
            sizes="100vw"
            src="/images/itqanak-hero-v2.png"
            width={1776}
          />
        </div>
      </section>

      <section aria-label={copy.hero.eyebrow} className="relative z-10 mx-3 -mt-5 sm:mx-8 lg:mx-12">
        <div className="grid overflow-hidden rounded-3xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-[var(--itq-shadow-card)] md:grid-cols-3">
          {copy.trustItems.map((item, index) => (
            <article
              className={classNames(
                "itq-rise group flex gap-4 p-5 transition-colors duration-300 hover:bg-[var(--itq-color-brand-50)]/45 sm:p-6",
                index === 1 && "itq-rise-2",
                index === 2 && "itq-rise-3",
                index > 0 && "border-t border-[var(--itq-color-border)] md:border-s md:border-t-0",
              )}
              key={item.title}
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--itq-color-brand-50),color-mix(in_srgb,var(--itq-color-accent-200)_55%,transparent))] text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-sm)] transition duration-300 group-hover:bg-[linear-gradient(135deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] group-hover:text-white">
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

      <section aria-labelledby="services-preview-title" className="py-20 sm:py-24">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionIntro
            description={copy.services.description}
            eyebrow={copy.services.eyebrow}
            title={copy.services.title}
            titleId="services-preview-title"
          />
          <Link
            className="group inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-5 py-2 text-sm font-black text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--itq-color-brand-300)] hover:bg-[var(--itq-color-brand-50)]"
            href={`${prefix}/services`}
          >
            {copy.services.allCta}
            <MarketingIcon
              className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
              name="arrow-right"
            />
          </Link>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {copy.services.items.map((service) => (
            <FeatureCard
              description={service.description}
              icon={service.icon}
              key={service.title}
              title={service.title}
            >
              <Link
                className="mt-5 inline-flex min-h-11 items-center text-sm font-black text-[var(--itq-color-brand-strong)] underline decoration-[var(--itq-color-brand-200)] decoration-2 underline-offset-8 hover:text-[var(--itq-color-brand-strong)]"
                href={
                  service.slug === undefined
                    ? `${prefix}/services`
                    : `${prefix}/services/${service.slug}`
                }
              >
                {copy.services.itemCta}
              </Link>
            </FeatureCard>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="process-title"
        className="scroll-mt-28 rounded-[var(--itq-radius-hero)] bg-[var(--itq-color-surface-soft)] px-5 py-14 ring-1 ring-[var(--itq-color-border)] sm:px-10 sm:py-16"
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

      <section className="grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-24">
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-6 -z-10 rounded-full bg-[var(--itq-color-brand-100)]/60 blur-3xl"
          />
          <RequestPreview locale={locale} />
        </div>
        <div>
          <SectionIntro
            description={copy.portal.description}
            eyebrow={copy.portal.eyebrow}
            title={copy.portal.title}
          />
          <ul className="mt-7 grid gap-4">
            {copy.portal.points.map((point) => (
              <li className="flex items-start gap-3 font-bold leading-7" key={point}>
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                  <MarketingIcon className="size-4" name="check" />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <Link
            className="itq-sheen mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-[linear-gradient(120deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] px-6 py-3 font-black text-white shadow-[var(--itq-shadow-md)] transition hover:-translate-y-0.5 hover:shadow-[var(--itq-shadow-lg)]"
            href={`${prefix}/auth/login`}
          >
            {copy.portal.cta}
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="why-title"
        className="scroll-mt-28 border-y border-[var(--itq-color-border)] py-20 sm:py-24"
        id="why-itqanak"
      >
        <SectionIntro
          align="center"
          description={copy.why.description}
          eyebrow={copy.why.eyebrow}
          title={copy.why.title}
          titleId="why-title"
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {copy.why.items.map((item) => (
            <FeatureCard
              className="shadow-none"
              description={item.description}
              icon={item.icon}
              key={item.title}
              title={item.title}
            />
          ))}
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="relative overflow-hidden rounded-[var(--itq-radius-hero)] bg-[linear-gradient(135deg,var(--itq-color-brand-900),var(--itq-color-brand-950))] p-7 text-white shadow-[var(--itq-shadow-card)] sm:p-12">
          <div
            aria-hidden="true"
            className="absolute -end-20 -top-28 size-80 rounded-full border-[3rem] border-white/[0.05]"
          />
          <div
            aria-hidden="true"
            className="itq-float-slower pointer-events-none absolute -start-10 bottom-[-6rem] size-72 rounded-full bg-[radial-gradient(circle_at_40%_40%,color-mix(in_srgb,var(--itq-color-accent-500)_38%,transparent),transparent_70%)] blur-2xl"
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--itq-color-accent-300)_75%,transparent),transparent)]"
          />
          <div className="relative grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)_minmax(17rem,0.6fr)] lg:items-center">
            <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-white/10 text-[var(--itq-color-accent-200)] ring-1 ring-white/15">
              <MarketingIcon className="size-8" name="shield" />
            </span>
            <div>
              <p className="text-sm font-black text-[var(--itq-color-accent-200)]">
                {copy.integrity.eyebrow}
              </p>
              <h2 className="mt-2 text-3xl font-black leading-10">{copy.integrity.title}</h2>
              <p className="mt-4 max-w-2xl leading-8 text-white/70">{copy.integrity.description}</p>
            </div>
            <p className="rounded-2xl border border-white/15 bg-white/10 p-5 text-sm font-bold leading-7 text-white/85">
              {copy.integrity.commitment}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="scroll-mt-28 pb-20 sm:pb-24" id="faq">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
          <div className="lg:sticky lg:top-28">
            <SectionIntro
              description={copy.faq.description}
              eyebrow={copy.faq.eyebrow}
              title={copy.faq.title}
              titleId="faq-title"
            />
            <div className="mt-7 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-5">
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

      <section className="itq-aurora mb-6 overflow-hidden rounded-[var(--itq-radius-hero)] bg-[var(--itq-color-canvas-warm)] p-7 ring-1 ring-[var(--itq-color-accent-200)]/70 sm:p-12">
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--itq-color-accent-200)] bg-[var(--itq-color-accent-50)] px-3.5 py-1.5 text-xs font-black text-[var(--itq-color-accent-700)]">
              <MarketingIcon className="size-3.5" name="sparkles" />
              {copy.finalCta.eyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-black leading-10 sm:text-4xl">
              {copy.finalCta.title}
            </h2>
            <p className="mt-4 leading-8 text-[var(--itq-color-muted)]">
              {copy.finalCta.description}
            </p>
          </div>
          <div className="flex w-full flex-col flex-wrap gap-3 sm:w-auto sm:flex-row">
            <Link
              className="itq-sheen inline-flex min-h-12 items-center justify-center rounded-xl bg-[linear-gradient(120deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] px-6 py-3 font-black text-white shadow-[var(--itq-shadow-md)] transition hover:-translate-y-0.5 hover:shadow-[var(--itq-shadow-lg)]"
              href={`${prefix}/services`}
            >
              {copy.finalCta.primaryLabel}
            </Link>
            <WhatsAppLink
              label={copy.finalCta.whatsappLabel}
              locale={locale}
              message={copy.hero.whatsappMessage}
            />
            <InstallAppButton locale={locale} surface="public" variant="hero" />
          </div>
        </div>
      </section>
    </>
  );
}
