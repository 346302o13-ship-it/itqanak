import Link from "next/link";

import { FormAlert } from "@/components/auth-shell";
import { QuickRequestForm, type QuickRequestService } from "@/components/quick-request-form";
import { RequestFlash } from "@/components/request-flash";
import { StudentShell } from "@/components/student-shell";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

interface NewRequestPageProps {
  readonly searchParams: Promise<{
    readonly service?: string | readonly string[];
    readonly notice?: string | readonly string[];
  }>;
}

export const metadata = { title: "New request" };
export const dynamic = "force-dynamic";

export default async function EnglishNewRequestPage({ searchParams }: NewRequestPageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireStudentPagePrincipal("/en/student/requests/new", "requests.create", "en"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const runtime = await createStudentRequestRuntime();
  let services: QuickRequestService[] = [];
  let integrityVersion = "";
  let preselectServiceId: string | undefined;
  const requestedSlug = typeof query.service === "string" ? query.service : undefined;
  try {
    const catalog = await runtime.catalog.listPublicCatalog();
    integrityVersion = runtime.config.academicIntegrityVersion;
    services = catalog.flatMap((category) =>
      category.services.map((service) => {
        if (service.slug === requestedSlug) preselectServiceId = service.id;
        return {
          id: service.id,
          name: service.nameEn,
          categoryName: category.nameEn,
        };
      }),
    );
  } finally {
    await runtime.close();
  }

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <RequestFlash
        locale="en"
        {...(typeof query.notice === "string" ? { status: query.notice } : {})}
      />
      <h1 className="text-[1.7rem] font-black leading-[1.15] tracking-[-0.015em] sm:text-[2.05rem]">
        Request in one tap
      </h1>
      <p className="mt-2 leading-7 text-[var(--itq-color-muted)]">
        Pick a service, then work out the details with us right in the chat.
      </p>
      <div className="mt-6">
        {services.length === 0 ? (
          <FormAlert>No active services right now. Try again later.</FormAlert>
        ) : (
          <QuickRequestForm
            csrfToken={csrfToken}
            integrityVersion={integrityVersion}
            locale="en"
            services={services}
            {...(preselectServiceId === undefined ? {} : { preselectServiceId })}
          />
        )}
      </div>
      <p className="mt-6 text-center text-sm">
        <Link
          className="font-bold text-[var(--itq-color-brand-strong)] underline"
          href="/en/services"
        >
          Browse all services
        </Link>
      </p>
    </StudentShell>
  );
}
