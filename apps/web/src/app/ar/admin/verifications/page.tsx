import { AdminShell } from "@/components/admin-shell";
import { CsrfInput } from "@/components/auth-shell";
import { LocalDateTime } from "@/components/local-date-time";
import { VerifiedIcon, WhatsAppIcon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface VerificationsPageProps {
  readonly searchParams: Promise<{ readonly notice?: string | readonly string[] }>;
}

const country = { SA: "السعودية", AE: "الإمارات", KW: "الكويت" } as const;

export const metadata = { title: "توثيق الحسابات" };
export const dynamic = "force-dynamic";

export default async function VerificationsPage({ searchParams }: VerificationsPageProps) {
  const query = await searchParams;
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/verifications"),
    csrfTokenForPage(),
  ]);
  const runtime = await createStudentRequestRuntime();
  let pending;
  try {
    pending = await runtime.auth.listPendingPhoneVerifications(principal, 100);
  } finally {
    await runtime.close();
  }
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName}>
      <div className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-[var(--itq-shadow-sm)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-[var(--itq-color-brand-700)]">الحسابات</p>
            <h1 className="mt-1 text-3xl font-black">توثيق أرقام واتساب</h1>
            <p className="mt-3 max-w-3xl leading-7 text-[var(--itq-color-muted)]">
              قارن الرقم الظاهر مع مرسل رسالة واتساب. لا تؤكد الحساب ما لم تصل الرسالة من الرقم
              نفسه، ثم أدخل مرجع المحادثة القابل للمراجعة.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-4 py-2 font-black text-amber-900">
            {pending.length} بانتظارك
          </span>
        </div>
        {query.notice === "verified" ? (
          <p
            className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900"
            role="status"
          >
            تم توثيق الرقم وتفعيل الحساب مع حفظ سجل التدقيق.
          </p>
        ) : null}
        <div className="mt-7 grid gap-5">
          {pending.length === 0 ? (
            <div className="grid place-items-center rounded-3xl bg-[var(--itq-color-surface-soft)] py-20 text-center">
              <VerifiedIcon className="size-12 text-emerald-700" />
              <h2 className="mt-4 text-xl font-black">لا توجد حسابات معلقة</h2>
              <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                تمت مراجعة جميع الطلبات الحالية.
              </p>
            </div>
          ) : (
            pending.map((item) => (
              <article
                className="grid gap-6 rounded-3xl border border-[var(--itq-color-border)] p-5 lg:grid-cols-[minmax(15rem,.7fr)_minmax(0,1.3fr)]"
                key={item.userId}
              >
                <div className="rounded-2xl bg-[#112c38] p-5 text-white">
                  <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-xl font-black">
                    {item.displayName.slice(0, 1)}
                  </span>
                  <h2 className="mt-4 text-xl font-black">{item.displayName}</h2>
                  <bdi
                    className="mt-2 block font-black text-[var(--itq-color-accent-200)]"
                    dir="ltr"
                  >
                    {item.phoneE164}
                  </bdi>
                  <p className="mt-2 text-xs text-white/65">
                    {country[item.countryCode]} · طلب في{" "}
                    <LocalDateTime value={item.requestedAt.toISOString()} />
                  </p>
                  <a
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1ca75b] px-4 text-sm font-black"
                    href={`https://wa.me/${item.phoneE164.replace("+", "")}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <WhatsAppIcon className="size-5" /> فتح محادثة الرقم
                  </a>
                </div>
                <form
                  action={`/api/admin/verifications/${encodeURIComponent(item.userId)}/confirm`}
                  className="grid content-start gap-4"
                  method="post"
                >
                  <CsrfInput token={csrfToken} />
                  <div>
                    <label className="text-sm font-black" htmlFor={`reference-${item.userId}`}>
                      مرجع محادثة واتساب *
                    </label>
                    <input
                      className="mt-2 h-12 w-full rounded-xl border border-[var(--itq-color-border)] px-4"
                      id={`reference-${item.userId}`}
                      maxLength={160}
                      minLength={3}
                      name="reference"
                      placeholder="مثال: WA-2026-08-12-1425"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-black" htmlFor={`note-${item.userId}`}>
                      ملاحظة المراجعة
                    </label>
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-xl border border-[var(--itq-color-border)] p-4"
                      id={`note-${item.userId}`}
                      maxLength={1000}
                      name="note"
                      placeholder="وصلت الرسالة من الرقم نفسه وتمت مطابقة الاسم…"
                    />
                  </div>
                  <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-950">
                    <input
                      className="mt-1"
                      name="confirmedSameNumber"
                      required
                      type="checkbox"
                      value="true"
                    />{" "}
                    أقر أن الرسالة وصلت من الرقم المعروض نفسه وأنني تحققت منه قبل التفعيل.
                  </label>
                  <SubmitButton className="w-fit" pendingLabel="جارٍ التوثيق…">
                    تأكيد الرقم وتفعيل الحساب
                  </SubmitButton>
                </form>
              </article>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
