import type { JSX, ReactNode } from "react";

import { classNames } from "@itqanak/ui";

import { MarketingIcon, type MarketingIconName } from "./marketing-icon";

/** Accent family for a card's icon tile. The card body always stays white; only
 *  the small tile carries colour, and only a "most requested" card gets a badge. */
export type FeatureTone = "brand" | "accent" | "success" | "info" | "warning" | "danger";

const toneTile: Record<FeatureTone, string> = {
  brand: "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]",
  accent: "bg-[var(--itq-color-accent-50)] text-[var(--itq-color-accent-700)]",
  success: "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-700)]",
  info: "bg-[var(--itq-color-info-50)] text-[var(--itq-color-info-700)]",
  warning: "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-700)]",
  danger: "bg-[var(--itq-color-danger-50)] text-[var(--itq-color-danger-700)]",
};

interface FeatureCardProps {
  readonly icon: MarketingIconName;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
  readonly className?: string;
  /** Optional emoji glyph in the tile instead of the line icon. */
  readonly emoji?: string;
  /** Icon-tile accent family; omit for the plain brand tile. */
  readonly tone?: FeatureTone;
  /** Single small corner pill, rendered in gold, e.g. "الأكثر طلباً". */
  readonly badge?: string;
  /** Bold price line under the description, e.g. "يبدأ من ٢٠ ر.س". */
  readonly priceLabel?: string;
}

export function FeatureCard({
  badge,
  children,
  className,
  description,
  emoji,
  icon,
  priceLabel,
  title,
  tone,
}: FeatureCardProps): JSX.Element {
  return (
    <article
      className={classNames(
        "group relative flex flex-col overflow-hidden rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--itq-color-brand-300)] hover:shadow-[var(--itq-shadow-sm)]",
        className,
      )}
    >
      {badge === undefined ? null : (
        <span className="absolute end-3 top-3 inline-flex items-center rounded-md bg-[var(--itq-color-accent-500)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--itq-color-brand-950)]">
          {badge}
        </span>
      )}
      <span
        className={classNames(
          "inline-flex size-10 items-center justify-center rounded-[var(--itq-radius-control)]",
          tone === undefined
            ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
            : toneTile[tone],
        )}
      >
        {emoji === undefined ? (
          <MarketingIcon className="size-5" name={icon} />
        ) : (
          <span aria-hidden="true" className="text-lg">
            {emoji}
          </span>
        )}
      </span>
      <h3 className="mt-4 text-[1.05rem] font-black leading-6 text-[var(--itq-color-ink)]">
        {title}
      </h3>
      <p className="mt-1.5 text-[0.85rem] leading-6 text-[var(--itq-color-muted)]">{description}</p>
      {priceLabel === undefined ? null : (
        <p className="mt-3 text-[0.95rem] font-black text-[var(--itq-color-ink)]">{priceLabel}</p>
      )}
      {children}
    </article>
  );
}
