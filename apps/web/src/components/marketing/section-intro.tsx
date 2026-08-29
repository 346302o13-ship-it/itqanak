import type { JSX } from "react";

import { classNames } from "@itqanak/ui";

interface SectionIntroProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly align?: "start" | "center";
  readonly className?: string;
  readonly titleId?: string;
}

export function SectionIntro({
  align = "start",
  className,
  description,
  eyebrow,
  title,
  titleId,
}: SectionIntroProps): JSX.Element {
  return (
    <div
      className={classNames("max-w-3xl", align === "center" && "mx-auto text-center", className)}
    >
      {eyebrow === undefined ? null : (
        <p className="text-sm font-black tracking-wide text-[var(--itq-color-brand-strong)]">
          {eyebrow}
        </p>
      )}
      <h2
        className="mt-3 text-3xl font-black leading-[1.35] tracking-tight text-[var(--itq-color-ink)] sm:text-4xl"
        id={titleId}
      >
        {title}
      </h2>
      {description === undefined ? null : (
        <p className="mt-5 text-base leading-8 text-[var(--itq-color-muted)] sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
