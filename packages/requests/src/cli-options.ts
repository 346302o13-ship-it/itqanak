export type RequestCliCommand =
  | "cleanup-drafts"
  | "storage-verify"
  | "storage-cleanup-orphans"
  | "scan-pending";

export const requestCliUsage = `Usage:
  itqanak-requests cleanup-drafts
  itqanak-requests storage-verify
  itqanak-requests storage-cleanup-orphans [--dry-run|--execute] [--limit=N]
  itqanak-requests scan-pending

storage-cleanup-orphans defaults to a read-only preview. scan-pending mutates scan state and rejects --dry-run because no preview mode exists.
`;

export function requestCliCommand(value: string | undefined): RequestCliCommand | undefined {
  return value === "cleanup-drafts" ||
    value === "storage-verify" ||
    value === "storage-cleanup-orphans" ||
    value === "scan-pending"
    ? value
    : undefined;
}

export function requestCliSafetyError(
  selected: RequestCliCommand,
  arguments_: readonly string[],
): string | undefined {
  const dryRun = arguments_.includes("--dry-run");
  const execute = arguments_.includes("--execute");

  if (selected === "scan-pending" && dryRun) {
    return "scan-pending has no preview mode; --dry-run is rejected. Run it without --dry-run only when a mutating scan batch is intended.";
  }
  if (execute && selected !== "storage-cleanup-orphans") {
    return "--execute is supported only for referenced attachment cleanup.";
  }
  if (execute && dryRun) {
    return "Choose either --dry-run or --execute.";
  }
  return undefined;
}
