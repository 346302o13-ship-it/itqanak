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
          className="group relative rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 transition duration-200 hover:border-[var(--itq-color-brand-300)] hover:shadow-[var(--itq-shadow-sm)]"
          key={step.title}
        >
          <span className="inline-flex size-9 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] text-sm font-black text-white">
            {numberFormat.format(index + 1)}
          </span>
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute end-6 top-10 hidden h-px w-[calc(100%-3rem)] bg-[var(--itq-color-border)] lg:block"
            />
          ) : null}
          <h3 className="mt-5 text-lg font-black">{step.title}</h3>
          <p className="mt-2.5 text-sm leading-7 text-[var(--itq-color-muted)]">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  );
}
