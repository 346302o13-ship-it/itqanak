import type { JSX } from "react";

import { MarketingIcon } from "./marketing-icon";
import type { MarketingLocale } from "./whatsapp-link";

const previewCopy = {
  ar: {
    label: "معاينة بوابة الطلب",
    title: "طلب ترجمة مستند",
    requestNumber: "ITQ-2026-000128",
    status: "قيد المراجعة",
    progress: "تقدم الطلب",
    stages: ["استلام الطلب", "مراجعة التفاصيل", "بدء التنفيذ", "التسليم"],
    update: "تم استلام ملفاتك ومراجعة تفاصيل الطلب.",
    updateTime: "آخر تحديث قبل ١٢ دقيقة",
    privacy: "الطلب وملفاته ظاهرة لك وللفريق المخوّل فقط",
  },
  en: {
    label: "Request portal preview",
    title: "Document translation request",
    requestNumber: "ITQ-2026-000128",
    status: "Under review",
    progress: "Request progress",
    stages: ["Request received", "Details review", "In progress", "Delivery"],
    update: "Your files were received and the request details were reviewed.",
    updateTime: "Last updated 12 minutes ago",
    privacy: "The request and its files are visible only to you and authorized staff",
  },
} as const;

export function RequestPreview({
  locale = "ar",
}: Readonly<{ locale?: MarketingLocale }>): JSX.Element {
  const copy = previewCopy[locale];
  return (
    <div
      aria-label={copy.label}
      className="relative rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4 shadow-[var(--itq-shadow-float)] sm:p-6"
      role="img"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--itq-color-border)] pb-5">
        <div>
          <p className="text-lg font-black">{copy.title}</p>
          <bdi className="mt-1 block text-xs font-bold text-[var(--itq-color-muted)]" dir="ltr">
            {copy.requestNumber}
          </bdi>
        </div>
        <span className="rounded-full bg-[var(--itq-color-warning-50)] px-3 py-1.5 text-xs font-black text-[var(--itq-color-warning-800)]">
          {copy.status}
        </span>
      </div>
      <div className="py-5">
        <p className="text-sm font-black">{copy.progress}</p>
        <ol className="mt-4 grid grid-cols-4 gap-2" aria-hidden="true">
          {copy.stages.map((stage, index) => (
            <li className="min-w-0" key={stage}>
              <span
                className={`block h-1.5 rounded-full ${
                  index < 2 ? "bg-[var(--itq-color-brand-700)]" : "bg-[var(--itq-color-border)]"
                }`}
              />
              <span className="mt-2 block truncate text-[0.65rem] font-bold text-[var(--itq-color-muted)]">
                {stage}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-2xl bg-[var(--itq-color-surface-soft)] p-4">
        <div className="flex gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)] shadow-sm">
            <MarketingIcon className="size-5" name="message" />
          </span>
          <div>
            <p className="text-sm font-bold leading-6">{copy.update}</p>
            <p className="mt-1 text-xs text-[var(--itq-color-muted)]">{copy.updateTime}</p>
          </div>
        </div>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs font-bold text-[var(--itq-color-muted)]">
        <MarketingIcon className="size-4 text-[var(--itq-color-brand-strong)]" name="lock" />
        {copy.privacy}
      </p>
    </div>
  );
}
