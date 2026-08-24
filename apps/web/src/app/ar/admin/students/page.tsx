import { AdminShell } from "@/components/admin-shell";
import { AdminStudentOperations } from "@/components/admin-student-operations";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface PageProps {
  readonly searchParams: Promise<{ readonly notice?: string | string[] }>;
}

export const metadata = { title: "إدارة الطلاب" };
export const dynamic = "force-dynamic";

export default async function AdminStudentsPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/students", "ar", "admin.users.manage"),
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
      label: `${category.nameAr} — ${service.nameAr}`,
    })),
  );
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName}>
      <div className="mb-7">
        <p className="text-sm font-black text-[var(--itq-color-brand-700)]">إدارة آمنة ومباشرة</p>
        <h1 className="mt-1 text-3xl font-black">الطلاب وإنشاء الطلبات</h1>
      </div>
      <AdminStudentOperations
        csrfToken={csrfToken}
        {...(typeof query.notice === "string" ? { notice: query.notice } : {})}
        services={services}
        students={students.items}
      />
    </AdminShell>
  );
}
