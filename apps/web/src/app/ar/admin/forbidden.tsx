import { Surface } from "@itqanak/ui";

export default function AdminForbidden() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-12">
      <Surface className="w-full text-center">
        <h1 className="text-3xl font-black">403 — الوصول غير مسموح</h1>
        <p className="mt-4 leading-8 text-[var(--itq-color-muted)]">
          لا يملك هذا الحساب صلاحية فتح لوحة الإدارة.
        </p>
      </Surface>
    </main>
  );
}
