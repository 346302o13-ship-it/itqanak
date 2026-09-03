import type { JSX, ReactNode } from "react";

import { classNames } from "@itqanak/ui";

import { MarketingIcon, type MarketingIconName } from "./marketing-icon";

/** Playful pastel families, all theme-aware, drawn from the design tokens. */
export type FeatureTone = "brand" | "accent" | "success" | "info" | "warning" | "danger";

const toneSurface: Record<FeatureTone, string> = {
  brand: "bg-[var(--itq-color-brand-50)] border-[var(--itq-color-brand-200)]",
  accent: "bg-[var(--itq-color-accent-50)] border-[var(--itq-color-accent-200)]",
  success: "bg-[var(--itq-color-success-50)] border-[var(--itq-color-success-200)]",
  info: "bg-[var(--itq-color-info-50)] border-[var(--itq-color-info-200)]",
  warning: "bg-[var(--itq-color-warning-50)] border-[var(--itq-color-warning-200)]",
  danger: "bg-[var(--itq-color-danger-50)] border-[var(--itq-color-danger-200)]",
};

const toneBar: Record<FeatureTone, string> = {
  brand: "bg-[var(--itq-color-brand-500)]",
  accent: "bg-[var(--itq-color-accent-500)]",
  success: "bg-[var(--itq-color-success-500)]",
  info: "bg-[var(--itq-color-info-500)]",
  warning: "bg-[var(--itq-color-warning-500)]",
  danger: "bg-[var(--itq-color-danger-500)]",
};

interface FeatureCardProps {
  readonly icon: MarketingIconName;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
  readonly className?: string;
  /** Swaps the line icon for a large emoji glyph — friendlier on the services grid. */
  readonly emoji?: string;
  /** Pastel card treatment; omit for the plain white card. */
  readonly tone?: FeatureTone;
  /** Small corner pill, e.g. "🔥 الأكثر طلباً". */
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
        "group relative overflow-hidden rounded-3xl border p-6 shadow-[var(--itq-shadow-sm)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[var(--itq-shadow-card)] sm:p-7",
        tone === undefined
          ? "border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] before:absolute before:inset-x-0 before:top-0 before:h-1 before:origin-[center] before:scale-x-0 before:bg-[linear-gradient(90deg,var(--itq-color-brand-500),color-mix(in_srgb,var(--itq-color-accent-500)_80%,transparent))] before:transition-transform before:duration-300 hover:border-[var(--itq-color-brand-200)] hover:before:scale-x-100"
          : toneSurface[tone],
        className,
      )}
    >
      {tone === undefined ? null : (
        <span
          aria-hidden="true"
          className={classNames("absolute inset-x-0 top-0 h-1.5", toneBar[tone])}
        />
      )}
      {badge === undefined ? null : (
        <span className="absolute end-4 top-4 inline-flex items-center rounded-full bg-[var(--itq-color-surface)] px-2.5 py-1 text-[11px] font-black text-[var(--itq-color-ink-soft)] shadow-[var(--itq-shadow-sm)]">
          {badge}
        </span>
      )}
      <span
        className={classNames(
          "inline-flex size-12 items-center justify-center rounded-2xl text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-sm)] transition duration-300",
          emoji === undefined
            ? "bg-[linear-gradient(135deg,var(--itq-color-brand-50),color-mix(in_srgb,var(--itq-color-accent-200)_55%,transparent))] group-hover:bg-[linear-gradient(135deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] group-hover:text-white group-hover:shadow-[var(--itq-shadow-md)]"
            : "bg-[var(--itq-color-surface)] text-2xl group-hover:-rotate-6 group-hover:scale-110",
        )}
      >
        {emoji === undefined ? (
          <MarketingIcon name={icon} />
        ) : (
          <span aria-hidden="true">{emoji}</span>
        )}
      </span>
      <h3 className="mt-5 text-xl font-black leading-8 text-[var(--itq-color-ink)]">{title}</h3>
      <p className="mt-2.5 leading-7 text-[var(--itq-color-muted)]">{description}</p>
      {priceLabel === undefined ? null : (
        <p className="mt-3 text-lg font-black text-[var(--itq-color-ink)]">{priceLabel}</p>
      )}
      {children}
    </article>
  );
}
