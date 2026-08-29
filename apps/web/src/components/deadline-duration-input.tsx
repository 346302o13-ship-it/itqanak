"use client";

import { useEffect, useId, useState } from "react";

interface DeadlineDurationInputProps {
  readonly initialIso?: string;
  readonly locale?: "ar" | "en";
}

type Unit = "hour" | "day" | "week";

const unitMs: Readonly<Record<Unit, number>> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

const unitLabels = {
  ar: { hour: "ساعة", day: "يوم", week: "أسبوع" },
  en: { hour: "hours", day: "days", week: "weeks" },
} as const;

function normalizedIso(value: string | undefined): string {
  if (value === undefined || value.length === 0) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

/** Pick the largest whole unit that represents `ms` without rounding loss. */
function splitDuration(ms: number): { value: number; unit: Unit } {
  for (const unit of ["week", "day", "hour"] as const) {
    if (ms % unitMs[unit] === 0 && ms >= unitMs[unit]) {
      return { value: ms / unitMs[unit], unit };
    }
  }
  return { value: Math.max(1, Math.round(ms / unitMs.hour)), unit: "hour" };
}

/**
 * Students think in "I need this in 3 days", not calendar timestamps. This
 * collects a duration and writes the same hidden `deadlineAt` ISO string the
 * server already expects (now + duration), so nothing downstream changes.
 */
export function DeadlineDurationInput({ initialIso, locale = "ar" }: DeadlineDurationInputProps) {
  const english = locale === "en";
  const labels = unitLabels[locale];
  const fieldId = useId();
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<Unit>("day");
  // First render stays timezone/clock independent for stable hydration; a
  // preset deadline is turned back into a duration once mounted.
  const [iso, setIso] = useState(() => normalizedIso(initialIso));

  useEffect(() => {
    const normalized = normalizedIso(initialIso);
    if (normalized === "") {
      setAmount("");
      setIso("");
      return;
    }
    const remaining = new Date(normalized).getTime() - Date.now();
    if (remaining <= 0) {
      setAmount("");
      setIso("");
      return;
    }
    const { value, unit: pickedUnit } = splitDuration(remaining);
    setAmount(String(value));
    setUnit(pickedUnit);
    setIso(normalized);
  }, [initialIso]);

  function recompute(nextAmount: string, nextUnit: Unit) {
    const parsed = Number(nextAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setIso("");
      return;
    }
    setIso(new Date(Date.now() + parsed * unitMs[nextUnit]).toISOString());
  }

  return (
    <>
      <input name="deadlineAt" type="hidden" value={iso} />
      <div className="mt-2 flex gap-2">
        <input
          aria-describedby={`${fieldId}-help`}
          aria-label={english ? "Deadline amount" : "مدة الموعد"}
          className="w-24 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm"
          inputMode="numeric"
          max={365}
          min={1}
          onChange={(event) => {
            setAmount(event.target.value);
            recompute(event.target.value, unit);
          }}
          placeholder={english ? "e.g. 3" : "مثال: ٣"}
          type="number"
          value={amount}
        />
        <select
          aria-label={english ? "Deadline unit" : "وحدة المدة"}
          className="flex-1 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm"
          onChange={(event) => {
            const nextUnit = event.target.value as Unit;
            setUnit(nextUnit);
            recompute(amount, nextUnit);
          }}
          value={unit}
        >
          <option value="hour">{labels.hour}</option>
          <option value="day">{labels.day}</option>
          <option value="week">{labels.week}</option>
        </select>
      </div>
      <p className="mt-2 text-xs text-[var(--itq-color-muted)]" id={`${fieldId}-help`}>
        {english
          ? "Leave empty if there is no fixed deadline. We count from the moment you submit."
          : "اتركه فارغًا إن لم يكن هناك موعد محدد. نحسب المدة من لحظة إرسالك للطلب."}
      </p>
    </>
  );
}
