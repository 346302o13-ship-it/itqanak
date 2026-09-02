import { StorageAdmin } from "@/components/storage-admin";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

export const metadata = { title: "إدارة التخزين" };
export const dynamic = "force-dynamic";

type StatusFilter = "STORED" | "EXPIRED" | "PENDING_DELETION";
const STATUS_FILTERS: readonly StatusFilter[] = ["STORED", "EXPIRED", "PENDING_DELETION"];

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

export default async function AdminStoragePage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/storage", "ar", "admin.operations.read"),
    csrfTokenForPage(),
    searchParams,
  ]);

  const status = STATUS_FILTERS.find((value) => value === one(query.status));
  const search = (one(query.q) ?? "").trim().slice(0, 100);
  const page = boundedInteger(one(query.page), 1_000) ?? 1;

  const runtime = await createStudentRequestRuntime();
  let report;
  let preview;
  try {
    [report, preview] = await Promise.all([
      runtime.storageAdmin.listAttachments(principal, {
        ...(status === undefined ? {} : { status }),
        ...(search.length === 0 ? {} : { search }),
        page,
        pageSize: 25,
      }),
      runtime.storageAdmin.previewSweep(principal),
    ]);
  } finally {
    await runtime.close();
  }

  return (
    <StorageAdmin
      activeStatus={status}
      csrfToken={csrfToken}
      displayName={principal.displayName}
      locale="ar"
      notice={one(query.notice)}
      preview={preview}
      report={report}
      search={search}
    />
  );
}
