import Link from "next/link";
import type { JSX } from "react";

import { MarketingIcon, WhatsAppLink, type MarketingLocale } from "./marketing";
import { PublicShell } from "./public-shell";

export interface LegalSection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
}

export interface LegalPageCopy {
  readonly locale: MarketingLocale;
  readonly alternateHref: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly introduction: string;
  readonly versionLabel: string;
  readonly version: string;
  readonly effectiveLabel: string;
  readonly effectiveDate: string;
  readonly contentsLabel: string;
  readonly notice: string;
  readonly sections: readonly LegalSection[];
  readonly contactEyebrow: string;
  readonly contactTitle: string;
  readonly contactDescription: string;
  readonly contactLabel: string;
  readonly contactMessage: string;
  readonly relatedHref: string;
  readonly relatedLabel: string;
}

interface LegalPageProps {
  readonly copy: LegalPageCopy;
}

export function LegalPage({ copy }: LegalPageProps): JSX.Element {
  return (
    <PublicShell alternateHref={copy.alternateHref} locale={copy.locale}>
      <section className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,var(--itq-color-brand-950),var(--itq-color-brand-700))] px-5 py-9 text-white shadow-[var(--itq-shadow-lg)] sm:px-9 sm:py-12 lg:px-12">
        <div className="max-w-4xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black tracking-wide">
            <MarketingIcon className="size-4" name="shield" />
            {copy.eyebrow}
          </p>
          <h1 className="mt-6 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base font-medium leading-8 text-white/80 sm:text-lg">
            {copy.introduction}
          </p>
          <dl className="mt-7 flex flex-wrap gap-3 text-sm font-bold">
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
              <dt className="inline text-white/65">{copy.versionLabel}: </dt>
              <dd className="inline" dir="ltr">
                {copy.version}
              </dd>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
              <dt className="inline text-white/65">{copy.effectiveLabel}: </dt>
              <dd className="inline">{copy.effectiveDate}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mt-8 grid items-start gap-7 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-28">
          <nav
            aria-label={copy.contentsLabel}
            className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)]"
          >
            <h2 className="flex items-center gap-2 font-black text-[var(--itq-color-ink)]">
              <MarketingIcon
                className="size-5 text-[var(--itq-color-brand-strong)]"
                name="document"
              />
              {copy.contentsLabel}
            </h2>
            <ol className="mt-4 grid gap-1 text-sm font-bold text-[var(--itq-color-muted)]">
              {copy.sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    className="flex gap-2 rounded-xl px-3 py-2.5 transition hover:bg-[var(--itq-color-brand-50)] hover:text-[var(--itq-color-brand-strong)]"
                    href={`#${section.id}`}
                  >
                    <span aria-hidden="true" className="text-[var(--itq-color-brand-500)]">
                      {index + 1}.
                    </span>
                    <span>{section.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <p className="mt-4 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-brand-50)] p-4 text-xs font-bold leading-6 text-[var(--itq-color-ink-soft)]">
            {copy.notice}
          </p>
        </aside>

        <article className="grid min-w-0 gap-5">
          {copy.sections.map((section, index) => (
            <section
              className="scroll-mt-28 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-7"
              id={section.id}
              key={section.id}
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--itq-color-brand-50)] text-sm font-black text-[var(--itq-color-brand-strong)]"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-black leading-8 text-[var(--itq-color-ink)]">
                    {section.title}
                  </h2>
                  <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--itq-color-ink-soft)] sm:text-base sm:leading-8">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  {section.bullets && section.bullets.length > 0 ? (
                    <ul className="mt-4 grid gap-3 text-sm leading-7 text-[var(--itq-color-ink-soft)] sm:text-base sm:leading-8">
                      {section.bullets.map((bullet) => (
                        <li className="flex items-start gap-3" key={bullet}>
                          <MarketingIcon
                            className="mt-1.5 size-4 shrink-0 text-[var(--itq-color-brand-600)]"
                            name="check"
                          />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </section>
          ))}

          <section className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-ink)] p-6 text-white shadow-[var(--itq-shadow-md)] sm:p-8">
            <p className="text-xs font-black tracking-wide text-[var(--itq-color-accent-300)]">
              {copy.contactEyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-black">{copy.contactTitle}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
              {copy.contactDescription}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <WhatsAppLink
                appearance="glass"
                label={copy.contactLabel}
                locale={copy.locale}
                message={copy.contactMessage}
              />
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                href={copy.relatedHref}
              >
                {copy.relatedLabel}
              </Link>
            </div>
          </section>
        </article>
      </div>
    </PublicShell>
  );
}
