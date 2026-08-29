import Link from "next/link";

import { LocalDateTime } from "@/components/local-date-time";
import { ManagedContentBlocks } from "@/components/managed-content-blocks";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { supportWhatsAppHref } from "@/lib/support-contact";
import { RequestStatusChip } from "@/components/request-status-chip";
import { RequestFlash } from "@/components/request-flash";
import { StudentShell } from "@/components/student-shell";
import {
  ArrowIcon,
  CheckIcon,
  ClockIcon,
  MessageIcon,
  PlusIcon,
  RequestsIcon,
  ServicesIcon,
  ShieldCheckIcon,
  WhatsAppIcon,
} from "@/components/icons";

interface StudentDashboardPageProps {
  readonly searchParams: Promise<{ readonly notice?: string | readonly string[] }>;
}

export const metadata = { title: "بوابة الطالب" };
export const dynamic = "force-dynamic";

export default async function StudentDashboardPage({ searchParams }: StudentDashboardPageProps) {
  const principal = await requireStudentPagePrincipal("/ar/student", "requests.read.own");
  const [csrfToken, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const runtime = await createStudentRequestRuntime();
  let dashboard;
  let contentBlocks;
  try {
    [dashboard, contentBlocks] = await Promise.all([
      runtime.requests.getStudentDashboard(principal),
      runtime.content.listPublishedBlocks("STUDENT_DASHBOARD"),
    ]);
  } finally {
    await runtime.close();
  }

  const metrics = [
    {
      label: "طلبات قيد المتابعة",
      value: dashboard.activeCount,
      caption: "نعمل عليها الآن",
      icon: RequestsIcon,
      tone: "bg-cyan-50 text-cyan-800",
    },
    {
      label: "تحتاج إلى ردك",
      value: dashboard.waitingForStudentCount,
      caption:
        dashboard.waitingForStudentCount > 0 ? "راجعها لتفادي التأخير" : "لا يوجد إجراء مطلوب",
      icon: MessageIcon,
      tone: "bg-amber-50 text-amber-800",
    },
    {
      label: "طلبات مكتملة",
      value: dashboard.completedCount,
      caption: "محفوظة في حسابك",
      icon: CheckIcon,
      tone: "bg-emerald-50 text-emerald-800",
    },
  ] as const;

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName}>
      <RequestFlash {...(typeof query.notice === "string" ? { status: query.notice } : {})} />
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--itq-color-border)] pb-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--itq-color-brand-700)]">
            مساحة العمل
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">أهلاً، {principal.displayName}</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--itq-color-muted)]">
            كل طلباتك وتحديثاتها وملفاتها في مكان واحد، بمتابعة مباشرة وواضحة.
          </p>
        </div>
        <Link
          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[var(--itq-color-brand-700)] px-5 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgb(16_93_89_/_20%)] transition hover:-translate-y-0.5 hover:bg-[var(--itq-color-brand-800)]"
          href="/ar/student/requests/new"
        >
          <PlusIcon className="size-5" />
          إنشاء طلب جديد
        </Link>
      </div>

      {dashboard.waitingForStudentCount > 0 ? (
        <Link
          className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 transition hover:border-amber-300"
          href="/ar/student/requests?status=WAITING_FOR_STUDENT"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white text-amber-700 shadow-sm">
              <ClockIcon className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-black">هناك طلب ينتظر معلومات منك</span>
              <span className="mt-1 block text-xs font-semibold text-amber-800">
                افتح الطلب وأرسل المطلوب حتى نكمل العمل دون تأخير.
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-black">
            عرض الطلبات <ArrowIcon className="size-4" />
          </span>
        </Link>
      ) : null}

      <dl className="mt-7 grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            className="group rounded-[1.35rem] border border-[var(--itq-color-border)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--itq-shadow-sm)]"
            key={metric.label}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={`grid size-11 place-items-center rounded-2xl ${metric.tone}`}>
                <metric.icon className="size-5" />
              </span>
              <dd className="text-4xl font-black tabular-nums">{metric.value}</dd>
            </div>
            <dt className="mt-5 text-sm font-black">{metric.label}</dt>
            <p className="mt-1 text-xs font-semibold text-[var(--itq-color-muted)]">
              {metric.caption}
            </p>
          </div>
        ))}
      </dl>

      <ManagedContentBlocks blocks={contentBlocks} locale="ar" surface="student" />

      <section className="mt-10 scroll-mt-28" aria-labelledby="recent-requests-title" id="activity">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black" id="recent-requests-title">
              آخر الطلبات
            </h2>
            <p className="mt-1 text-sm text-[var(--itq-color-muted)]">أحدث ما حدث في حسابك</p>
          </div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-black text-[var(--itq-color-brand-700)]"
            href="/ar/student/requests"
          >
            عرض الكل <ArrowIcon className="size-4" />
          </Link>
        </div>
        {dashboard.recent.length === 0 ? (
          <div className="mt-5 rounded-[1.5rem] border border-dashed border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)]/50 p-9 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-[var(--itq-color-brand-700)] shadow-sm">
              <RequestsIcon className="size-7" />
            </span>
            <p className="mt-4 font-black">مساحتك جاهزة لأول طلب</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--itq-color-muted)]">
              اختر الخدمة المناسبة، اشرح ما تحتاجه، وستتابع كل التحديثات من هنا.
            </p>
            <Link
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--itq-color-brand-700)] px-4 text-sm font-black text-white"
              href="/ar/student/requests/new"
            >
              <PlusIcon className="size-4" /> إنشاء طلبك الأول
            </Link>
          </div>
        ) : (
          <ul className="mt-5 overflow-hidden rounded-[1.35rem] border border-[var(--itq-color-border)] bg-white">
            {dashboard.recent.map((request) => (
              <li
                className="border-b border-[var(--itq-color-border)] last:border-0"
                key={request.id}
              >
                <Link
                  className="group flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-[var(--itq-color-surface-soft)] sm:p-5"
                  href={`/ar/student/requests/${encodeURIComponent(request.requestNumber)}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-700)]">
                      <RequestsIcon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-black" dir="auto">
                        {request.title || "مسودة بلا عنوان"}
                      </span>
                      <bdi className="mt-1 block text-xs text-[var(--itq-color-muted)]" dir="ltr">
                        {request.requestNumber}
                      </bdi>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <LocalDateTime
                      className="hidden text-xs text-[var(--itq-color-muted)] sm:inline"
                      value={request.updatedAt.toISOString()}
                    />
                    <RequestStatusChip status={request.status} />
                    <ArrowIcon className="size-4 text-[var(--itq-color-muted)] transition group-hover:-translate-x-1 group-hover:text-[var(--itq-color-brand-700)]" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Link
          className="group rounded-[1.35rem] border border-[var(--itq-color-border)] p-5 transition hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)]"
          href="/ar/services"
        >
          <ServicesIcon className="size-6 text-[var(--itq-color-brand-700)]" />
          <span className="mt-4 block font-black">استكشف الخدمات</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--itq-color-muted)]">
            اختر من الخدمات المتاحة
          </span>
        </Link>
        <Link
          className="group rounded-[1.35rem] border border-[var(--itq-color-border)] p-5 transition hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)]"
          href="/ar/account/security"
        >
          <ShieldCheckIcon className="size-6 text-[var(--itq-color-brand-700)]" />
          <span className="mt-4 block font-black">الحساب والأمان</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--itq-color-muted)]">
            راجع بياناتك وجلساتك
          </span>
        </Link>
        <a
          className="group rounded-[1.35rem] border border-[#bde8ce] bg-[#f0fcf5] p-5 transition hover:bg-[#e4f9ec]"
          href={supportWhatsAppHref("ar", "متابعة طلب طالب")}
          rel="noreferrer"
          target="_blank"
        >
          <WhatsAppIcon className="size-6 text-[#16834a]" />
          <span className="mt-4 block font-black text-[#145c39]">دعم واتساب</span>
          <span className="mt-1 block text-xs leading-5 text-[#48745d]">تواصل معنا عند الحاجة</span>
        </a>
      </div>
    </StudentShell>
  );
}
