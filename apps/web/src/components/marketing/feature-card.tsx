import type { JSX, ReactNode } from "react";

import { classNames } from "@itqanak/ui";

import { MarketingIcon, type MarketingIconName } from "./marketing-icon";

/** Accent family for a card's top rule + icon tile. Institutional: the card
 *  body stays white, only the rule and the small tile carry colour. */
export type FeatureTone = "brand" | "accent" | "success" | "info" | "warning" | "danger";

const toneRule: Record<FeatureTone, string> = {
  brand: "bg-[var(--itq-color-brand-600)]",
  accent: "bg-[var(--itq-color-accent-500)]",
  success: "bg-[var(--itq-color-success-600)]",
  info: "bg-[var(--itq-color-info-500)]",
  warning: "bg-[var(--itq-color-warning-500)]",
  danger: "bg-[var(--itq-color-danger-500)]",
};

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
  /** Top rule + icon-tile accent family; omit for the plain green tile. */
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
        "group relative overflow-hidden rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--itq-color-brand-300)] hover:shadow-[var(--itq-shadow-sm)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={classNames(
          "absolute inset-x-0 top-0 h-1",
          tone === undefined ? "bg-[var(--itq-color-brand-600)]" : toneRule[tone],
        )}
      />
      {badge === undefined ? null : (
        <span className="absolute end-4 top-4 inline-flex items-center rounded-md bg-[var(--itq-color-accent-500)] px-2.5 py-1 text-[11px] font-black text-[var(--itq-color-brand-950)]">
          {badge}
        </span>
      )}
      <span
        className={classNames(
          "inline-flex size-11 items-center justify-center rounded-[var(--itq-radius-control)]",
          tone === undefined
            ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
            : toneTile[tone],
        )}
      >
        {emoji === undefined ? (
          <MarketingIcon className="size-5" name={icon} />
        ) : (
          <span aria-hidden="true" className="text-xl">
            {emoji}
          </span>
        )}
      </span>
      <h3 className="mt-4 text-lg font-black leading-7 text-[var(--itq-color-ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">{description}</p>
      {priceLabel === undefined ? null : (
        <p className="mt-3 text-base font-black text-[var(--itq-color-ink)]">{priceLabel}</p>
      )}
      {children}
    </article>
  );
}
