import Link from "next/link";

import { requestStatuses } from "@itqanak/core";

import { LocalDateTime } from "@/components/local-date-time";
import { RequestFlash } from "@/components/request-flash";
import { RequestStatusChip } from "@/components/request-status-chip";
import { StudentShell } from "@/components/student-shell";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { parseRequestListQuery } from "@/lib/request-http";
import { requestStatusLabel } from "@/lib/request-presenters";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

interface StudentRequestsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>;
}

const controlClassName =
  "w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-sm shadow-sm";

function pageHref(
  query: Readonly<Record<string, string | readonly string[] | undefined>>,
  page: number,
): string {
  const search = new URLSearchParams();
  for (const key of ["q", "status", "service", "sort"] as const) {
    const value = query[key];
    if (typeof value === "string" && value.length > 0) {
      search.set(key, value);
    }
  }
  search.set("page", String(page));
  return `/ar/student/requests?${search.toString()}`;
}

export const metadata = { title: "طلباتي" };
export const dynamic = "force-dynamic";

export default async function StudentRequestsPage({ searchParams }: StudentRequestsPageProps) {
  const query = await searchParams;
  const principal = await requireStudentPagePrincipal(
    `/ar/student/requests?${new URLSearchParams(
      Object.fromEntries(
        Object.entries(query).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    ).toString()}`,
    "requests.read.own",
  );
  const csrfToken = await csrfTokenForPage();
  const runtime = await createStudentRequestRuntime();
  let requests;
  let catalog;
  try {
    [requests, catalog] = await Promise.all([
      runtime.requests.listStudentRequests(principal, parseRequestListQuery(query)),
      runtime.catalog.listPublicCatalog(),
    ]);
  } finally {
    await runtime.close();
  }
  const services = catalog.flatMap((category) =>
    category.services.map((service) => ({
      id: service.id,
      label: `${category.nameAr} — ${service.nameAr}`,
    })),
  );
  const selected = parseRequestListQuery(query);

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName}>
      <RequestFlash {...(typeof query.notice === "string" ? { status: query.notice } : {})} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">طلباتي</h1>
          <p className="mt-3 text-[var(--itq-color-muted)]">
            البحث والتصفية والتقسيم إلى صفحات تُنفذ على الخادم.
          </p>
        </div>
        <Link
          className="rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-3 text-sm font-black text-white"
          href="/ar/student/requests/new"
        >
          طلب جديد
        </Link>
      </div>

      <form
        className="mt-7 grid gap-4 rounded-2xl bg-[var(--itq-color-brand-50)] p-5 lg:grid-cols-5"
        method="get"
      >
        <div className="lg:col-span-2">
          <label className="text-xs font-black" htmlFor="q">
            رقم الطلب أو العنوان
          </label>
          <input
            className={controlClassName}
            defaultValue={selected.search}
            id="q"
            maxLength={100}
            name="q"
            placeholder="ITQ-2026-000001"
          />
        </div>
        <div>
          <label className="text-xs font-black" htmlFor="status">
            الحالة
          </label>
          <select
            className={controlClassName}
            defaultValue={selected.status ?? ""}
            id="status"
            name="status"
          >
            <option value="">كل الحالات</option>
            {requestStatuses.map((status) => (
              <option key={status} value={status}>
                {requestStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-black" htmlFor="service">
            الخدمة
          </label>
          <select
            className={controlClassName}
            defaultValue={selected.serviceId ?? ""}
            id="service"
            name="service"
          >
            <option value="">كل الخدمات</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-black" htmlFor="sort">
            الترتيب
          </label>
          <select
            className={controlClassName}
            defaultValue={selected.sort ?? "newest"}
            id="sort"
            name="sort"
          >
            <option value="newest">الأحدث أولاً</option>
            <option value="oldest">الأقدم أولاً</option>
            <option value="deadline">الأقرب موعداً</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3 lg:col-span-5">
          <button
            className="rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-3 text-sm font-black text-white"
            type="submit"
          >
            تطبيق
          </button>
          <Link
            className="rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-5 py-3 text-sm font-black"
            href="/ar/student/requests"
          >
            مسح الفلاتر
          </Link>
        </div>
      </form>

      <p className="mt-6 text-sm font-bold text-[var(--itq-color-muted)]">
        {requests.total} طلب — الصفحة {requests.page} من {requests.pageCount}
      </p>
      {requests.items.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-[var(--itq-color-border)] p-7 text-center font-bold">
          لا توجد طلبات تطابق هذه المعايير.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {requests.items.map((request) => (
            <li key={request.id}>
              <Link
                className="grid gap-3 rounded-2xl border border-[var(--itq-color-border)] p-5 hover:bg-[var(--itq-color-brand-50)] sm:grid-cols-[1fr_auto]"
                href={`/ar/student/requests/${encodeURIComponent(request.requestNumber)}`}
              >
                <span>
                  <span className="block text-lg font-black">
                    {request.title || "مسودة بلا عنوان"}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--itq-color-muted)]">
                    {request.serviceNameAr}
                  </span>
                  <span className="mt-2 block text-xs font-bold" dir="ltr">
                    {request.requestNumber}
                  </span>
                </span>
                <span className="flex flex-col items-start gap-2 sm:items-end">
                  <RequestStatusChip status={request.status} />
                  <span className="text-xs text-[var(--itq-color-muted)]">
                    آخر تحديث: <LocalDateTime value={request.updatedAt.toISOString()} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="صفحات الطلبات" className="mt-7 flex items-center justify-between gap-4">
        {requests.page > 1 ? (
          <Link
            className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 text-sm font-black"
            href={pageHref(query, requests.page - 1)}
          >
            الصفحة السابقة
          </Link>
        ) : (
          <span />
        )}
        {requests.page < requests.pageCount ? (
          <Link
            className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 text-sm font-black"
            href={pageHref(query, requests.page + 1)}
          >
            الصفحة التالية
          </Link>
        ) : null}
      </nav>
    </StudentShell>
  );
}
