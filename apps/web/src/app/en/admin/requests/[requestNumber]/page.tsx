import Link from "next/link";
import { notFound } from "next/navigation";

import { getAllowedRequestTransitions } from "@itqanak/core";
import { RequestDomainError } from "@itqanak/requests";

import { AdminShell } from "@/components/admin-shell";
import { CsrfInput } from "@/components/auth-shell";
import { LocalDateTime } from "@/components/local-date-time";
import { LocalDeadlineInput } from "@/components/local-deadline-input";
import { RequestStatusChip } from "@/components/request-status-chip";
import { SubmitButton } from "@/components/submit-button";
import { ArrowIcon, ClockIcon, MessageIcon, UserIcon, VerifiedIcon } from "@/components/icons";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requestStatusLabel } from "@/lib/request-presenters";

interface AdminRequestPageProps {
  readonly params: Promise<{ readonly requestNumber: string }>;
  readonly searchParams: Promise<{ readonly notice?: string | readonly string[] }>;
}

function size(bytes: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(bytes / 1_048_576)} MB`;
}

export const metadata = { title: "Manage request" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminRequestPage({
  params,
  searchParams,
}: AdminRequestPageProps) {
  const [{ requestNumber }, query] = await Promise.all([params, searchParams]);
  const principal = await requireAdminPagePrincipal(
    `/en/admin/requests/${encodeURIComponent(requestNumber)}`,
    "en",
  );
  const csrfToken = await csrfTokenForPage();
  const runtime = await createStudentRequestRuntime();
  let detail;
  let conversations;
  let serviceName;
  try {
    try {
      [detail, conversations] = await Promise.all([
        runtime.adminRequests.getAdminRequest(principal, requestNumber),
        runtime.chat.listConversations(principal, { page: 1, pageSize: 50 }),
      ]);
    } catch (error: unknown) {
      if (
        error instanceof RequestDomainError &&
        (error.code === "REQUEST_NOT_FOUND" || error.code === "CONVERSATION_NOT_FOUND")
      )
        notFound();
      throw error;
    }
    serviceName =
      (await runtime.catalog.getServiceByIdForRequest(detail.serviceId))?.nameEn ??
      detail.serviceNameAr;
  } finally {
    await runtime.close();
  }
  const transitions = getAllowedRequestTransitions(detail.status, "ADMIN");
  const notice = typeof query.notice === "string" ? query.notice : undefined;

  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <div className="grid min-h-[calc(100vh-9rem)] overflow-hidden rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white shadow-[var(--itq-shadow-sm)] xl:grid-cols-[20rem_minmax(0,1fr)_20rem]">
        <aside className="hidden border-e border-[var(--itq-color-border)] xl:block">
          <div className="border-b border-[var(--itq-color-border)] p-5">
            <Link
              className="inline-flex items-center gap-2 text-sm font-black text-[var(--itq-color-brand-700)]"
              href="/en/admin/support"
            >
              <ArrowIcon className="size-4 -scale-x-100" /> All conversations
            </Link>
            <h2 className="mt-4 text-lg font-black">Request inbox</h2>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {conversations.items.map((item) => (
              <Link
                aria-current={item.requestNumber === detail.requestNumber ? "page" : undefined}
                className={`block rounded-2xl p-3.5 ${item.requestNumber === detail.requestNumber ? "bg-[var(--itq-color-brand-50)]" : "hover:bg-[var(--itq-color-surface-soft)]"}`}
                href={`/en/admin/requests/${encodeURIComponent(item.requestNumber)}`}
                key={item.id}
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className="truncate text-sm">{item.studentDisplayName}</strong>
                  {item.unreadCount > 0 ? (
                    <span className="grid size-6 place-items-center rounded-full bg-red-500 text-[10px] font-black text-white">
                      {item.unreadCount}
                    </span>
                  ) : null}
                </span>
                <span
                  className="mt-1 block truncate text-xs text-[var(--itq-color-muted)]"
                  dir="auto"
                >
                  {item.lastMessagePreview ?? item.requestTitle ?? "No messages"}
                </span>
                <bdi
                  className="mt-1 block text-[10px] font-bold text-[var(--itq-color-muted)]"
                  dir="ltr"
                >
                  {item.studentPhoneE164 === undefined ? "" : `${item.studentPhoneE164} · `}
                  {item.requestNumber}
                </bdi>
              </Link>
            ))}
          </div>
        </aside>

        <main className="min-w-0 p-3 sm:p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 px-1">
            <div>
              <Link
                className="text-xs font-black text-[var(--itq-color-brand-700)] underline xl:hidden"
                href="/en/admin/support"
              >
                Back to requests
              </Link>
              <h1 className="mt-2 text-2xl font-black" dir="auto">
                {detail.title || "Untitled request"}
              </h1>
              <p className="mt-1 text-xs font-bold text-[var(--itq-color-muted)]">
                <bdi dir="ltr">{detail.requestNumber}</bdi> · {detail.studentDisplayName}
              </p>
            </div>
            <RequestStatusChip locale="en" status={detail.status} />
          </div>
          {notice === "updated" || notice === "assigned" || notice === "details_saved" ? (
            <p
              className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
              role="status"
            >
              The action was saved and the request updated.
            </p>
          ) : null}
          {notice !== undefined &&
          notice !== "updated" &&
          notice !== "assigned" &&
          notice !== "details_saved" ? (
            <p
              className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-950"
              role="alert"
            >
              The action could not be saved. Review the fields, refresh, and try again.
            </p>
          ) : null}
          <section className="grid min-h-[28rem] place-items-center rounded-[1.5rem] border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] p-6 text-center">
            <div className="max-w-md">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-white text-[var(--itq-color-brand-700)] shadow-sm">
                <MessageIcon className="size-7" />
              </span>
              <h2 className="mt-5 text-xl font-black">Unified student conversation</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
                Open the conversation center to review every message and request update for this
                student, and send a price quote from one workspace.
              </p>
              <Link
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--itq-color-brand-700)] px-5 text-sm font-black text-white no-underline"
                href={`/en/admin/support?student=${encodeURIComponent(detail.studentUserId)}&request=${encodeURIComponent(detail.id)}`}
              >
                Open student conversation
              </Link>
            </div>
          </section>
        </main>

        <aside className="border-t border-[var(--itq-color-border)] p-5 xl:border-s xl:border-t-0">
          <section>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-[var(--itq-color-ink-deep)] font-black text-white">
                {detail.studentDisplayName.slice(0, 1)}
              </span>
              <div>
                <h2 className="font-black">{detail.studentDisplayName}</h2>
                <span
                  className={`mt-1 inline-flex items-center gap-1 text-[10px] font-black ${detail.studentPhoneVerified ? "text-emerald-700" : "text-amber-700"}`}
                >
                  <VerifiedIcon className="size-3" />{" "}
                  {detail.studentPhoneVerified ? "Verified number" : "Not verified"}
                </span>
              </div>
            </div>
            {detail.studentPhoneE164 === undefined ? null : (
              <bdi
                className="mt-4 block rounded-xl bg-[var(--itq-color-surface-soft)] p-3 text-center text-sm font-black"
                dir="ltr"
              >
                {detail.studentPhoneE164}
              </bdi>
            )}
          </section>
          <div className="my-5 h-px bg-[var(--itq-color-border)]" />
          <section>
            <h3 className="text-sm font-black">Request assignment</h3>
            <p className="mt-2 text-xs text-[var(--itq-color-muted)]">
              {detail.assignment === undefined
                ? "This request is unassigned."
                : `Assigned to ${detail.assignment.adminDisplayName}`}
            </p>
            <form
              action={`/api/admin/requests/${encodeURIComponent(detail.requestNumber)}/assign`}
              className="mt-3"
              method="post"
            >
              <CsrfInput token={csrfToken} />
              <input name="locale" type="hidden" value="en" />
              <input name="version" type="hidden" value={detail.version} />
              <input
                name="adminUserId"
                type="hidden"
                value={detail.assignment?.adminUserId === principal.userId ? "" : "self"}
              />
              <SubmitButton className="w-full" pendingLabel="Saving…" variant="secondary">
                {detail.assignment?.adminUserId === principal.userId
                  ? "Unassign me"
                  : "Assign to me"}
              </SubmitButton>
            </form>
          </section>
          <div className="my-5 h-px bg-[var(--itq-color-border)]" />
          <section>
            <h3 className="text-sm font-black">Update status</h3>
            {transitions.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--itq-color-muted)]">
                No actions are available for this status.
              </p>
            ) : (
              <form
                action={`/api/admin/requests/${encodeURIComponent(detail.requestNumber)}/transition`}
                className="mt-3 grid gap-3"
                method="post"
              >
                <CsrfInput token={csrfToken} />
                <input name="locale" type="hidden" value="en" />
                <input name="version" type="hidden" value={detail.version} />
                <select
                  className="h-12 rounded-xl border border-[var(--itq-color-border)] bg-white px-3 text-sm font-bold"
                  name="toStatus"
                  required
                  defaultValue=""
                >
                  <option disabled value="">
                    Choose a new status
                  </option>
                  {transitions.map((status) => (
                    <option key={status} value={status}>
                      {requestStatusLabel(status, "en")}
                    </option>
                  ))}
                </select>
                <SubmitButton className="w-full" pendingLabel="Updating…">
                  Apply status
                </SubmitButton>
              </form>
            )}
          </section>
          <div className="my-5 h-px bg-[var(--itq-color-border)]" />
          <section>
            <details>
              <summary className="cursor-pointer text-sm font-black">Edit request details</summary>
              <p className="mt-2 text-xs leading-5 text-[var(--itq-color-muted)]">
                Only safe operational fields can be changed. The owner, service and record itself
                cannot be changed or deleted.
              </p>
              <form
                action={`/api/admin/requests/${encodeURIComponent(detail.requestNumber)}/details`}
                className="mt-4 grid gap-4"
                method="post"
              >
                <CsrfInput token={csrfToken} />
                <input name="locale" type="hidden" value="en" />
                <input name="version" type="hidden" value={detail.version} />
                <div>
                  <label className="text-xs font-black" htmlFor="admin-title">
                    Title
                  </label>
                  <input
                    className="mt-2 w-full rounded-xl border border-[var(--itq-color-border)] px-3 py-2 text-sm"
                    defaultValue={detail.title}
                    id="admin-title"
                    maxLength={160}
                    minLength={3}
                    name="title"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-black" htmlFor="admin-description">
                    Description
                  </label>
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-xl border border-[var(--itq-color-border)] p-3 text-sm"
                    defaultValue={detail.description}
                    id="admin-description"
                    maxLength={10000}
                    minLength={10}
                    name="description"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-black" htmlFor="deadlineLocal">
                    Deadline
                  </label>
                  <LocalDeadlineInput
                    {...(detail.deadlineAt === undefined
                      ? {}
                      : { initialIso: detail.deadlineAt.toISOString() })}
                    locale="en"
                  />
                </div>
                <div>
                  <label className="text-xs font-black" htmlFor="admin-urgency">
                    Urgency
                  </label>
                  <select
                    className="mt-2 h-11 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 text-sm font-bold"
                    defaultValue={detail.urgency}
                    id="admin-urgency"
                    name="urgency"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <SubmitButton className="w-full" pendingLabel="Saving…" variant="secondary">
                  Save details with audit trail
                </SubmitButton>
              </form>
            </details>
          </section>
          <div className="my-5 h-px bg-[var(--itq-color-border)]" />
          <section>
            <h3 className="flex items-center gap-2 text-sm font-black">
              <UserIcon className="size-4" /> Request details
            </h3>
            <dl className="mt-3 grid gap-3 text-xs">
              <div>
                <dt className="font-bold text-[var(--itq-color-muted)]">Service</dt>
                <dd className="mt-1 font-black">{serviceName}</dd>
              </div>
              <div>
                <dt className="font-bold text-[var(--itq-color-muted)]">Description</dt>
                <dd
                  className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap leading-6"
                  dir="auto"
                >
                  {detail.description || "No description"}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 font-bold text-[var(--itq-color-muted)]">
                  <ClockIcon className="size-3" /> Deadline
                </dt>
                <dd className="mt-1 font-black">
                  {detail.deadlineAt === undefined ? (
                    "Not specified"
                  ) : (
                    <LocalDateTime locale="en" value={detail.deadlineAt.toISOString()} />
                  )}
                </dd>
              </div>
            </dl>
          </section>
          {detail.attachments.length > 0 ? (
            <section className="mt-5">
              <h3 className="flex items-center gap-2 text-sm font-black">
                <MessageIcon className="size-4" /> Files
              </h3>
              <ul className="mt-3 grid gap-2">
                {detail.attachments.map((attachment) => (
                  <li
                    className="rounded-xl bg-[var(--itq-color-surface-soft)] p-3 text-xs"
                    key={attachment.id}
                  >
                    <span className="block truncate font-black" dir="auto">
                      {attachment.originalFilename}
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--itq-color-muted)]">
                      {size(attachment.sizeBytes)} · {attachment.scanStatus}
                    </span>
                    {attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ? (
                      <span className="mt-1 block text-[10px] font-black text-amber-800">
                        Unscanned — external download only
                      </span>
                    ) : null}
                    {attachment.storageStatus === "STORED" &&
                    (attachment.scanStatus === "CLEAN" ||
                      attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN") ? (
                      <a
                        className="mt-2 inline-block font-black text-[var(--itq-color-brand-700)] underline"
                        href={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/attachments/${encodeURIComponent(attachment.id)}/download`}
                      >
                        Download file
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </AdminShell>
  );
}
