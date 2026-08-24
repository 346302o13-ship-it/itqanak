import Link from "next/link";

export default function StudentNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-10 text-center">
      <div className="w-full rounded-3xl border border-[var(--itq-color-border)] bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black">الطلب غير موجود</h1>
        <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
          لا يمكن العثور على هذا الطلب ضمن حسابك.
        </p>
        <Link
          className="mt-6 inline-block rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-3 font-black text-white"
          href="/ar/student/requests"
        >
          العودة إلى طلباتي
        </Link>
      </div>
    </main>
  );
}
