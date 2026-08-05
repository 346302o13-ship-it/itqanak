import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12 text-center">
      <section className="w-full rounded-3xl border border-[var(--itq-color-border)] bg-white p-8 shadow-[var(--itq-shadow-card)]">
        <p className="text-sm font-bold text-[var(--itq-color-brand-700)]">404</p>
        <h1 className="mt-3 text-3xl font-black">الصفحة غير موجودة</h1>
        <p className="mt-4 text-[var(--itq-color-muted)]">
          تحقق من الرابط أو عُد إلى الصفحة الرئيسية.
        </p>
        <Link
          className="mt-7 inline-flex rounded-xl bg-[var(--itq-color-brand-700)] px-4 py-3 font-bold text-white"
          href="/ar"
        >
          العودة إلى إتقانك
        </Link>
      </section>
    </main>
  );
}
