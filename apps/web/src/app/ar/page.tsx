import { BrandMark, StatusChip, Surface } from "@itqanak/ui";

const nextSteps = [
  "بنية آمنة قابلة للتوسع",
  "خدمات تعليمية ملتزمة بالنزاهة الأكاديمية",
  "تجربة عربية أولاً مع جاهزية للإنجليزية",
];

export default function ArabicLandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-5 py-12 sm:px-8">
      <Surface className="w-full overflow-hidden p-0">
        <div className="grid lg:grid-cols-[1.3fr_0.7fr]">
          <section className="p-7 sm:p-12">
            <div className="mb-10 flex items-center gap-3">
              <BrandMark />
              <span className="text-xl font-extrabold tracking-tight">إتقانك</span>
              <StatusChip tone="warning">قيد إعادة البناء</StatusChip>
            </div>
            <p className="mb-3 text-sm font-bold text-[var(--itq-color-brand-700)]">ITQANAK</p>
            <h1 className="max-w-2xl text-4xl font-black leading-[1.25] tracking-tight sm:text-5xl">
              نعيد بناء تجربة تعليمية أكثر أماناً ووضوحاً.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--itq-color-muted)]">
              نعمل حالياً على منصة جديدة لخدمات الشرح، المراجعة، التدريب، الترجمة، والتوجيه البحثي
              ضمن سياسة واضحة للنزاهة الأكاديمية.
            </p>
            <ul className="mt-9 grid gap-3" aria-label="مزايا المنصة القادمة">
              {nextSteps.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm font-bold">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full bg-[var(--itq-color-brand-600)]"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <aside className="bg-[var(--itq-color-brand-700)] p-7 text-white sm:p-12">
            <p className="text-sm font-bold text-[var(--itq-color-brand-100)]">مرحلة التأسيس</p>
            <h2 className="mt-4 text-2xl font-black leading-9">الخدمة ستتوفر قريباً.</h2>
            <p className="mt-5 leading-7 text-[var(--itq-color-brand-100)]">
              لا نقبل طلبات أو ملفات أو بيانات شخصية خلال فترة إعادة البناء.
            </p>
            <a
              className="mt-10 inline-flex rounded-xl border border-white/35 px-4 py-3 text-sm font-bold transition hover:bg-white/10"
              href="mailto:info@itqanqhelpstudent.online"
            >
              تواصل معنا
            </a>
          </aside>
        </div>
      </Surface>
    </main>
  );
}
