import Link from "next/link";

import { FinanceService } from "@itqanak/finance";

import { AdminShell } from "@/components/admin-shell";
import { FinanceIcon, MessageIcon, RequestsIcon, VerifiedIcon } from "@/components/icons";
import { RequestStatusChip } from "@/components/request-status-chip";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { formatFinanceAmount } from "@/lib/finance-presenters";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

export const metadata = { title: "Admin dashboard" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminPage() {
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/en/admin", "en"),
    csrfTokenForPage(),
  ]);
  const runtime = await createStudentRequestRuntime();
  let requests;
  let conversations;
  let verifications;
  let financeReport;
  try {
    const finance = new FinanceService({ database: runtime.database });
    [requests, conversations, verifications, financeReport] = await Promise.all([
      runtime.adminRequests.listAdminRequests(principal, { page: 1, pageSize: 8 }),
      runtime.unifiedConversations.listConversations(principal, { page: 1, pageSize: 100 }),
      runtime.auth.listPendingPhoneVerifications(principal, 100),
      finance.getAdminReport(principal),
    ]);
  } finally {
    await runtime.close();
  }
  const unread = conversations.items.reduce((total, item) => total + item.unreadCount, 0);
  const unpaid = financeReport.totals.reduce((total, item) => total + item.unpaidCount, 0);
  const active = requests.items.filter(
    (item) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status),
  ).length;

  const metrics = [
    {
      label: "Unpaid dues",
      value: unpaid,
      detail: "Review amounts separately by currency",
      Icon: FinanceIcon,
      tone: "bg-violet-50 text-violet-800",
    },
    {
      label: "Visible requests",
      value: requests.total,
      detail: `${active} active in this list`,
      Icon: RequestsIcon,
      tone: "bg-sky-50 text-sky-800",
    },
    {
      label: "Unified conversations",
      value: unread,
      detail: `${conversations.total} student${conversations.total === 1 ? "" : "s"} in the communication inbox`,
      Icon: MessageIcon,
      tone: "bg-emerald-50 text-emerald-800",
    },
    {
      label: "Awaiting verification",
      value: verifications.length,
      detail: "Requires WhatsApp review",
      Icon: VerifiedIcon,
      tone: "bg-amber-50 text-amber-900",
    },
  ] as const;

  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-black text-[var(--itq-color-brand-700)]">Operations center</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Welcome, {principal.displayName}</h1>
          <p className="mt-3 text-[var(--itq-color-muted)]">
            Manage requests, conversations and account verification from one workspace.
          </p>
        </div>
        <Link
          className="rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-3 text-sm font-black text-white"
          href="/en/admin/support"
        >
          Open conversation center
        </Link>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Admin metrics">
        {metrics.map(({ label, value, detail, Icon, tone }) => (
          <article
            className="rounded-[1.5rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-[var(--itq-shadow-sm)]"
            key={label}
          >
            <span className={`grid size-11 place-items-center rounded-2xl ${tone}`}>
              <Icon className="size-5" />
            </span>
            <strong className="mt-5 block text-3xl font-black">
              {new Intl.NumberFormat("en-US").format(value)}
            </strong>
            <p className="mt-1 font-black">{label}</p>
            <p className="mt-2 text-xs font-semibold text-[var(--itq-color-muted)]">{detail}</p>
          </article>
        ))}
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.8fr)]">
        <section className="rounded-[1.5rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-[var(--itq-shadow-sm)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Latest requests</h2>
              <p className="mt-1 text-xs text-[var(--itq-color-muted)]">
                Quick view of priority and status
              </p>
            </div>
            <Link
              className="text-sm font-black text-[var(--itq-color-brand-700)] underline"
              href="/en/admin/requests"
            >
              View all
            </Link>
          </div>
          <div className="mt-5 grid gap-3">
            {requests.items.length === 0 ? (
              <p className="rounded-2xl bg-[var(--itq-color-surface-soft)] p-6 text-center text-sm text-[var(--itq-color-muted)]">
                No requests yet.
              </p>
            ) : (
              requests.items.map((item) => (
                <Link
                  className="grid gap-3 rounded-2xl border border-[var(--itq-color-border)] p-4 transition hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)] sm:grid-cols-[minmax(0,1fr)_auto]"
                  href={`/en/admin/requests/${encodeURIComponent(item.requestNumber)}`}
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-black" dir="auto">
                      {item.title || "Untitled request"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--itq-color-muted)]">
                      {item.studentDisplayName} · <bdi dir="ltr">{item.requestNumber}</bdi>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <RequestStatusChip locale="en" status={item.status} />
                    {item.unreadMessageCount > 0 ? (
                      <span className="grid size-7 place-items-center rounded-full bg-red-500 text-xs font-black text-white">
                        {item.unreadMessageCount}
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
        <div className="grid gap-6">
          <section className="rounded-[1.5rem] border border-[var(--itq-color-border)] bg-[#112c38] p-5 text-white shadow-[var(--itq-shadow-sm)]">
            <h2 className="text-xl font-black">Account verification</h2>
            <p className="mt-2 text-sm leading-7 text-white/70">
              Confirm an account only after receiving a message from the student's registered
              number.
            </p>
            <strong className="mt-7 block text-5xl font-black text-[var(--itq-color-accent-200)]">
              {new Intl.NumberFormat("en-US").format(verifications.length)}
            </strong>
            <p className="mt-2 text-sm font-bold">accounts waiting for review</p>
            <Link
              className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-white px-5 text-sm font-black text-[#112c38]"
              href="/en/admin/verifications"
            >
              Open verification queue
            </Link>
          </section>
          <section className="rounded-[1.5rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-[var(--itq-shadow-sm)]">
            <h2 className="text-xl font-black">Dues summary</h2>
            <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
              Paid and unpaid totals stay separated by currency.
            </p>
            <div className="mt-4 grid gap-2">
              {financeReport.totals.length === 0 ? (
                <p className="text-sm font-bold text-[var(--itq-color-muted)]">No dues yet.</p>
              ) : (
                financeReport.totals.map((total) => (
                  <div
                    className="rounded-xl bg-[var(--itq-color-surface-soft)] p-3"
                    key={total.currency}
                  >
                    <strong dir="ltr">
                      {formatFinanceAmount(
                        total.unpaidAmountMinor,
                        total.currency,
                        total.minorUnit,
                        "en",
                      )}
                    </strong>
                    <p className="mt-1 text-xs text-[var(--itq-color-muted)]">
                      {total.unpaidCount} unpaid · {total.paidCount} paid
                    </p>
                  </div>
                ))
              )}
            </div>
            <Link
              className="mt-4 inline-flex text-sm font-black text-[var(--itq-color-brand-700)] underline"
              href="/en/admin/finance"
            >
              Open financial report
            </Link>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
