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

interface RequestsPageProps {
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
    if (typeof value === "string" && value.length > 0) search.set(key, value);
  }
  search.set("page", String(page));
  return `/en/student/requests?${search.toString()}`;
}

export const metadata = { title: "My requests" };
export const dynamic = "force-dynamic";

export default async function EnglishRequestsPage({ searchParams }: RequestsPageProps) {
  const query = await searchParams;
  const currentUrl = `/en/student/requests?${new URLSearchParams(Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string"))).toString()}`;
  const principal = await requireStudentPagePrincipal(currentUrl, "requests.read.own", "en");
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
      label: `${category.nameEn} — ${service.nameEn}`,
    })),
  );
  const selected = parseRequestListQuery(query);

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <RequestFlash
        locale="en"
        {...(typeof query.notice === "string" ? { status: query.notice } : {})}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">My requests</h1>
          <p className="mt-3 text-[var(--itq-color-muted)]">
            Search, filter and organise every request in one place.
          </p>
        </div>
        <Link
          className="rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-3 text-sm font-black text-white"
          href="/en/student/requests/new"
        >
          New request
        </Link>
      </div>

      <form
        className="mt-7 grid gap-4 rounded-2xl bg-[var(--itq-color-brand-50)] p-5 lg:grid-cols-5"
        method="get"
      >
        <div className="lg:col-span-2">
          <label className="text-xs font-black" htmlFor="q">
            Request number or title
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
            Status
          </label>
          <select
            className={controlClassName}
            defaultValue={selected.status ?? ""}
            id="status"
            name="status"
          >
            <option value="">All statuses</option>
            {requestStatuses.map((status) => (
              <option key={status} value={status}>
                {requestStatusLabel(status, "en")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-black" htmlFor="service">
            Service
          </label>
          <select
            className={controlClassName}
            defaultValue={selected.serviceId ?? ""}
            id="service"
            name="service"
          >
            <option value="">All services</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-black" htmlFor="sort">
            Sort by
          </label>
          <select
            className={controlClassName}
            defaultValue={selected.sort ?? "newest"}
            id="sort"
            name="sort"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="deadline">Nearest deadline</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3 lg:col-span-5">
          <button
            className="rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-3 text-sm font-black text-white"
            type="submit"
          >
            Apply filters
          </button>
          <Link
            className="rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-5 py-3 text-sm font-black"
            href="/en/student/requests"
          >
            Clear filters
          </Link>
        </div>
      </form>

      <p className="mt-6 text-sm font-bold text-[var(--itq-color-muted)]">
        {requests.total} request{requests.total === 1 ? "" : "s"} — page {requests.page} of{" "}
        {requests.pageCount}
      </p>
      {requests.items.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-[var(--itq-color-border)] p-7 text-center font-bold">
          No requests match these filters.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {requests.items.map((request) => (
            <li key={request.id}>
              <Link
                className="grid gap-3 rounded-2xl border border-[var(--itq-color-border)] p-5 hover:bg-[var(--itq-color-brand-50)] sm:grid-cols-[1fr_auto]"
                href={`/en/student/requests/${encodeURIComponent(request.requestNumber)}`}
              >
                <span>
                  <span className="block text-lg font-black" dir="auto">
                    {request.title || "Untitled draft"}
                  </span>
                  <span className="mt-2 block text-xs font-bold" dir="ltr">
                    {request.requestNumber}
                  </span>
                </span>
                <span className="flex flex-col items-start gap-2 sm:items-end">
                  <RequestStatusChip locale="en" status={request.status} />
                  <span className="text-xs text-[var(--itq-color-muted)]">
                    Updated <LocalDateTime locale="en" value={request.updatedAt.toISOString()} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Request pages" className="mt-7 flex items-center justify-between gap-4">
        {requests.page > 1 ? (
          <Link
            className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 text-sm font-black"
            href={pageHref(query, requests.page - 1)}
          >
            Previous page
          </Link>
        ) : (
          <span />
        )}
        {requests.page < requests.pageCount ? (
          <Link
            className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 text-sm font-black"
            href={pageHref(query, requests.page + 1)}
          >
            Next page
          </Link>
        ) : null}
      </nav>
    </StudentShell>
  );
}
