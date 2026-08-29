import Link from "next/link";

export default function EnglishStudentForbidden() {
  return (
    <main
      className="mx-auto grid min-h-screen max-w-xl place-items-center px-5 text-center"
      dir="ltr"
      lang="en"
    >
      <div>
        <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--itq-color-brand-strong)]">
          Access denied
        </p>
        <h1 className="mt-3 text-3xl font-black">You cannot access this area</h1>
        <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
          This account does not have the required student-portal permission.
        </p>
        <Link
          className="mt-6 inline-flex rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-3 font-black text-white"
          href="/en"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}
