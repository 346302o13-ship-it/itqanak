import type { JSX } from "react";

import type { MarketingLocale } from "./whatsapp-link";

export interface ProcessStep {
  readonly title: string;
  readonly description: string;
}

interface ProcessStepsProps {
  readonly locale?: MarketingLocale;
  readonly steps: readonly ProcessStep[];
}

export function ProcessSteps({ locale = "ar", steps }: ProcessStepsProps): JSX.Element {
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    minimumIntegerDigits: 2,
  });

  return (
    <ol className="grid gap-4 lg:grid-cols-3">
      {steps.map((step, index) => (
        <li
          className="group relative overflow-hidden rounded-3xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 shadow-[var(--itq-shadow-sm)] transition duration-300 hover:-translate-y-1.5 hover:border-[var(--itq-color-brand-200)] hover:shadow-[var(--itq-shadow-card)] sm:p-7"
          key={step.title}
        >
          <span
            aria-hidden="true"
            className="absolute -end-3 -top-6 text-8xl font-black leading-none text-[var(--itq-color-brand-50)] transition-colors duration-300 group-hover:text-[var(--itq-color-brand-100)]"
          >
            {numberFormat.format(index + 1)}
          </span>
          <span className="relative inline-flex min-w-11 justify-center rounded-2xl bg-[linear-gradient(135deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] px-3.5 py-2.5 text-sm font-black text-white shadow-[var(--itq-shadow-sm)]">
            {numberFormat.format(index + 1)}
          </span>
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute end-6 top-9 hidden h-px w-[calc(100%-3rem)] bg-[linear-gradient(90deg,var(--itq-color-brand-200),transparent)] lg:block"
            />
          ) : null}
          <h3 className="relative mt-6 text-xl font-black">{step.title}</h3>
          <p className="relative mt-3 leading-7 text-[var(--itq-color-muted)]">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  );
}
