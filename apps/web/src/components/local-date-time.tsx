"use client";

import { useEffect, useState } from "react";

interface LocalDateTimeProps {
  readonly value: string;
  readonly className?: string;
  readonly locale?: "ar" | "en";
}

/** Formats an ISO instant in the browser's local timezone without hydration drift. */
export function LocalDateTime({ value, className, locale = "ar" }: LocalDateTimeProps) {
  const [formatted, setFormatted] = useState<string>();

  useEffect(() => {
    const instant = new Date(value);
    setFormatted(
      new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(instant),
    );
  }, [locale, value]);

  return (
    <time className={className} dateTime={value}>
      {formatted ?? "…"}
    </time>
  );
}
