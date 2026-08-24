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
        "group rounded-3xl border border-[var(--itq-color-border)] bg-white p-6 shadow-[var(--itq-shadow-sm)] transition duration-300 hover:-translate-y-1 hover:border-[var(--itq-color-brand-200)] hover:shadow-[var(--itq-shadow-card)] sm:p-7",
        className,
      )}
    >
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-700)] transition group-hover:bg-[var(--itq-color-brand-700)] group-hover:text-white">
        <MarketingIcon name={icon} />
      </span>
      <h3 className="mt-5 text-xl font-black leading-8 text-[var(--itq-color-ink)]">{title}</h3>
      <p className="mt-2.5 leading-7 text-[var(--itq-color-muted)]">{description}</p>
      {children}
    </article>
  );
}
