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

export const metadata = { title: "طلب جديد" };
export const dynamic = "force-dynamic";

export default async function NewRequestPage({ searchParams }: NewRequestPageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireStudentPagePrincipal("/ar/student/requests/new", "requests.create"),
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
          name: service.nameAr,
          categoryName: category.nameAr,
        };
      }),
    );
  } finally {
    await runtime.close();
  }

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName}>
      <RequestFlash {...(typeof query.notice === "string" ? { status: query.notice } : {})} />
      <h1 className="text-[1.7rem] font-black leading-[1.15] tracking-[-0.015em] sm:text-[2.05rem]">
        اطلب في نقرة واحدة
      </h1>
      <p className="mt-2 leading-7 text-[var(--itq-color-muted)]">
        اختر الخدمة، ثم أكمل التفاصيل معنا في المحادثة مباشرة.
      </p>
      <div className="mt-6">
        {services.length === 0 ? (
          <FormAlert>لا توجد خدمات نشطة حالياً. حاول مجدداً لاحقاً.</FormAlert>
        ) : (
          <QuickRequestForm
            csrfToken={csrfToken}
            integrityVersion={integrityVersion}
            locale="ar"
            services={services}
            {...(preselectServiceId === undefined ? {} : { preselectServiceId })}
          />
        )}
      </div>
      <p className="mt-6 text-center text-sm">
        <Link
          className="font-bold text-[var(--itq-color-brand-strong)] underline"
          href="/ar/services"
        >
          استعراض كل الخدمات
        </Link>
      </p>
    </StudentShell>
  );
}
