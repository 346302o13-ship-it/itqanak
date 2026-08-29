import { hasAdminAccess } from "@itqanak/auth";

import { AccountShell } from "@/components/account-shell";
import { CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage, createAuthRuntime } from "@/lib/auth-runtime";
import { formatArabicDate, requirePagePrincipal } from "@/lib/account-page";

interface AccountPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}
const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

const academicLevelOptions: readonly (readonly [string, string])[] = [
  ["SECONDARY", "الثانوية"],
  ["DIPLOMA", "الدبلوم"],
  ["BACHELOR", "البكالوريوس"],
  ["MASTER", "الماجستير"],
  ["DOCTORATE", "الدكتوراه"],
  ["PROFESSIONAL", "مهني"],
  ["OTHER", "أخرى"],
];

export const metadata = { title: "حسابي" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const principal = await requirePagePrincipal("/ar/account");
  const [csrfToken, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const runtime = await createAuthRuntime();
  let account;
  try {
    account = await runtime.auth.getAccount(principal);
  } finally {
    await runtime.close();
  }
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AccountShell
      surface={hasAdminAccess(principal) ? "admin" : "student"}
      csrfToken={csrfToken}
      displayName={account.displayName}
    >
      <h1 className="text-3xl font-black">حسابي</h1>
      <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
        يمكنك تحديث الاسم وإدارة وسائل الأمان. تغيير وسيلة الاتصال يحتاج تدفق تحقق مستقل.
      </p>
      {status === "profile_saved" ? <FormAlert tone="success">تم حفظ الاسم.</FormAlert> : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "failed" || status === "csrf" ? (
        <FormAlert>تعذر حفظ التغيير. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      <dl className="mt-7 grid gap-4 rounded-2xl bg-[var(--itq-color-brand-50)] p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">
            {account.phoneE164 === undefined ? "البريد الإلكتروني" : "رقم الجوال"}
          </dt>
          <dd className="mt-1 font-semibold" dir="ltr">
            {account.phoneE164 ?? account.email ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">حالة التحقق</dt>
          <dd className="mt-1 font-semibold">
            {account.phoneVerificationStatus === "VERIFIED" ? "الجوال مؤكّد" : "البريد مؤكّد"}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">تاريخ إنشاء الحساب</dt>
          <dd className="mt-1 font-semibold">{formatArabicDate(account.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">الدور</dt>
          <dd className="mt-1 font-semibold">
            {account.roles.includes("ADMIN") ? "مدير" : "طالب"}
          </dd>
        </div>
      </dl>
      <form action="/api/account/profile" className="mt-8 grid max-w-lg gap-5" method="post">
        <CsrfInput token={csrfToken} />
        <div>
          <label className="text-sm font-bold" htmlFor="displayName">
            الاسم الظاهر
          </label>
          <input
            autoComplete="name"
            className={inputClassName}
            defaultValue={account.displayName}
            id="displayName"
            maxLength={120}
            minLength={2}
            name="displayName"
            required
          />
        </div>
        {account.roles.includes("ADMIN") ? null : (
          <>
            <div>
              <label className="text-sm font-bold" htmlFor="academicLevel">
                المستوى الدراسي
              </label>
              <select
                className={inputClassName}
                defaultValue={account.academicLevel ?? ""}
                id="academicLevel"
                name="academicLevel"
              >
                <option value="">غير محدد</option>
                {academicLevelOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-bold" htmlFor="institutionName">
                المؤسسة أو الجامعة
              </label>
              <input
                className={inputClassName}
                defaultValue={account.institutionName}
                id="institutionName"
                maxLength={200}
                minLength={2}
                name="institutionName"
              />
              <p className="mt-1 text-xs text-[var(--itq-color-muted)]">
                نستخدم هذين الحقلين لتعبئة طلباتك الجديدة تلقائيًّا.
              </p>
            </div>
          </>
        )}
        <SubmitButton pendingLabel="جارٍ الحفظ…">حفظ التغييرات</SubmitButton>
      </form>
    </AccountShell>
  );
}
