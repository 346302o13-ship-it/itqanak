import Link from "next/link";
import type { JSX } from "react";

import { MarketingIcon, type MarketingIconName } from "./marketing-icon";
import { SectionIntro } from "./section-intro";
import { WhatsAppLink, type MarketingLocale } from "./whatsapp-link";

export interface PublicCatalogService {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string;
  readonly acceptsFiles: boolean;
}

export interface PublicCatalogCategory {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly services: readonly PublicCatalogService[];
}

export interface ServicesCatalogCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly categoryNavLabel: string;
  readonly catalogEyebrow: string;
  readonly catalogTitle: string;
  readonly detailsLabel: string;
  readonly acceptsFilesLabel: string;
  readonly noFilesLabel: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly supportEyebrow: string;
  readonly supportTitle: string;
  readonly supportDescription: string;
  readonly whatsappMessage: string;
}

interface ServicesCatalogViewProps {
  readonly locale?: MarketingLocale;
  readonly categories: readonly PublicCatalogCategory[];
  readonly copy: ServicesCatalogCopy;
}

const categoryIcons: readonly MarketingIconName[] = [
  "translate",
  "palette",
  "document",
  "code",
  "compass",
  "training",
];

export function ServicesCatalogView({
  categories,
  copy,
  locale = "ar",
}: ServicesCatalogViewProps): JSX.Element {
  const prefix = `/${locale}`;
  return (
    <>
      <section className="relative overflow-hidden rounded-[var(--itq-radius-hero)] border border-[var(--itq-color-border)] bg-[var(--itq-color-brand-900)] px-6 py-10 text-white shadow-[var(--itq-shadow-card)] sm:px-10 sm:py-14 lg:px-14">
        <div
          aria-hidden="true"
          className="absolute -end-24 -top-24 size-80 rounded-full border-[3rem] border-white/[0.035]"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-40 start-1/3 size-72 rounded-full bg-[var(--itq-color-brand-600)]/20 blur-3xl"
        />
        <div className="relative grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="max-w-3xl">
            <p className="text-sm font-black text-[var(--itq-color-accent-200)]">{copy.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-black leading-[1.3] tracking-tight sm:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/75">{copy.description}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
            <p className="text-sm leading-7 text-white/80">{copy.supportDescription}</p>
            <WhatsAppLink
              appearance="light"
              className="mt-4 w-full"
              locale={locale}
              message={copy.whatsappMessage}
            />
          </div>
        </div>
      </section>

      {categories.length === 0 ? (
        <section className="my-12 rounded-3xl border border-dashed border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] p-10 text-center">
          <MarketingIcon
            className="mx-auto size-10 text-[var(--itq-color-brand-strong)]"
            name="files"
          />
          <h2 className="mt-5 text-2xl font-black">{copy.emptyTitle}</h2>
          <p className="mt-3 text-[var(--itq-color-muted)]">{copy.emptyDescription}</p>
        </section>
      ) : (
        <>
          <nav
            aria-label={copy.categoryNavLabel}
            className="mt-8 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]"
          >
            {categories.map((category) => (
              <a
                className="shrink-0 rounded-full border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 py-2.5 text-sm font-black text-[var(--itq-color-ink-soft)] shadow-sm transition hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)]"
                href={`#category-${category.slug}`}
                key={category.id}
              >
                {category.name}
              </a>
            ))}
          </nav>

          <section aria-labelledby="catalog-title" className="py-16 sm:py-20">
            <SectionIntro
              description={copy.description}
              eyebrow={copy.catalogEyebrow}
              title={copy.catalogTitle}
              titleId="catalog-title"
            />
            <div className="mt-9 grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
              {categories.map((category, categoryIndex) => (
                <article
                  className="group scroll-mt-28 overflow-hidden rounded-3xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-[var(--itq-shadow-sm)] transition duration-300 hover:-translate-y-1 hover:border-[var(--itq-color-brand-200)] hover:shadow-[var(--itq-shadow-card)]"
                  id={`category-${category.slug}`}
                  key={category.id}
                >
                  <div className="border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-6">
                    <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)] shadow-sm">
                      <MarketingIcon
                        name={categoryIcons[categoryIndex % categoryIcons.length] ?? "sparkles"}
                      />
                    </span>
                    <h2 className="mt-5 text-2xl font-black">{category.name}</h2>
                    <p className="mt-2 min-h-14 leading-7 text-[var(--itq-color-muted)]">
                      {category.description}
                    </p>
                  </div>
                  <div className="divide-y divide-[var(--itq-color-border)]">
                    {category.services.map((service) => (
                      <div className="p-6" key={service.id}>
                        <h3 className="text-lg font-black">{service.name}</h3>
                        <p className="mt-2 min-h-14 text-sm leading-7 text-[var(--itq-color-muted)]">
                          {service.shortDescription}
                        </p>
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--itq-color-muted)]">
                            <MarketingIcon
                              className="size-4"
                              name={service.acceptsFiles ? "files" : "check"}
                            />
                            {service.acceptsFiles ? copy.acceptsFilesLabel : copy.noFilesLabel}
                          </span>
                          <Link
                            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--itq-color-brand-700)] px-4 py-2 text-sm font-black text-white transition hover:bg-[var(--itq-color-brand-800)]"
                            href={`${prefix}/services/${service.slug}`}
                          >
                            {copy.detailsLabel}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="mb-6 overflow-hidden rounded-3xl bg-[var(--itq-color-canvas-warm)] p-7 ring-1 ring-[var(--itq-color-accent-200)]/70 sm:p-10">
        <div className="flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-black text-[var(--itq-color-accent-700)]">
              {copy.supportEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-black leading-9 sm:text-3xl">{copy.supportTitle}</h2>
            <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
              {copy.supportDescription}
            </p>
          </div>
          <WhatsAppLink
            className="w-full sm:w-auto"
            locale={locale}
            message={copy.whatsappMessage}
          />
        </div>
      </section>
    </>
  );
}
