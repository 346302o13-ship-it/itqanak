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
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

export const metadata = { title: "طلب جديد" };
export const dynamic = "force-dynamic";

export default async function NewRequestPage({ searchParams }: NewRequestPageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireStudentPagePrincipal("/ar/student/requests/new", "requests.create"),
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
    category.services.map((service) => ({ ...service, categoryName: category.nameAr })),
  );
  const selectedServiceId =
    allServices.find(
      (service) => service.id === selectedService || service.slug === selectedService,
    )?.id ?? "";

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName}>
      <RequestFlash {...(typeof query.notice === "string" ? { status: query.notice } : {})} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">إنشاء طلب جديد</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--itq-color-muted)]">
            اختر الخدمة واكتب عنوانًا ووصفًا، ثم أرسله مباشرة. إن كنت تريد إرفاق ملفات أولًا، احفظه
            كمسودة وأكمِله لاحقًا.
          </p>
        </div>
        <Link
          className="text-sm font-bold text-[var(--itq-color-brand-700)] underline"
          href="/ar/services"
        >
          مقارنة الخدمات
        </Link>
      </div>

      {allServices.length === 0 ? (
        <FormAlert>لا توجد خدمات نشطة حالياً. حاول مجدداً لاحقاً.</FormAlert>
      ) : (
        <form action="/api/student/requests" className="mt-8 grid gap-7" method="post">
          <CsrfInput token={csrfToken} />
          <input name="submissionKey" type="hidden" value={generateSubmissionKey()} />
          <div>
            <label className="text-sm font-bold" htmlFor="serviceId">
              الخدمة
            </label>
            <select
              className={inputClassName}
              defaultValue={selectedServiceId}
              id="serviceId"
              name="serviceId"
              required
            >
              <option disabled value="">
                اختر الخدمة
              </option>
              {allServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.categoryName} — {service.nameAr}
                </option>
              ))}
            </select>
          </div>
          <RequestFields defaults={profileDefaults} />
          <input name="academicIntegrityVersion" type="hidden" value={integrityVersion} />
          <label className="flex items-start gap-3 rounded-xl border border-[var(--itq-color-border)] bg-white p-4 text-sm font-semibold leading-7">
            <input
              className="mt-1 size-4"
              name="acceptedAcademicIntegrity"
              type="checkbox"
              value="true"
            />
            <span>
              أقر بأن الطلب ملتزم بسياسة النزاهة الأكاديمية الحالية ({integrityVersion})، وأن الخدمة
              للتعلّم والمراجعة لا للانتحال أو أداء الاختبارات. (مطلوب للإرسال المباشر فقط)
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            <SubmitButton
              name="intent"
              pendingLabel="جارٍ الإرسال…"
              value="submit"
              variant="primary"
            >
              احفظ وأرسل الآن
            </SubmitButton>
            <SubmitButton
              name="intent"
              pendingLabel="جارٍ حفظ المسودة…"
              value="draft"
              variant="secondary"
            >
              حفظ كمسودة
            </SubmitButton>
          </div>
        </form>
      )}
    </StudentShell>
  );
}
