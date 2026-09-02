/**
 * Detection rules for "stale pending" service requests — ones that have sat in a
 * non-terminal state long enough that an administrator should review them for
 * follow-up or removal. Completed, cancelled, rejected and any request with a
 * financial due attached are never stale (that data is kept permanently).
 */

export const STALE_PENDING_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED"] as const;

export type StalePendingStatus = (typeof STALE_PENDING_STATUSES)[number];

/** Days without an update after which a request in the given state is "stale". */
export const STALE_PENDING_THRESHOLD_DAYS: Readonly<Record<StalePendingStatus, number>> = {
  DRAFT: 7,
  SUBMITTED: 30,
  UNDER_REVIEW: 30,
  QUOTED: 30,
};

export function isStalePendingStatus(status: string): status is StalePendingStatus {
  return (STALE_PENDING_STATUSES as readonly string[]).includes(status);
}

/**
 * A short Arabic reason a request is flagged, or `undefined` when it is not
 * stale (unknown state, or not idle long enough).
 */
export function stalePendingRequestReason(
  status: string,
  daysSinceUpdate: number,
): string | undefined {
  if (!isStalePendingStatus(status) || !Number.isFinite(daysSinceUpdate)) {
    return undefined;
  }
  const threshold = STALE_PENDING_THRESHOLD_DAYS[status];
  if (daysSinceUpdate < threshold) {
    return undefined;
  }
  switch (status) {
    case "DRAFT":
      return `مسودة لم تُرسَل منذ ${daysSinceUpdate} يومًا`;
    case "SUBMITTED":
      return `طلب مُرسَل بلا مراجعة منذ ${daysSinceUpdate} يومًا`;
    case "UNDER_REVIEW":
      return `قيد المراجعة بلا تحديث منذ ${daysSinceUpdate} يومًا`;
    case "QUOTED":
      return `تم التسعير ولم يوافق الطالب منذ ${daysSinceUpdate} يومًا`;
  }
}
