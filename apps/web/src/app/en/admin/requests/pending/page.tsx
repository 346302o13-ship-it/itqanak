import { AdminShell } from "@/components/admin-shell";
import { PendingRequestsReport } from "@/components/pending-requests-report";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

export const metadata = { title: "Stale pending requests" };
export const dynamic = "force-dynamic";

type StaleStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "QUOTED";
const STALE_STATUSES: readonly StaleStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED"];

function one(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function boundedInteger(value: string | undefined, max: number): number | undefined {
  if (value === undefined || !/^\d{1,6}$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, max) : undefined;
}

interface PageProps {
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}

export default async function EnglishAdminPendingRequestsPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/requests/pending", "en"),
    csrfTokenForPage(),
    searchParams,
  ]);

  const rawStatus = one(query.status);
  const status = STALE_STATUSES.find((value) => value === rawStatus);
  const minDays = boundedInteger(one(query.minDays), 100_000);
  const page = boundedInteger(one(query.page), 1_000) ?? 1;
  const archivedView = one(query.view) === "archived";
  const notice = one(query.notice);

  const runtime = await createStudentRequestRuntime();
  let report;
  try {
    report = await runtime.adminRequests.listStalePendingRequests(principal, {
      ...(status === undefined ? {} : { status }),
      ...(minDays === undefined ? {} : { minDaysPending: minDays }),
      ...(archivedView ? { includeArchived: "only" as const } : {}),
      page,
      pageSize: 25,
    });
  } finally {
    await runtime.close();
  }

  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <PendingRequestsReport
        activeMinDays={minDays}
        activeStatus={status}
        archivedView={archivedView}
        csrfToken={csrfToken}
        locale="en"
        notice={notice}
        noticeCount={boundedInteger(one(query.n), 1_000_000)}
        report={report}
        skippedCount={boundedInteger(one(query.skipped), 1_000_000)}
      />
    </AdminShell>
  );
}
