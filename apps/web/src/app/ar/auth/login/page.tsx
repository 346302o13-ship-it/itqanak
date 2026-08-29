import Link from "next/link";
import { headers } from "next/headers";

import { AuthShell, CsrfInput, FormAlert } from "@/components/auth-shell";
import { InstallAppButton } from "@/components/install-app-button";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { safeNext } from "@/lib/auth-responses";
import { adminLoginHref } from "@/lib/admin-access";
import { supportWhatsAppHref } from "@/lib/support-contact";

interface LoginPageProps {
  readonly searchParams: Promise<{
    readonly next?: string | string[];
    readonly status?: string | string[];
    readonly id?: string | string[];
  }>;
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

export const metadata = { title: "تسجيل الدخول" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [token, query, requestHeaders] = await Promise.all([
    csrfTokenForPage(),
    searchParams,
    headers(),
  ]);
  const status = typeof query.status === "string" ? query.status : undefined;
  const identity = typeof query.id === "string" ? query.id : undefined;
  const badCredentials = status === "failed" || status === "invalid";
  const requestedNext = safeNext(typeof query.next === "string" ? query.next : undefined);
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const admin =
    host.split(":")[0]?.toLowerCase().startsWith("admin.") === true ||
    requestedNext.startsWith("/ar/admin");
  const next = admin ? "/ar/admin" : requestedNext;
  return (
    <AuthShell
      description={
        admin
          ? "دخول مخصص للمدير المخوّل لإدارة الطلبات والمحادثات والمحتوى."
          : "استخدم بيانات حسابك الموثّق. لا نحفظ الجلسة في المتصفح إلا داخل Cookie آمنة."
      }
      title={admin ? "دخول مركز الإدارة" : "تسجيل الدخول"}
    >
      {admin ? <InstallAppButton className="mb-5 w-full" locale="ar" surface="admin" /> : null}
      {status === "account_created" ? (
        <FormAlert tone="success">
          تم استلام طلب إنشاء الحساب. أكمل تأكيد رقم الجوال عبر واتساب قبل تسجيل الدخول.
        </FormAlert>
      ) : null}
      {status === "verified" ? (
        <FormAlert tone="success">تم تأكيد البريد الإلكتروني. يمكنك تسجيل الدخول الآن.</FormAlert>
      ) : null}
      {status === "password_reset" ? (
        <FormAlert tone="success">
          تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.
        </FormAlert>
      ) : null}
      {status === "logged_out" ? (
        <FormAlert tone="success">تم تسجيل الخروج بأمان.</FormAlert>
      ) : null}
      {status === "unverified" ? (
        <FormAlert>
          تم التحقق من بيانات الدخول، لكن يلزم تأكيد البريد أولاً.{" "}
          <Link className="underline" href="/ar/auth/resend-verification">
            أعد إرسال الرابط
          </Link>
        </FormAlert>
      ) : null}
      {status === "pending_verification" ? (
        <FormAlert>
          حسابك بانتظار تأكيد رقم الجوال.{" "}
          <a className="underline" href={supportWhatsAppHref("ar", "تأكيد الحساب")}>
            تواصل مع الدعم من الرقم المسجل
          </a>
          .
        </FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>تجاوزت الحد المؤقت للمحاولات. حاول لاحقاً.</FormAlert>
      ) : null}
      {status === "csrf" ? (
        <FormAlert>انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      {status === "failed" || status === "invalid" ? (
        <FormAlert>رقم الجوال/البريد الإلكتروني أو كلمة المرور غير صحيحة.</FormAlert>
      ) : null}
      <form action="/api/auth/login" className="grid gap-5" method="post">
        <CsrfInput token={token} />
        <input name="next" type="hidden" value={next} />
        <input name="locale" type="hidden" value="ar" />
        <div>
          <label className="text-sm font-bold" htmlFor="identity">
            رقم الجوال بصيغة دولية أو البريد الإلكتروني
          </label>
          <input
            autoComplete="username"
            autoFocus={identity !== undefined && !badCredentials}
            className={fieldClassName}
            defaultValue={identity}
            dir="ltr"
            id="identity"
            name="identity"
            placeholder="+9665xxxxxxxx أو name@example.com"
            required
            type="text"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-bold" htmlFor="password">
              كلمة المرور
            </label>
            <Link
              className="text-xs font-bold text-[var(--itq-color-brand-700)] underline"
              href="/ar/auth/forgot-password"
            >
              مشكلة في الدخول؟
            </Link>
          </div>
          <input
            autoComplete="current-password"
            autoFocus={badCredentials}
            className={fieldClassName}
            id="password"
            name="password"
            required
            type="password"
          />
        </div>
        <SubmitButton className="w-full" pendingLabel="جارٍ التحقق…">
          تسجيل الدخول
        </SubmitButton>
      </form>
      {!admin ? (
        <p className="mt-6 text-center text-sm text-[var(--itq-color-muted)]">
          ليس لديك حساب؟{" "}
          <Link
            className="font-bold text-[var(--itq-color-brand-700)] underline"
            href="/ar/auth/register"
          >
            أنشئ حساباً
          </Link>
        </p>
      ) : null}
      <p className="mt-3 text-center text-sm">
        أنت مدير؟{" "}
        <a
          className="font-bold text-[var(--itq-color-brand-700)] underline"
          href={adminLoginHref("ar")}
        >
          ادخل إلى مركز الإدارة
        </a>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link className="font-bold underline" href="/en/auth/login">
          English
        </Link>
      </p>
    </AuthShell>
  );
}
