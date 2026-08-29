import Link from "next/link";

import { generateSubmissionKey } from "@itqanak/core";

import { CsrfInput, FormAlert } from "@/components/auth-shell";
import { RequestFields } from "@/components/request-fields";
import { RequestFlash } from "@/components/request-flash";
import { StudentShell } from "@/components/student-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

interface NewRequestPageProps {
  readonly searchParams: Promise<{
    readonly service?: string | readonly string[];
    readonly notice?: string | readonly string[];
  }>;
}

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-3 text-base shadow-sm";

export const metadata = { title: "New request" };
export const dynamic = "force-dynamic";

export default async function EnglishNewRequestPage({ searchParams }: NewRequestPageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireStudentPagePrincipal("/en/student/requests/new", "requests.create", "en"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const runtime = await createStudentRequestRuntime();
  let catalog;
  let integrityVersion: string;
  let profileDefaults: { academicLevel?: string; institutionName?: string } = {};
  try {
    catalog = await runtime.catalog.listPublicCatalog();
    integrityVersion = runtime.config.academicIntegrityVersion;
    const account = await runtime.auth.getAccount(principal);
    profileDefaults = {
      ...(account.academicLevel === undefined ? {} : { academicLevel: account.academicLevel }),
      ...(account.institutionName === undefined
        ? {}
        : { institutionName: account.institutionName }),
    };
  } finally {
    await runtime.close();
  }
  const selectedService = typeof query.service === "string" ? query.service : "";
  const allServices = catalog.flatMap((category) =>
    category.services.map((service) => ({ ...service, categoryName: category.nameEn })),
  );
  const selectedServiceId =
    allServices.find(
      (service) => service.id === selectedService || service.slug === selectedService,
    )?.id ?? "";

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <RequestFlash
        locale="en"
        {...(typeof query.notice === "string" ? { status: query.notice } : {})}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Create a new request</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--itq-color-muted)]">
            Pick a service, add a title and description, then send it straight away. If you need to
            attach files first, save it as a draft and finish later.
          </p>
        </div>
        <Link
          className="text-sm font-bold text-[var(--itq-color-brand-strong)] underline"
          href="/en/services"
        >
          Compare services
        </Link>
      </div>

      {allServices.length === 0 ? (
        <FormAlert>No services are currently available. Please try again later.</FormAlert>
      ) : (
        <form action="/api/student/requests" className="mt-8 grid gap-7" method="post">
          <CsrfInput token={csrfToken} />
          <input name="locale" type="hidden" value="en" />
          <input name="submissionKey" type="hidden" value={generateSubmissionKey()} />
          <div>
            <label className="text-sm font-bold" htmlFor="serviceId">
              Service
            </label>
            <select
              className={inputClassName}
              defaultValue={selectedServiceId}
              id="serviceId"
              name="serviceId"
              required
            >
              <option disabled value="">
                Choose a service
              </option>
              {allServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.categoryName} — {service.nameEn}
                </option>
              ))}
            </select>
          </div>
          <RequestFields defaults={profileDefaults} locale="en" />
          <input name="academicIntegrityVersion" type="hidden" value={integrityVersion} />
          <label className="flex items-start gap-3 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4 text-sm font-semibold leading-7">
            <input
              className="mt-1 size-4"
              name="acceptedAcademicIntegrity"
              type="checkbox"
              value="true"
            />
            <span>
              I confirm this request follows the current academic-integrity policy (
              {integrityVersion}) and that the service is for learning and review, not plagiarism or
              exam-taking. (Required only for sending directly.)
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            <SubmitButton name="intent" pendingLabel="Sending…" value="submit" variant="primary">
              Save &amp; send now
            </SubmitButton>
            <SubmitButton
              name="intent"
              pendingLabel="Saving draft…"
              value="draft"
              variant="secondary"
            >
              Save as draft
            </SubmitButton>
          </div>
        </form>
      )}
    </StudentShell>
  );
}
