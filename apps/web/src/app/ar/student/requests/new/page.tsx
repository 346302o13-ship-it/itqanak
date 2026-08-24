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
  try {
    catalog = await runtime.catalog.listPublicCatalog();
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
            احفظ الطلب أولاً كمسودة. بعدها يمكنك رفع الملفات ومراجعة البيانات قبل الإرسال.
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
          <RequestFields />
          <div className="rounded-2xl bg-[var(--itq-color-brand-50)] p-5 text-sm leading-7">
            يمكنك ترك العنوان أو الوصف فارغاً عند حفظ المسودة. يلزم إكمالهما وقبول سياسة النزاهة
            الأكاديمية قبل الإرسال النهائي.
          </div>
          <SubmitButton pendingLabel="جارٍ حفظ المسودة…">حفظ كمسودة</SubmitButton>
        </form>
      )}
    </StudentShell>
  );
}
