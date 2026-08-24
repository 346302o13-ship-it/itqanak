import Link from "next/link";
import { notFound } from "next/navigation";

import { RequestDomainError, type RequestAttachmentSummary } from "@itqanak/requests";

import { AttachmentUpload } from "@/components/attachment-upload";
import { CsrfInput } from "@/components/auth-shell";
import { LocalDateTime } from "@/components/local-date-time";
import { RequestFields } from "@/components/request-fields";
import { RequestFlash } from "@/components/request-flash";
import { RequestStatusChip } from "@/components/request-status-chip";
import { RequestTimeline } from "@/components/request-timeline";
import { StudentShell } from "@/components/student-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

interface RequestDetailPageProps {
  readonly params: Promise<{ readonly requestNumber: string }>;
  readonly searchParams: Promise<{
    readonly status?: string | readonly string[];
    readonly notice?: string | readonly string[];
  }>;
}

const attachmentStatusLabels: Readonly<Record<RequestAttachmentSummary["scanStatus"], string>> = {
  NOT_REQUIRED: "Security scan not started",
  PENDING_SCAN: "Awaiting security scan",
  CLEAN: "Scanned — safe",
  INFECTED: "Rejected by security scan",
  SCAN_ERROR: "Scan could not be completed",
  SCAN_SKIPPED_DEVELOPMENT: "Not scanned — development environment",
  SCAN_SKIPPED_BY_ADMIN: "Unscanned — scanning disabled by an administrator",
  REJECTED: "Rejected",
};

function fileSize(bytes: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

function attachmentStateLabel(attachment: RequestAttachmentSummary): string {
  if (attachment.scanStatus === "INFECTED")
    return "Security rejected — remove and replace this file";
  if (attachment.storageStatus === "PENDING_UPLOAD") return "Completing upload";
  if (attachment.storageStatus === "UPLOAD_FAILED") return "File storage failed";
  if (attachment.storageStatus === "DELETE_PENDING") return "Removing from storage";
  if (attachment.storageStatus === "DELETED") return "File deleted";
  return attachmentStatusLabels[attachment.scanStatus];
}

function optionalValue(value: string | undefined): string {
  return value === undefined || value.length === 0 ? "Not specified" : value;
}

export const metadata = { title: "Request details" };
export const dynamic = "force-dynamic";

export default async function EnglishRequestDetailPage({
  params,
  searchParams,
}: RequestDetailPageProps) {
  const [{ requestNumber }, query] = await Promise.all([params, searchParams]);
  const requestPath = `/en/student/requests/${encodeURIComponent(requestNumber)}`;
  const principal = await requireStudentPagePrincipal(requestPath, "requests.read.own", "en");
  const csrfToken = await csrfTokenForPage();
  const runtime = await createStudentRequestRuntime();
  let detail;
  let service;
  let maximumFileBytes;
  let development;
  let integrityVersion;
  try {
    try {
      detail = await runtime.requests.getStudentRequest(principal, requestNumber);
    } catch (error: unknown) {
      if (error instanceof RequestDomainError && error.code === "REQUEST_NOT_FOUND") notFound();
      throw error;
    }
    service = await runtime.catalog.getServiceByIdForRequest(detail.serviceId);
    maximumFileBytes = Math.min(
      runtime.config.storage.maxFileBytes,
      service?.maxFileSizeBytes ?? runtime.config.storage.maxFileBytes,
    );
    development = runtime.config.nodeEnv !== "production";
    integrityVersion = runtime.config.academicIntegrityVersion;
  } finally {
    await runtime.close();
  }

  const status = typeof query.status === "string" ? query.status : undefined;
  const notice = typeof query.notice === "string" ? query.notice : status;
  const editable = detail.status === "DRAFT";
  const attachmentsEditable = detail.status === "DRAFT" || detail.status === "SUBMITTED";
  const cancellable = detail.status === "DRAFT" || detail.status === "SUBMITTED";
  const acceptsFiles = service?.acceptsFiles === true;
  const serviceName = service?.nameEn ?? detail.serviceNameAr;

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <RequestFlash locale="en" {...(notice === undefined ? {} : { status: notice })} />
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link
            className="text-sm font-bold text-[var(--itq-color-brand-700)] underline"
            href="/en/student/requests"
          >
            Back to my requests
          </Link>
          <h1 className="mt-4 text-3xl font-black" dir="auto">
            {detail.title || "Untitled draft"}
          </h1>
          <p className="mt-2 font-bold text-[var(--itq-color-muted)]" dir="ltr">
            {detail.requestNumber}
          </p>
        </div>
        <RequestStatusChip locale="en" status={detail.status} />
      </div>

      <dl className="mt-7 grid gap-4 rounded-2xl bg-[var(--itq-color-brand-50)] p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">Service</dt>
          <dd className="mt-1 font-black">{serviceName}</dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">Created</dt>
          <dd className="mt-1 font-black">
            <LocalDateTime locale="en" value={detail.createdAt.toISOString()} />
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">Last updated</dt>
          <dd className="mt-1 font-black">
            <LocalDateTime locale="en" value={detail.updatedAt.toISOString()} />
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">Deadline</dt>
          <dd className="mt-1 font-black">
            {detail.deadlineAt === undefined ? (
              "Not specified"
            ) : (
              <LocalDateTime locale="en" value={detail.deadlineAt.toISOString()} />
            )}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">Urgency</dt>
          <dd className="mt-1 font-black">{detail.urgency === "URGENT" ? "Urgent" : "Normal"}</dd>
        </div>
      </dl>

      {!editable ? (
        <section className="mt-9" aria-labelledby="request-description-title">
          <h2 className="text-xl font-black" id="request-description-title">
            Request details
          </h2>
          <p className="mt-4 whitespace-pre-wrap leading-8" dir="auto">
            {detail.description || "No description provided."}
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-bold text-[var(--itq-color-muted)]">Language</dt>
              <dd className="mt-1">{optionalValue(detail.languageCode)}</dd>
            </div>
            <div>
              <dt className="font-bold text-[var(--itq-color-muted)]">Academic level</dt>
              <dd className="mt-1">{optionalValue(detail.academicLevel)}</dd>
            </div>
            <div>
              <dt className="font-bold text-[var(--itq-color-muted)]">Institution</dt>
              <dd className="mt-1" dir="auto">
                {optionalValue(detail.institutionName)}
              </dd>
            </div>
          </dl>
        </section>
      ) : (
        <section className="mt-9" aria-labelledby="edit-request-title">
          <h2 className="text-xl font-black" id="edit-request-title">
            Edit draft
          </h2>
          <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
            The service is fixed for this draft. Create another draft if you need a different
            service.
          </p>
          <form
            action={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}`}
            className="mt-6 grid gap-6"
            method="post"
          >
            <CsrfInput token={csrfToken} />
            <input name="locale" type="hidden" value="en" />
            <input name="version" type="hidden" value={detail.version} />
            <RequestFields
              defaults={{
                title: detail.title,
                description: detail.description,
                ...(detail.deadlineAt === undefined
                  ? {}
                  : { deadlineIso: detail.deadlineAt.toISOString() }),
                urgency: detail.urgency,
                ...(detail.languageCode === undefined ? {} : { languageCode: detail.languageCode }),
                ...(detail.academicLevel === undefined
                  ? {}
                  : { academicLevel: detail.academicLevel }),
                ...(detail.institutionName === undefined
                  ? {}
                  : { institutionName: detail.institutionName }),
                privacyRequested: detail.privacyRequested,
              }}
              locale="en"
            />
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          </form>
        </section>
      )}

      <div className="mt-10">
        <section className="rounded-[1.5rem] border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
          <div>
            <h2 className="text-lg font-black">Unified support conversation</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
              Messages, files and updates for all your requests live in one conversation. This
              request will be linked to your next message.
            </p>
          </div>
          <Link
            className="mt-4 inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[var(--itq-color-brand-700)] px-5 text-sm font-black text-white no-underline sm:mt-0"
            href={`/en/student/support?request=${encodeURIComponent(detail.id)}`}
          >
            Open conversation
          </Link>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="attachments-title">
        <h2 className="text-xl font-black" id="attachments-title">
          Files
        </h2>
        {detail.attachments.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--itq-color-muted)]">No files attached.</p>
        ) : (
          <ul className="mt-5 grid gap-3">
            {detail.attachments.map((attachment) => {
              const canDownload =
                attachment.storageStatus === "STORED" &&
                (attachment.scanStatus === "CLEAN" ||
                  attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
                  (development && attachment.scanStatus === "SCAN_SKIPPED_DEVELOPMENT"));
              return (
                <li
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--itq-color-border)] p-4"
                  key={attachment.id}
                >
                  <span>
                    <span className="block font-black" dir="auto">
                      {attachment.originalFilename}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--itq-color-muted)]">
                      {fileSize(attachment.sizeBytes)} — {attachmentStateLabel(attachment)}
                    </span>
                    {attachment.scanStatus === "SCAN_SKIPPED_DEVELOPMENT" ? (
                      <span className="mt-2 block text-xs font-bold text-amber-800">
                        Warning: this file was not malware-scanned because the environment is in
                        development mode.
                      </span>
                    ) : null}
                    {attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ? (
                      <span className="mt-2 block text-xs font-bold text-amber-800">
                        Warning: this file was not malware-scanned. Download it only if you trust
                        the sender; the platform will not preview it inline.
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {canDownload ? (
                      <a
                        className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 text-sm font-black"
                        href={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/attachments/${encodeURIComponent(attachment.id)}/download`}
                      >
                        Download
                      </a>
                    ) : null}
                    {attachmentsEditable ? (
                      <form
                        action={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/attachments/${encodeURIComponent(attachment.id)}/delete`}
                        method="post"
                      >
                        <CsrfInput token={csrfToken} />
                        <input name="locale" type="hidden" value="en" />
                        <input name="version" type="hidden" value={detail.version} />
                        <SubmitButton pendingLabel="Removing…">Remove</SubmitButton>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {attachmentsEditable && acceptsFiles ? (
          <div className="mt-6">
            <AttachmentUpload
              csrfToken={csrfToken}
              locale="en"
              maximumBytes={maximumFileBytes}
              requestNumber={detail.requestNumber}
              requestVersion={detail.version}
            />
          </div>
        ) : null}
      </section>

      {editable ? (
        <section
          className="mt-10 rounded-2xl border border-[var(--itq-color-border)] p-5"
          aria-labelledby="submit-title"
        >
          <h2 className="text-xl font-black" id="submit-title">
            Submit request
          </h2>
          <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
            Save your latest changes first. Request fields cannot be edited at this stage after
            submission.
          </p>
          <form
            action={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/submit`}
            className="mt-5 grid gap-4"
            method="post"
          >
            <CsrfInput token={csrfToken} />
            <input name="locale" type="hidden" value="en" />
            <input name="version" type="hidden" value={detail.version} />
            <input name="academicIntegrityVersion" type="hidden" value={integrityVersion} />
            <label className="flex items-start gap-3 rounded-xl bg-[var(--itq-color-brand-50)] p-4 text-sm font-semibold leading-7">
              <input
                className="mt-1 size-4"
                name="acceptedAcademicIntegrity"
                required
                type="checkbox"
                value="true"
              />
              I confirm that this request complies with the current Academic Integrity Policy (
              {integrityVersion}) and will not be used for cheating or impersonation.
            </label>
            <SubmitButton pendingLabel="Submitting request…">Submit request now</SubmitButton>
          </form>
        </section>
      ) : null}

      {cancellable ? (
        <section className="mt-8 border-t border-[var(--itq-color-border)] pt-6">
          <form
            action={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/cancel`}
            method="post"
          >
            <CsrfInput token={csrfToken} />
            <input name="locale" type="hidden" value="en" />
            <input name="version" type="hidden" value={detail.version} />
            <SubmitButton pendingLabel="Cancelling…">Cancel request</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-[var(--itq-color-muted)]">
            Cancellation is final and is automatically rejected if work has started or the status
            has changed.
          </p>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="timeline-title">
        <h2 className="text-xl font-black" id="timeline-title">
          Update history
        </h2>
        <div className="mt-5">
          <RequestTimeline entries={detail.events} locale="en" />
        </div>
      </section>
    </StudentShell>
  );
}
