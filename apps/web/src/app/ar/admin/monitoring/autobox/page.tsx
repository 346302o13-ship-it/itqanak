import { OutboxMonitor } from "@/components/outbox-monitor";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { createOperationsRuntime } from "@/lib/operations-runtime";

export const metadata = { title: "صندوق الأحداث" };
export const dynamic = "force-dynamic";

type OutboxStatus = "PENDING" | "PROCESSING" | "RETRY" | "DELIVERED" | "DEAD_LETTER";
const STATUSES: readonly OutboxStatus[] = [
  "PENDING",
  "PROCESSING",
  "RETRY",
  "DELIVERED",
  "DEAD_LETTER",
];

function one(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

interface PageProps {
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}

export default async function AdminAutoboxPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/monitoring/autobox", "ar", "admin.operations.read"),
    csrfTokenForPage(),
    searchParams,
  ]);

  const status = STATUSES.find((value) => value === one(query.status));
  const typePrefix = (one(query.type) ?? "").trim().slice(0, 60);
  const rawPage = one(query.page);
  const page = rawPage !== undefined && /^\d{1,5}$/u.test(rawPage) ? Number(rawPage) : 1;

  const runtime = await createOperationsRuntime();
  let report;
  try {
    report = await runtime.outboxMonitor.getReport(principal, {
      ...(status === undefined ? {} : { status }),
      ...(typePrefix.length === 0 ? {} : { typePrefix }),
      page,
    });
  } finally {
    await runtime.close();
  }

  return (
    <OutboxMonitor
      activeStatus={status}
      csrfToken={csrfToken}
      displayName={principal.displayName}
      locale="ar"
      notice={one(query.notice)}
      report={report}
      typePrefix={typePrefix}
    />
  );
}
