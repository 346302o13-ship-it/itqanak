import Link from "next/link";

export default function StudentForbidden() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-10 text-center">
      <div className="w-full rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-8">
        <h1 className="text-3xl font-black">لا تملك الصلاحية</h1>
        <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
          هذا القسم متاح لحسابات الطلاب المخوّلة فقط.
        </p>
        <Link
          className="mt-6 inline-block text-sm font-black text-[var(--itq-color-brand-strong)] underline"
          href="/ar/account"
        >
          العودة إلى الحساب
        </Link>
      </div>
    </main>
  );
}
