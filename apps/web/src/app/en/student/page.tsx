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

const shortcuts = [
  { label: "Assignments", slug: "assignment-guidance" },
  { label: "Presentations", slug: "presentation-visual-design" },
  { label: "Graduation projects", slug: "project-guidance" },
  { label: "Formatting & review", slug: "document-formatting-review" },
  { label: "Subject tutoring", slug: "subject-tutoring" },
  { label: "Website development", slug: "website-development" },
] as const;

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
      icon: RequestsIcon,
      tone: "bg-[var(--itq-color-info-50)] text-[var(--itq-color-info-700)]",
    },
    {
      label: "Waiting for you",
      value: dashboard.waitingForStudentCount,
      icon: MessageIcon,
      tone: "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-700)]",
    },
    {
      label: "Completed",
      value: dashboard.completedCount,
      icon: CheckIcon,
      tone: "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-700)]",
    },
  ] as const;

  const quickActions = [
    {
      href: "/en/services",
      icon: ServicesIcon,
      title: "Explore services",
      caption: "Browse every available service",
    },
    {
      href: "/en/account/security",
      icon: ShieldCheckIcon,
      title: "Account & security",
      caption: "Review your profile and sessions",
    },
  ] as const;

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <RequestFlash
        locale="en"
        {...(typeof query.notice === "string" ? { status: query.notice } : {})}
      />

      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--itq-color-border)] pb-6">
        <div>
          <p className="inline-flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--itq-color-brand-strong)]">
            <span aria-hidden="true" className="h-px w-5 bg-[var(--itq-color-accent-500)]" />
            Workspace
          </p>
          <h1 className="mt-3 text-[1.7rem] font-black leading-[1.15] tracking-[-0.015em] sm:text-[2.05rem]">
            Welcome, {principal.displayName}
          </h1>
          <p className="mt-3 max-w-2xl text-[0.98rem] leading-7 text-[var(--itq-color-muted)] sm:text-base">
            Follow every request, update, conversation and file from one clear, secure workspace.
          </p>
        </div>
        <Link
          className="inline-flex min-h-12 items-center gap-2 rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] px-5 font-black text-white shadow-[var(--itq-shadow-sm)] transition hover:bg-[var(--itq-color-brand-800)]"
          href="/en/student/requests/new"
        >
          <PlusIcon className="size-5" /> Order a service
        </Link>
      </div>

      <section aria-label="Quick shortcuts" className="mt-6">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--itq-color-muted)]">
          Order quickly
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {shortcuts.map((shortcut) => (
            <Link
              className="group inline-flex items-center gap-2 rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3.5 py-2 text-sm font-black transition hover:border-[var(--itq-color-brand-300)] hover:bg-[var(--itq-color-brand-50)]"
              href={`/en/student/requests/new?service=${shortcut.slug}`}
              key={shortcut.slug}
            >
              <span
                aria-hidden="true"
                className="size-1 rounded-full bg-[var(--itq-color-brand-strong)]"
              />
              {shortcut.label}
              <ArrowIcon className="size-3.5 -scale-x-100 text-[var(--itq-color-brand-strong)] transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      {dashboard.waitingForStudentCount > 0 ? (
        <Link
          className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--itq-radius-card)] border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-4 text-[var(--itq-color-warning-950)] transition hover:border-[var(--itq-color-warning-300)]"
          href="/en/student/requests?status=WAITING_FOR_STUDENT"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-surface)] text-[var(--itq-color-warning-700)]">
              <ClockIcon className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-black">A request needs information from you</span>
              <span className="mt-0.5 block text-xs font-semibold text-[var(--itq-color-warning-800)]">
                Open it and reply so work can continue without delay.
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-black">
            View requests <ArrowIcon className="size-4 -scale-x-100" />
          </span>
        </Link>
      ) : null}

      <dl className="mt-6 grid divide-y divide-[var(--itq-color-border)] overflow-hidden rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {metrics.map((metric) => (
          <div className="flex items-center gap-3.5 p-5" key={metric.label}>
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-[var(--itq-radius-control)] ${metric.tone}`}
            >
              <metric.icon className="size-5" />
            </span>
            <div>
              <dd className="text-2xl font-black leading-none tabular-nums">{metric.value}</dd>
              <dt className="mt-1 text-xs font-bold text-[var(--itq-color-muted)]">
                {metric.label}
              </dt>
            </div>
          </div>
        ))}
      </dl>

      <ManagedContentBlocks blocks={contentBlocks} locale="en" surface="student" />

      <section className="mt-9 scroll-mt-28" aria-labelledby="recent-requests-title" id="activity">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-black" id="recent-requests-title">
            Recent requests
          </h2>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-black text-[var(--itq-color-brand-strong)]"
            href="/en/student/requests"
          >
            View all <ArrowIcon className="size-4 -scale-x-100" />
          </Link>
        </div>
        {dashboard.recent.length === 0 ? (
          <div className="mt-4 rounded-[var(--itq-radius-card)] border border-dashed border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)]/50 p-8 text-center">
            <span
              aria-hidden="true"
              className="mx-auto grid size-12 place-items-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)]"
            >
              <RequestsIcon className="size-6" />
            </span>
            <p className="mt-4 font-black">Welcome to ITQANAK</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--itq-color-muted)]">
              No requests yet — pick a service above, explain what you need, and follow every update
              from here.
            </p>
            <Link
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] px-5 text-sm font-black text-white transition hover:bg-[var(--itq-color-brand-800)]"
              href="/en/student/requests/new"
            >
              <PlusIcon className="size-4" /> Order your first service
            </Link>
          </div>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)]">
            {dashboard.recent.map((request) => (
              <li
                className="border-b border-[var(--itq-color-border)] last:border-0"
                key={request.id}
              >
                <Link
                  className="group flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-[var(--itq-color-surface-soft)]"
                  href={`/en/student/requests/${encodeURIComponent(request.requestNumber)}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                      <RequestsIcon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black" dir="auto">
                        {request.title || "Untitled draft"}
                      </span>
                      <bdi className="mt-0.5 block text-xs text-[var(--itq-color-muted)]" dir="ltr">
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

      <div className="mt-9 grid gap-4 md:grid-cols-3">
        {quickActions.map((action) => (
          <Link
            className="group rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--itq-color-brand-300)] hover:shadow-[var(--itq-shadow-sm)]"
            href={action.href}
            key={action.href}
          >
            <span className="inline-flex size-10 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
              <action.icon className="size-5" />
            </span>
            <span className="mt-4 block font-black">{action.title}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--itq-color-muted)]">
              {action.caption}
            </span>
          </Link>
        ))}
        <a
          className="group rounded-[var(--itq-radius-card)] border border-[var(--itq-color-whatsapp-200)] bg-[var(--itq-color-whatsapp-50)] p-5 transition hover:-translate-y-0.5 hover:bg-[var(--itq-color-whatsapp-100)]"
          href={supportWhatsAppHref("en", "Student request follow-up")}
          rel="noreferrer"
          target="_blank"
        >
          <span className="inline-flex size-10 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-whatsapp-600)] text-white">
            <WhatsAppIcon className="size-5" />
          </span>
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
