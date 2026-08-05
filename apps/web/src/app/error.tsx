"use client";

export default function ErrorPage({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12 text-center">
      <section className="w-full rounded-3xl border border-[var(--itq-color-border)] bg-white p-8 shadow-[var(--itq-shadow-card)]">
        <h1 className="text-3xl font-black">تعذر إكمال الطلب</h1>
        <p className="mt-4 text-[var(--itq-color-muted)]">
          حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.
        </p>
        <button
          className="mt-7 rounded-xl bg-[var(--itq-color-brand-700)] px-4 py-3 font-bold text-white"
          onClick={reset}
          type="button"
        >
          إعادة المحاولة
        </button>
      </section>
    </main>
  );
}
