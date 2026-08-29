import Link from "next/link";
import type { JSX } from "react";

import { FeatureCard } from "./feature-card";
import { MarketingIcon, type MarketingIconName } from "./marketing-icon";
import { ProcessSteps, type ProcessStep } from "./process-steps";
import { SectionIntro } from "./section-intro";
import { WhatsAppLink, type MarketingLocale } from "./whatsapp-link";

export interface PublicServiceDetail {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly categoryName: string;
  readonly acceptsFiles: boolean;
  readonly maximumFiles: number;
  readonly defaultDeadlineHours: number | null;
}

export interface ServiceDetailCopy {
  readonly backLabel: string;
  readonly requestLabel: string;
  readonly askLabel: string;
  readonly whatsappMessage: string;
  readonly overviewLabel: string;
  readonly processFact: string;
  readonly processFactValue: string;
  readonly filesFact: string;
  readonly filesAccepted: (maximumFiles: number) => string;
  readonly filesNotNeeded: string;
  readonly timingFact: string;
  readonly timingValue: (hours: number) => string;
  readonly timingFlexible: string;
  readonly benefitsEyebrow: string;
  readonly benefitsTitle: string;
  readonly benefitsDescription: string;
  readonly benefits: readonly {
    readonly icon: MarketingIconName;
    readonly title: string;
    readonly description: string;
  }[];
  readonly stepsEyebrow: string;
  readonly stepsTitle: string;
  readonly stepsDescription: string;
  readonly steps: readonly ProcessStep[];
  readonly prepareTitle: string;
  readonly prepareDescription: string;
  readonly prepareItems: readonly string[];
  readonly integrityTitle: string;
  readonly integrityDescription: string;
  readonly finalTitle: string;
  readonly finalDescription: string;
}

interface ServiceDetailViewProps {
  readonly locale?: MarketingLocale;
  readonly service: PublicServiceDetail;
  readonly copy: ServiceDetailCopy;
}

export function ServiceDetailView({
  copy,
  locale = "ar",
  service,
}: ServiceDetailViewProps): JSX.Element {
  const prefix = `/${locale}`;
  const whatsappMessage = `${copy.whatsappMessage} ${service.name}`;
  return (
    <>
      <nav aria-label={copy.backLabel} className="mb-5">
        <Link
          className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-black text-[var(--itq-color-brand-strong)] hover:bg-[var(--itq-color-brand-50)]"
          href={`${prefix}/services`}
        >
          {copy.backLabel}
        </Link>
      </nav>

      <section className="relative overflow-hidden rounded-[var(--itq-radius-hero)] border border-[var(--itq-color-border)] bg-[var(--itq-color-brand-900)] p-6 text-white shadow-[var(--itq-shadow-card)] sm:p-10 lg:p-12">
        <div
          aria-hidden="true"
          className="absolute -end-20 -top-24 size-80 rounded-full border-[3rem] border-white/[0.04]"
        />
        <div className="relative grid gap-9 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-[var(--itq-color-accent-200)]">
              {service.categoryName}
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.3] tracking-tight sm:text-5xl">
              {service.name}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-9 text-white/75">{service.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--itq-color-surface)] px-6 py-3 font-black text-[var(--itq-color-brand-strong)] transition hover:-translate-y-0.5 hover:bg-[var(--itq-color-brand-50)]"
                href={`${prefix}/student/requests/new?service=${encodeURIComponent(service.slug)}`}
              >
                {copy.requestLabel}
              </Link>
              <WhatsAppLink
                appearance="glass"
                label={copy.askLabel}
                locale={locale}
                message={whatsappMessage}
              />
            </div>
          </div>
          <aside className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
            <p className="text-sm font-black text-[var(--itq-color-accent-200)]">
              {copy.overviewLabel}
            </p>
            <dl className="mt-4 grid gap-4 text-sm">
              <div className="flex items-start gap-3">
                <MarketingIcon
                  className="mt-0.5 size-5 shrink-0 text-[var(--itq-color-accent-200)]"
                  name="route"
                />
                <div>
                  <dt className="text-white/60">{copy.processFact}</dt>
                  <dd className="mt-1 font-black">{copy.processFactValue}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MarketingIcon
                  className="mt-0.5 size-5 shrink-0 text-[var(--itq-color-accent-200)]"
                  name="files"
                />
                <div>
                  <dt className="text-white/60">{copy.filesFact}</dt>
                  <dd className="mt-1 font-black">
                    {service.acceptsFiles
                      ? copy.filesAccepted(service.maximumFiles)
                      : copy.filesNotNeeded}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MarketingIcon
                  className="mt-0.5 size-5 shrink-0 text-[var(--itq-color-accent-200)]"
                  name="sparkles"
                />
                <div>
                  <dt className="text-white/60">{copy.timingFact}</dt>
                  <dd className="mt-1 font-black">
                    {service.defaultDeadlineHours === null
                      ? copy.timingFlexible
                      : copy.timingValue(service.defaultDeadlineHours)}
                  </dd>
                </div>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section aria-labelledby="benefits-title" className="py-16 sm:py-20">
        <SectionIntro
          description={copy.benefitsDescription}
          eyebrow={copy.benefitsEyebrow}
          title={copy.benefitsTitle}
          titleId="benefits-title"
        />
        <div className="mt-9 grid gap-5 md:grid-cols-3">
          {copy.benefits.map((benefit) => (
            <FeatureCard
              description={benefit.description}
              icon={benefit.icon}
              key={benefit.title}
              title={benefit.title}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="service-steps-title" className="pb-16 sm:pb-20">
        <SectionIntro
          description={copy.stepsDescription}
          eyebrow={copy.stepsEyebrow}
          title={copy.stepsTitle}
          titleId="service-steps-title"
        />
        <div className="mt-9">
          <ProcessSteps locale={locale} steps={copy.steps} />
        </div>
      </section>

      <section className="grid gap-5 pb-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] sm:pb-20">
        <div className="rounded-3xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-7 shadow-[var(--itq-shadow-sm)] sm:p-9">
          <h2 className="text-2xl font-black">{copy.prepareTitle}</h2>
          <p className="mt-3 leading-8 text-[var(--itq-color-muted)]">{copy.prepareDescription}</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {copy.prepareItems.map((item) => (
              <li className="flex items-start gap-3 font-bold leading-7" key={item}>
                <span className="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                  <MarketingIcon className="size-4" name="check" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <aside className="rounded-3xl border border-[var(--itq-color-accent-200)] bg-[var(--itq-color-canvas-warm)] p-7 sm:p-9">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-[var(--itq-color-surface)] text-[var(--itq-color-accent-700)] shadow-sm">
            <MarketingIcon name="shield" />
          </span>
          <h2 className="mt-5 text-2xl font-black">{copy.integrityTitle}</h2>
          <p className="mt-3 leading-8 text-[var(--itq-color-muted)]">
            {copy.integrityDescription}
          </p>
        </aside>
      </section>

      <section className="mb-6 rounded-3xl bg-[var(--itq-color-brand-700)] p-7 text-white shadow-[var(--itq-shadow-card)] sm:p-10">
        <div className="flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black sm:text-3xl">{copy.finalTitle}</h2>
            <p className="mt-3 leading-8 text-white/75">{copy.finalDescription}</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--itq-color-surface)] px-6 py-3 font-black text-[var(--itq-color-brand-strong)] hover:bg-[var(--itq-color-brand-50)]"
              href={`${prefix}/student/requests/new?service=${encodeURIComponent(service.slug)}`}
            >
              {copy.requestLabel}
            </Link>
            <WhatsAppLink
              appearance="glass"
              label={copy.askLabel}
              locale={locale}
              message={whatsappMessage}
            />
          </div>
        </div>
      </section>
    </>
  );
}
