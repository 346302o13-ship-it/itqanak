"use client";

import { useEffect, useState } from "react";

interface LocalDeadlineInputProps {
  readonly initialIso?: string;
  readonly locale?: "ar" | "en";
}

function toLocalInputValue(iso: string | undefined): string {
  if (iso === undefined || iso.length === 0) {
    return "";
  }
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string {
  if (value.length === 0) {
    return "";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function normalizedIso(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    return "";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export function LocalDeadlineInput({ initialIso, locale = "ar" }: LocalDeadlineInputProps) {
  const initial = normalizedIso(initialIso);
  // The first render is timezone-independent to keep SSR hydration stable.
  // Once mounted, only the visible control is converted to the browser zone.
  const [localValue, setLocalValue] = useState(() => initial.slice(0, 16));
  const [isoValue, setIsoValue] = useState(initial);
  const [minimum, setMinimum] = useState("");

  useEffect(() => {
    setLocalValue(toLocalInputValue(initialIso));
    setIsoValue(normalizedIso(initialIso));
    setMinimum(toLocalInputValue(new Date(Date.now() + 60_000).toISOString()));
  }, [initialIso]);

  return (
    <>
      <input name="deadlineAt" type="hidden" value={isoValue} />
      <input
        aria-describedby="deadline-help"
        className="mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm"
        id="deadlineLocal"
        min={minimum}
        onChange={(event) => {
          setLocalValue(event.target.value);
          setIsoValue(toIso(event.target.value));
        }}
        type="datetime-local"
        value={localValue}
      />
      <p className="mt-2 text-xs text-[var(--itq-color-muted)]" id="deadline-help">
        {locale === "en"
          ? "The deadline is shown in your device timezone and stored in UTC."
          : "يُعرض الموعد بتوقيت جهازك ويُحفظ بالتوقيت العالمي (UTC)."}
      </p>
    </>
  );
}
