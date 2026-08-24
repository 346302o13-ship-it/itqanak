import { LocalDateTime } from "@/components/local-date-time";
import { requestEventLabel } from "@/lib/request-presenters";

export interface RequestTimelineEntry {
  readonly id: string;
  readonly eventType: string;
  readonly createdAt: Date | string;
}

export function RequestTimeline({
  entries,
  locale = "ar",
}: Readonly<{ entries: readonly RequestTimelineEntry[]; locale?: "ar" | "en" }>) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--itq-color-muted)]">
        {locale === "en" ? "No updates yet." : "لا توجد تحديثات بعد."}
      </p>
    );
  }
  return (
    <ol
      className="grid gap-4"
      aria-label={locale === "en" ? "Request update history" : "سجل تحديثات الطلب"}
    >
      {entries.map((entry) => {
        const createdAt =
          entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
        return (
          <li
            className="relative border-s-2 border-[var(--itq-color-brand-200)] py-1 ps-5"
            key={entry.id}
          >
            <span
              aria-hidden="true"
              className="absolute -start-[0.45rem] top-2 size-3 rounded-full bg-[var(--itq-color-brand-600)]"
            />
            <p className="font-bold">{requestEventLabel(entry.eventType, locale)}</p>
            <LocalDateTime
              className="mt-1 block text-xs text-[var(--itq-color-muted)]"
              locale={locale}
              value={createdAt.toISOString()}
            />
          </li>
        );
      })}
    </ol>
  );
}
