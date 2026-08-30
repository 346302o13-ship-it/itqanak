import type { JSX, ReactNode } from "react";

import { classNames } from "@itqanak/ui";

import { MarketingIcon, type MarketingIconName } from "./marketing-icon";

interface FeatureCardProps {
  readonly icon: MarketingIconName;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

export function FeatureCard({
  children,
  className,
  description,
  icon,
  title,
}: FeatureCardProps): JSX.Element {
  return (
    <article
      className={classNames(
        "group relative overflow-hidden rounded-3xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 shadow-[var(--itq-shadow-sm)] transition duration-300 before:absolute before:inset-x-0 before:top-0 before:h-1 before:origin-[center] before:scale-x-0 before:bg-[linear-gradient(90deg,var(--itq-color-brand-500),color-mix(in_srgb,var(--itq-color-accent-500)_80%,transparent))] before:transition-transform before:duration-300 hover:-translate-y-1.5 hover:border-[var(--itq-color-brand-200)] hover:shadow-[var(--itq-shadow-card)] hover:before:scale-x-100 sm:p-7",
        className,
      )}
    >
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--itq-color-brand-50),color-mix(in_srgb,var(--itq-color-accent-200)_55%,transparent))] text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-sm)] transition duration-300 group-hover:bg-[linear-gradient(135deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] group-hover:text-white group-hover:shadow-[var(--itq-shadow-md)]">
        <MarketingIcon name={icon} />
      </span>
      <h3 className="mt-5 text-xl font-black leading-8 text-[var(--itq-color-ink)]">{title}</h3>
      <p className="mt-2.5 leading-7 text-[var(--itq-color-muted)]">{description}</p>
      {children}
    </article>
  );
}
