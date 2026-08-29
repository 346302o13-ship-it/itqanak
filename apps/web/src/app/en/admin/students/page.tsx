import { AdminShell } from "@/components/admin-shell";
import {
  AdminStudentOperations,
  readAdminStudentDraft,
} from "@/components/admin-student-operations";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = { title: "Student management" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminStudentsPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/students", "en", "admin.users.manage"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const runtime = await createStudentRequestRuntime();
  let students;
  let catalog;
  try {
    [students, catalog] = await Promise.all([
      runtime.auth.listStudents(principal, { pageSize: 100, activeOnly: true }),
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
  const studentDraft = readAdminStudentDraft(query);
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <div className="mb-7">
        <p className="text-sm font-black text-[var(--itq-color-brand-strong)]">
          Safe direct operations
        </p>
        <h1 className="mt-1 text-3xl font-black">Students & request creation</h1>
      </div>
      <AdminStudentOperations
        csrfToken={csrfToken}
        locale="en"
        {...(typeof query.notice === "string" ? { notice: query.notice } : {})}
        {...(studentDraft === undefined ? {} : { studentDraft })}
        services={services}
        students={students.items}
      />
    </AdminShell>
  );
}
