import Link from "next/link";
import type { CSSProperties, JSX } from "react";

import { MarketingIcon, type MarketingIconName } from "./marketing-icon";
import { SectionIntro } from "./section-intro";
import { WhatsAppLink, type MarketingLocale } from "./whatsapp-link";

export interface PublicCatalogService {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string;
  readonly acceptsFiles: boolean;
  /** e.g. "يبدأ من ٢٥ ر.س." — omitted for quote-only services. */
  readonly priceLabel?: string;
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
  /** Ribbon on the lead (most-requested) category cards. */
  readonly popularBadge: string;
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
  "training",
  "compass",
  "palette",
  "document",
  "route",
  "translate",
  "sparkles",
  "code",
  "files",
];

const geometryStyle: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.10' stroke-width='1.3'%3E%3Crect x='18' y='18' width='36' height='36'/%3E%3Crect x='18' y='18' width='36' height='36' transform='rotate(45 36 36)'/%3E%3Ccircle cx='36' cy='36' r='3'/%3E%3C/g%3E%3C/svg%3E\")",
  backgroundSize: "72px 72px",
};

export function ServicesCatalogView({
  categories,
  copy,
  locale = "ar",
}: ServicesCatalogViewProps): JSX.Element {
  const prefix = `/${locale}`;
  return (
    <>
      <section className="relative isolate overflow-hidden rounded-[var(--itq-radius-hero)] bg-[linear-gradient(160deg,var(--itq-color-brand-800),var(--itq-color-brand-950))] px-6 py-12 text-white shadow-[var(--itq-shadow-card)] sm:px-10 sm:py-14 lg:px-14">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-[var(--itq-color-accent-500)]"
        />
        <div aria-hidden="true" className="absolute inset-0 opacity-60" style={geometryStyle} />
        <div className="relative grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--itq-color-accent-300)]">
              {copy.eyebrow}
            </p>
            <h1 className="mt-4 text-[2.15rem] font-black leading-[1.15] tracking-[-0.01em] sm:text-[2.9rem]">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/80">{copy.description}</p>
          </div>
          <div className="rounded-[var(--itq-radius-control)] border border-white/15 bg-white/10 p-5">
            <p className="text-sm leading-7 text-white/80">{copy.supportDescription}</p>
            <WhatsAppLink
              appearance="glass"
              className="mt-4 w-full"
              locale={locale}
              message={copy.whatsappMessage}
            />
          </div>
        </div>
      </section>

      {categories.length === 0 ? (
        <section className="my-12 rounded-[var(--itq-radius-panel)] border border-dashed border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] p-10 text-center">
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
            className="sticky top-[4.75rem] z-30 -mx-4 mt-8 flex gap-2 overflow-x-auto border-b border-[var(--itq-color-border)] bg-[var(--itq-color-canvas)]/92 px-4 py-3 backdrop-blur-md [scrollbar-width:thin] sm:-mx-6 sm:px-6"
          >
            {categories.map((category) => (
              <a
                className="shrink-0 rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 py-2 text-sm font-black text-[var(--itq-color-ink-soft)] transition hover:border-[var(--itq-color-brand-300)] hover:bg-[var(--itq-color-brand-50)] hover:text-[var(--itq-color-brand-strong)]"
                href={`#category-${category.slug}`}
                key={category.id}
              >
                {category.name}
              </a>
            ))}
          </nav>

          <section aria-labelledby="catalog-title" className="itq-section">
            <SectionIntro
              description={copy.description}
              eyebrow={copy.catalogEyebrow}
              title={copy.catalogTitle}
              titleId="catalog-title"
            />
            <div className="mt-9 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {categories.map((category, categoryIndex) => {
                const lead = categoryIndex < 2;
                return (
                  <article
                    className="group relative scroll-mt-36 overflow-hidden rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--itq-color-brand-300)] hover:shadow-[var(--itq-shadow-sm)]"
                    id={`category-${category.slug}`}
                    key={category.id}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-0 top-0 h-1 ${
                        lead
                          ? "bg-[var(--itq-color-accent-500)]"
                          : "bg-[var(--itq-color-brand-600)]"
                      }`}
                    />
                    <div className="relative border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-6">
                      {lead ? (
                        <span className="absolute end-4 top-4 inline-flex items-center rounded-md bg-[var(--itq-color-accent-500)] px-2.5 py-1 text-[11px] font-black text-[var(--itq-color-brand-950)]">
                          {copy.popularBadge}
                        </span>
                      ) : null}
                      <span className="inline-flex size-11 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                        <MarketingIcon
                          className="size-5"
                          name={categoryIcons[categoryIndex % categoryIcons.length] ?? "sparkles"}
                        />
                      </span>
                      <h2 className="mt-4 text-xl font-black tracking-tight">{category.name}</h2>
                      <p className="mt-2 min-h-12 text-sm leading-7 text-[var(--itq-color-muted)]">
                        {category.description}
                      </p>
                    </div>
                    <div className="divide-y divide-[var(--itq-color-border)]">
                      {category.services.map((service) => (
                        <div className="p-5" key={service.id}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h3 className="font-black">{service.name}</h3>
                            {service.priceLabel === undefined ? null : (
                              <span className="shrink-0 rounded-md bg-[var(--itq-color-brand-50)] px-2.5 py-1 text-sm font-black text-[var(--itq-color-brand-strong)]">
                                {service.priceLabel}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 min-h-12 text-sm leading-7 text-[var(--itq-color-muted)]">
                            {service.shortDescription}
                          </p>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--itq-color-muted)]">
                              <MarketingIcon
                                className="size-4"
                                name={service.acceptsFiles ? "files" : "check"}
                              />
                              {service.acceptsFiles ? copy.acceptsFilesLabel : copy.noFilesLabel}
                            </span>
                            <Link
                              className="inline-flex min-h-10 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] px-4 text-sm font-black text-white transition hover:bg-[var(--itq-color-brand-800)]"
                              href={`${prefix}/services/${service.slug}`}
                            >
                              {copy.detailsLabel}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      <section className="mb-6 overflow-hidden rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-7 sm:p-10">
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
