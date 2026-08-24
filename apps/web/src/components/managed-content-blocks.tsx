import Link from "next/link";

import type { ContentBlock, ContentVariant } from "@itqanak/content";

import { ArrowIcon, BellIcon, ServicesIcon } from "./icons";

interface ManagedContentBlocksProps {
  readonly blocks: readonly ContentBlock[];
  readonly locale: "ar" | "en";
  readonly surface: "landing" | "student";
}

const toneByVariant: Readonly<Record<ContentVariant, string>> = {
  INFO: "border-sky-200 bg-sky-50 text-sky-950",
  HIGHLIGHT: "border-emerald-200 bg-emerald-50 text-emerald-950",
  ANNOUNCEMENT: "border-amber-200 bg-amber-50 text-amber-950",
  ACTION: "border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-900)] text-white",
};

export function localizedManagedContentHref(href: string, locale: "ar" | "en"): string {
  if (/^\/(?:ar|en)(?=\/|[?#]|$)/u.test(href)) {
    return href.replace(/^\/(?:ar|en)(?=\/|[?#]|$)/u, `/${locale}`);
  }
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

function BlockAction({ block, locale }: Readonly<{ block: ContentBlock; locale: "ar" | "en" }>) {
  if (block.actionHref === null) return null;
  const label = locale === "ar" ? block.actionLabelAr : block.actionLabelEn;
  if (label === null) return null;
  const className =
    block.variant === "ACTION"
      ? "inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-2 text-sm font-black text-[var(--itq-color-brand-900)] shadow-sm"
      : "inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-2 text-sm font-black text-white shadow-sm";
  if (block.actionHref.startsWith("/")) {
    return (
      <Link className={className} href={localizedManagedContentHref(block.actionHref, locale)}>
        {label} <ArrowIcon className={`size-4 ${locale === "en" ? "-scale-x-100" : ""}`} />
      </Link>
    );
  }
  return (
    <a className={className} href={block.actionHref} rel="noopener noreferrer" target="_blank">
      {label} <ArrowIcon className={`size-4 ${locale === "en" ? "-scale-x-100" : ""}`} />
    </a>
  );
}

export function ManagedContentBlocks({ blocks, locale, surface }: ManagedContentBlocksProps) {
  if (blocks.length === 0) return null;
  const english = locale === "en";
  return (
    <section
      aria-label={english ? "Platform updates" : "تحديثات المنصة"}
      className={surface === "landing" ? "py-8 sm:py-10" : "mt-8"}
      data-managed-content={surface}
    >
      <div className={surface === "landing" ? "grid gap-5 md:grid-cols-2" : "grid gap-4"}>
        {blocks.map((block) => {
          const title = english ? block.titleEn : block.titleAr;
          const body = english ? block.bodyEn : block.bodyAr;
          const Icon = block.variant === "ANNOUNCEMENT" ? BellIcon : ServicesIcon;
          return (
            <article
              className={`relative overflow-hidden rounded-[1.5rem] border p-5 shadow-[var(--itq-shadow-sm)] sm:p-6 ${toneByVariant[block.variant]}`}
              data-content-slug={block.slug}
              key={block.id}
            >
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/80 text-[var(--itq-color-brand-700)] shadow-sm">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black leading-7" dir="auto">
                    {title}
                  </h2>
                  <p
                    className={`mt-2 whitespace-pre-line text-sm leading-7 ${block.variant === "ACTION" ? "text-white/75" : "opacity-75"}`}
                    dir="auto"
                  >
                    {body}
                  </p>
                  {block.actionHref === null ? null : (
                    <div className="mt-5">
                      <BlockAction block={block} locale={locale} />
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
