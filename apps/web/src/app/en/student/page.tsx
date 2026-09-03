import Link from "next/link";

import { LocalDateTime } from "@/components/local-date-time";
import { ManagedContentBlocks } from "@/components/managed-content-blocks";
import { RequestFlash } from "@/components/request-flash";
import { RequestStatusChip } from "@/components/request-status-chip";
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
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";
import { supportWhatsAppHref } from "@/lib/support-contact";

interface DashboardPageProps {
  readonly searchParams: Promise<{ readonly notice?: string | readonly string[] }>;
}

export const metadata = { title: "Student portal" };
export const dynamic = "force-dynamic";

export default async function EnglishStudentDashboard({ searchParams }: DashboardPageProps) {
  const principal = await requireStudentPagePrincipal("/en/student", "requests.read.own", "en");
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
      label: "Active requests",
      value: dashboard.activeCount,
      caption: "Currently being followed up",
      icon: RequestsIcon,
      tone: "bg-[var(--itq-color-info-50)] text-[var(--itq-color-info-800)]",
    },
    {
      label: "Waiting for you",
      value: dashboard.waitingForStudentCount,
      caption:
        dashboard.waitingForStudentCount > 0 ? "Reply to prevent delays" : "No action required",
      icon: MessageIcon,
      tone: "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-800)]",
    },
    {
      label: "Completed",
      value: dashboard.completedCount,
      caption: "Saved in your account",
      icon: CheckIcon,
      tone: "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-800)]",
    },
  ] as const;

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <RequestFlash
        locale="en"
        {...(typeof query.notice === "string" ? { status: query.notice } : {})}
      />
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--itq-color-border)] pb-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--itq-color-brand-strong)]">
            Workspace
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Welcome, {principal.displayName}</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--itq-color-muted)]">
            Follow every request, update, conversation and file from one clear, secure workspace.
          </p>
        </div>
        <Link
          className="itq-sheen inline-flex min-h-14 items-center gap-2.5 rounded-2xl bg-[linear-gradient(120deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] px-6 py-3.5 text-base font-black text-white shadow-[var(--itq-shadow-float)] transition hover:-translate-y-0.5 hover:shadow-[var(--itq-shadow-lg)]"
          href="/en/student/requests/new"
        >
          <PlusIcon className="size-5" /> Order a service
        </Link>
      </div>

      <section aria-label="Quick shortcuts" className="mt-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--itq-color-muted)]">
          Order quickly
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {[
            { emoji: "📚", label: "Assignments", slug: "assignment-guidance" },
            { emoji: "🎨", label: "Presentations", slug: "presentation-visual-design" },
            { emoji: "🚀", label: "Graduation projects", slug: "project-guidance" },
            { emoji: "📝", label: "Formatting & review", slug: "document-formatting-review" },
            { emoji: "💡", label: "Subject tutoring", slug: "subject-tutoring" },
            { emoji: "💻", label: "Websites", slug: "website-development" },
          ].map((shortcut) => (
            <Link
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3.5 py-2.5 text-sm font-black shadow-[var(--itq-shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)]"
              href={`/en/student/requests/new?service=${shortcut.slug}`}
              key={shortcut.slug}
            >
              <span aria-hidden="true" className="text-lg">
                {shortcut.emoji}
              </span>
              {shortcut.label}
            </Link>
          ))}
        </div>
      </section>

      {dashboard.waitingForStudentCount > 0 ? (
        <Link
          className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-4 text-[var(--itq-color-warning-950)] transition hover:border-[var(--itq-color-warning-300)]"
          href="/en/student/requests?status=WAITING_FOR_STUDENT"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--itq-color-surface)] text-[var(--itq-color-warning-700)] shadow-sm">
              <ClockIcon className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-black">A request needs information from you</span>
              <span className="mt-1 block text-xs font-semibold text-[var(--itq-color-warning-800)]">
                Open it and reply so work can continue without delay.
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-black">
            View requests <ArrowIcon className="size-4 -scale-x-100" />
          </span>
        </Link>
      ) : null}

      <dl className="mt-7 grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            className="group rounded-[1.35rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--itq-shadow-sm)]"
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

      <ManagedContentBlocks blocks={contentBlocks} locale="en" surface="student" />

      <section className="mt-10 scroll-mt-28" aria-labelledby="recent-requests-title" id="activity">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black" id="recent-requests-title">
              Recent requests
            </h2>
            <p className="mt-1 text-sm text-[var(--itq-color-muted)]">
              The latest activity in your account
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-black text-[var(--itq-color-brand-strong)]"
            href="/en/student/requests"
          >
            View all <ArrowIcon className="size-4 -scale-x-100" />
          </Link>
        </div>
        {dashboard.recent.length === 0 ? (
          <div className="mt-5 rounded-[1.5rem] border border-dashed border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)]/50 p-9 text-center">
            <span
              aria-hidden="true"
              className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--itq-color-surface)] text-3xl shadow-sm"
            >
              🎓
            </span>
            <p className="mt-4 text-lg font-black">Welcome to ITQANAK!</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--itq-color-muted)]">
              No requests yet — pick a service above, explain what you need, and follow every update
              from here.
            </p>
            <Link
              className="itq-sheen mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[linear-gradient(120deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] px-5 text-sm font-black text-white shadow-[var(--itq-shadow-float)]"
              href="/en/student/requests/new"
            >
              <PlusIcon className="size-4" /> Order your first service
            </Link>
          </div>
        ) : (
          <ul className="mt-5 overflow-hidden rounded-[1.35rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]">
            {dashboard.recent.map((request) => (
              <li
                className="border-b border-[var(--itq-color-border)] last:border-0"
                key={request.id}
              >
                <Link
                  className="group flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-[var(--itq-color-surface-soft)] sm:p-5"
                  href={`/en/student/requests/${encodeURIComponent(request.requestNumber)}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                      <RequestsIcon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-black" dir="auto">
                        {request.title || "Untitled draft"}
                      </span>
                      <bdi className="mt-1 block text-xs text-[var(--itq-color-muted)]" dir="ltr">
                        {request.requestNumber}
                      </bdi>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <LocalDateTime
                      className="hidden text-xs text-[var(--itq-color-muted)] sm:inline"
                      locale="en"
                      value={request.updatedAt.toISOString()}
                    />
                    <RequestStatusChip locale="en" status={request.status} />
                    <ArrowIcon className="size-4 -scale-x-100 text-[var(--itq-color-muted)] transition group-hover:translate-x-1 group-hover:text-[var(--itq-color-brand-strong)]" />
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
          href="/en/services"
        >
          <ServicesIcon className="size-6 text-[var(--itq-color-brand-strong)]" />
          <span className="mt-4 block font-black">Explore services</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--itq-color-muted)]">
            Choose from the available services
          </span>
        </Link>
        <Link
          className="group rounded-[1.35rem] border border-[var(--itq-color-border)] p-5 transition hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)]"
          href="/en/account/security"
        >
          <ShieldCheckIcon className="size-6 text-[var(--itq-color-brand-strong)]" />
          <span className="mt-4 block font-black">Account & security</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--itq-color-muted)]">
            Review your profile and sessions
          </span>
        </Link>
        <a
          className="group rounded-[1.35rem] border border-[var(--itq-color-whatsapp-200)] bg-[var(--itq-color-whatsapp-50)] p-5 transition hover:bg-[var(--itq-color-whatsapp-100)]"
          href={supportWhatsAppHref("en", "Student request follow-up")}
          rel="noreferrer"
          target="_blank"
        >
          <WhatsAppIcon className="size-6 text-[var(--itq-color-whatsapp-600)]" />
          <span className="mt-4 block font-black text-[var(--itq-color-whatsapp-800)]">
            WhatsApp support
          </span>
          <span className="mt-1 block text-xs leading-5 text-[var(--itq-color-whatsapp-muted)]">
            Contact us whenever you need help
          </span>
        </a>
      </div>
    </StudentShell>
  );
}
