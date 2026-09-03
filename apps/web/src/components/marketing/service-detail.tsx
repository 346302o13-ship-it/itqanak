import Link from "next/link";
import type { JSX } from "react";

import { FeatureCard } from "./feature-card";
import { GreenBand } from "./green-band";
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
  /** "يبدأ من ٢٥ ر.س." — omitted for quote-only services. */
  readonly priceLabel?: string;
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
  const requestHref = `${prefix}/student/requests/new?service=${encodeURIComponent(service.slug)}`;
  const facts: readonly {
    readonly icon: MarketingIconName;
    readonly term: string;
    readonly value: string;
  }[] = [
    ...(service.priceLabel === undefined
      ? []
      : [
          {
            icon: "sparkles" as const,
            term: locale === "en" ? "Price" : "السعر",
            value: service.priceLabel,
          },
        ]),
    { icon: "route", term: copy.processFact, value: copy.processFactValue },
    {
      icon: "files",
      term: copy.filesFact,
      value: service.acceptsFiles ? copy.filesAccepted(service.maximumFiles) : copy.filesNotNeeded,
    },
    {
      icon: "sparkles",
      term: copy.timingFact,
      value:
        service.defaultDeadlineHours === null
          ? copy.timingFlexible
          : copy.timingValue(service.defaultDeadlineHours),
    },
  ];

  return (
    <>
      <nav aria-label={copy.backLabel} className="mb-4">
        <Link
          className="inline-flex min-h-11 items-center rounded-[var(--itq-radius-control)] px-2 text-sm font-black text-[var(--itq-color-brand-strong)] hover:bg-[var(--itq-color-brand-50)]"
          href={`${prefix}/services`}
        >
          {copy.backLabel}
        </Link>
      </nav>

      <GreenBand ariaLabelledBy="service-detail-title">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <span className="inline-flex rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-[0.12em] text-[var(--itq-color-accent-300)]">
              {service.categoryName}
            </span>
            <h1
              className="mt-4 max-w-3xl text-[1.85rem] font-black leading-[1.12] tracking-[-0.015em] sm:text-[2.35rem] lg:text-[2.7rem]"
              id="service-detail-title"
            >
              {service.name}
            </h1>
            <p className="mt-3.5 max-w-3xl text-[0.98rem] leading-7 text-white/85 sm:text-base">
              {service.description}
            </p>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-accent-500)] px-6 font-black text-[var(--itq-color-brand-950)] shadow-[var(--itq-shadow-sm)] transition hover:brightness-105"
                href={requestHref}
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
          <aside className="rounded-[var(--itq-radius-control)] border border-white/15 bg-white/[0.07] p-5">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--itq-color-accent-300)]">
              {copy.overviewLabel}
            </p>
            <dl className="mt-3.5 grid gap-3.5 text-sm">
              {facts.map((fact) => (
                <div className="flex items-start gap-3" key={`${fact.term}-${fact.value}`}>
                  <MarketingIcon
                    className="mt-0.5 size-4 shrink-0 text-[var(--itq-color-accent-300)]"
                    name={fact.icon}
                  />
                  <div>
                    <dt className="text-white/70">{fact.term}</dt>
                    <dd className="mt-0.5 font-black">{fact.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </GreenBand>

      <section aria-labelledby="benefits-title" className="itq-section">
        <SectionIntro
          description={copy.benefitsDescription}
          eyebrow={copy.benefitsEyebrow}
          title={copy.benefitsTitle}
          titleId="benefits-title"
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
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

      <section
        aria-labelledby="service-steps-title"
        className="itq-section scroll-mt-28 border-y border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)]"
      >
        <SectionIntro
          align="center"
          description={copy.stepsDescription}
          eyebrow={copy.stepsEyebrow}
          title={copy.stepsTitle}
          titleId="service-steps-title"
        />
        <div className="mt-8">
          <ProcessSteps locale={locale} steps={copy.steps} />
        </div>
      </section>

      <section className="itq-section grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 sm:p-8">
          <h2 className="text-xl font-black sm:text-2xl">{copy.prepareTitle}</h2>
          <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">{copy.prepareDescription}</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {copy.prepareItems.map((item) => (
              <li className="flex items-start gap-3 text-[0.95rem] font-bold leading-7" key={item}>
                <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                  <MarketingIcon className="size-3.5" name="check" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <aside className="rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-6 sm:p-8">
          <span className="inline-flex size-11 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-surface)] text-[var(--itq-color-accent-700)]">
            <MarketingIcon className="size-5" name="shield" />
          </span>
          <h2 className="mt-4 text-xl font-black sm:text-2xl">{copy.integrityTitle}</h2>
          <p className="mt-3 text-[0.95rem] leading-7 text-[var(--itq-color-muted)]">
            {copy.integrityDescription}
          </p>
        </aside>
      </section>

      <GreenBand ariaLabelledBy="service-final-title" className="-mb-24 lg:-mb-28">
        <div className="flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h2 className="text-xl font-black leading-8 sm:text-2xl" id="service-final-title">
              {copy.finalTitle}
            </h2>
            <p className="mt-3 text-[0.95rem] leading-7 text-white/85">{copy.finalDescription}</p>
          </div>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-accent-500)] px-6 font-black text-[var(--itq-color-brand-950)] transition hover:brightness-105"
              href={requestHref}
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
      </GreenBand>
    </>
  );
}
