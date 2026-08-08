import { AuthorizationError, requireAdmin } from "@itqanak/auth";
import { BrandMark, Surface } from "@itqanak/ui";
import { forbidden, redirect } from "next/navigation";

import { currentPrincipal } from "@/lib/auth-runtime";

export const metadata = { title: "لوحة الإدارة" };

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const principal = await currentPrincipal();
  if (principal === undefined) {
    redirect("/ar/auth/login?next=%2Far%2Fadmin");
  }
  try {
    requireAdmin(principal);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      forbidden();
    }
    throw error;
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-12">
      <Surface className="w-full text-center">
        <div className="mx-auto mb-6 w-fit">
          <BrandMark label="إتقانك" />
        </div>
        <h1 className="mt-5 text-3xl font-black">لوحة إدارة إتقانك</h1>
        <p className="mx-auto mt-4 max-w-xl leading-8 text-[var(--itq-color-muted)]">
          تم التحقق من الجلسة والدور وصلاحية الإدارة. ستصل وظائف الإدارة التفصيلية في مرحلة لاحقة.
        </p>
      </Surface>
    </main>
  );
}
