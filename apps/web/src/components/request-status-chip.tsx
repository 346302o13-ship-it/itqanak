import { StatusChip } from "@itqanak/ui";

import { requestStatusLabel, requestStatusTone } from "@/lib/request-presenters";

export function RequestStatusChip({
  status,
  locale = "ar",
}: Readonly<{ status: string; locale?: "ar" | "en" }>) {
  return (
    <StatusChip tone={requestStatusTone(status)}>{requestStatusLabel(status, locale)}</StatusChip>
  );
}
