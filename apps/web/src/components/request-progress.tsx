import type { RequestStatus } from "@itqanak/core";

/**
 * The many real request statuses collapsed onto five glanceable milestones,
 * so a student (or admin) can see where a request stands from inside the
 * chat without opening it — the thing WhatsApp structurally can't show.
 * CANCELLED / REJECTED short-circuit to a single terminal line instead of
 * the stepper. (Distinct from RequestTimeline, which is the full event log
 * on the request-detail page.)
 */
const MILESTONES = ["received", "review", "accepted", "inProgress", "delivered"] as const;
type Milestone = (typeof MILESTONES)[number];

const STATUS_MILESTONE: Partial<Record<RequestStatus, number>> = {
  DRAFT: 0,
  SUBMITTED: 0,
  WAITING_FOR_STUDENT: 0,
  UNDER_REVIEW: 1,
  QUOTED: 1,
  ACCEPTED: 2,
  IN_PROGRESS: 3,
  REVISION_REQUESTED: 3,
  DELIVERED: 4,
  COMPLETED: 4,
};

const LABELS: Record<"ar" | "en", Record<Milestone, string>> = {
  ar: {
    received: "استلام",
    review: "مراجعة",
    accepted: "قبول",
    inProgress: "تنفيذ",
    delivered: "تسليم",
  },
  en: {
    received: "Received",
    review: "Review",
    accepted: "Accepted",
    inProgress: "In progress",
    delivered: "Delivered",
  },
};

export function RequestProgress({
  status,
  locale = "ar",
}: Readonly<{ status: RequestStatus | string; locale?: "ar" | "en" }>) {
  const english = locale === "en";
  if (status === "CANCELLED" || status === "REJECTED") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-black text-[var(--itq-color-danger-700)]">
        <span className="size-2 rounded-full bg-[var(--itq-color-danger-600)]" />
        {status === "CANCELLED"
          ? english
            ? "Cancelled"
            : "أُلغي الطلب"
          : english
            ? "Not accepted"
            : "لم يُقبل الطلب"}
      </p>
    );
  }
  const reached = STATUS_MILESTONE[status as RequestStatus] ?? 0;
  const done = status === "COMPLETED";
  return (
    <ol className="mt-2 flex items-start">
      {MILESTONES.map((milestone, index) => {
        const active = index <= reached;
        const isLast = index === MILESTONES.length - 1;
        return (
          <li className="flex flex-1 flex-col items-center" key={milestone}>
            <span className="flex w-full items-center">
              <span
                className={`h-0.5 flex-1 ${
                  index === 0
                    ? "bg-transparent"
                    : index <= reached
                      ? "bg-[var(--itq-color-brand-500)]"
                      : "bg-[var(--itq-color-border)]"
                }`}
              />
              <span
                className={`grid size-3.5 shrink-0 place-items-center rounded-full border-2 ${
                  active
                    ? "border-[var(--itq-color-brand-500)] bg-[var(--itq-color-brand-500)]"
                    : "border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]"
                }`}
              >
                {done && isLast ? (
                  <span className="size-1.5 rounded-full bg-[var(--itq-color-surface)]" />
                ) : null}
              </span>
              <span
                className={`h-0.5 flex-1 ${
                  isLast
                    ? "bg-transparent"
                    : index < reached
                      ? "bg-[var(--itq-color-brand-500)]"
                      : "bg-[var(--itq-color-border)]"
                }`}
              />
            </span>
            <span
              className={`mt-1 text-center text-[9px] font-black leading-tight ${
                active ? "text-[var(--itq-color-brand-strong)]" : "text-[var(--itq-color-muted)]"
              }`}
            >
              {LABELS[english ? "en" : "ar"][milestone]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
