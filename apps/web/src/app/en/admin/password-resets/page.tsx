import { AdminShell } from "@/components/admin-shell";
import { CsrfInput } from "@/components/auth-shell";
import { LocalDateTime } from "@/components/local-date-time";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface PageProps {
  readonly searchParams: Promise<{ readonly notice?: string | string[] }>;
}
export const metadata = { title: "Password recovery" };
export const dynamic = "force-dynamic";

export default async function EnglishPasswordResetRequestsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/password-resets", "en"),
    csrfTokenForPage(),
  ]);
  const runtime = await createStudentRequestRuntime();
  let pending;
  try {
    pending = await runtime.auth.listPhonePasswordResetRequests(principal, 100);
  } finally {
    await runtime.close();
  }
  const notice = typeof query.notice === "string" ? query.notice : undefined;
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <div className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-[var(--itq-shadow-sm)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-[var(--itq-color-brand-700)]">Account security</p>
            <h1 className="mt-1 text-3xl font-black">Password recovery requests</h1>
            <p className="mt-3 max-w-3xl leading-7 text-[var(--itq-color-muted)]">
              Approve only after the student sends the reference from the registered WhatsApp
              number. The link is one-time; only the student enters the new password inside the
              platform.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-4 py-2 font-black text-amber-900">
            {pending.length} awaiting review
          </span>
        </div>
        {notice === "rejected" ? (
          <p
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900"
            role="status"
          >
            The request was rejected and audited.
          </p>
        ) : null}
        {notice === "expired" ? (
          <p
            className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 font-bold text-amber-950"
            role="alert"
          >
            The reference expired. Ask the student to create a new one.
          </p>
        ) : null}
        {notice === "failed" ? (
          <p
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-950"
            role="alert"
          >
            The action could not be saved. Check the information and refresh.
          </p>
        ) : null}
        <div className="mt-7 grid gap-5">
          {pending.length === 0 ? (
            <div className="rounded-3xl bg-[var(--itq-color-surface-soft)] py-20 text-center">
              <h2 className="text-xl font-black">No pending requests</h2>
              <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                Unexpired requests will appear here.
              </p>
            </div>
          ) : (
            pending.map((item) => (
              <article
                className="grid gap-6 rounded-3xl border border-[var(--itq-color-border)] p-5 xl:grid-cols-[18rem_minmax(0,1fr)]"
                key={item.id}
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
                  <p className="mt-4 text-xs text-white/65">
                    Requested <LocalDateTime locale="en" value={item.requestedAt.toISOString()} />
                  </p>
                  <p className="mt-1 text-xs text-white/65">
                    Expires <LocalDateTime locale="en" value={item.expiresAt.toISOString()} />
                  </p>
                  <a
                    className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#159447] px-4 text-sm font-black"
                    href={`https://wa.me/${item.phoneE164.replace("+", "")}`}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Open WhatsApp chat
                  </a>
                </div>
                <div>
                  <div className="rounded-2xl border border-dashed border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)] p-5 text-center">
                    <p className="text-xs font-black text-[var(--itq-color-muted)]">
                      Reference the student must send
                    </p>
                    <bdi
                      className="mt-2 block font-mono text-2xl font-black tracking-wider"
                      dir="ltr"
                    >
                      {item.publicReference}
                    </bdi>
                  </div>
                  <form
                    action={`/api/admin/password-resets/${encodeURIComponent(item.id)}/issue`}
                    className="mt-5 grid gap-4"
                    method="post"
                  >
                    <CsrfInput token={csrfToken} />
                    <input name="locale" type="hidden" value="en" />
                    <div>
                      <label className="text-sm font-black" htmlFor={`student-ref-${item.id}`}>
                        Retype the reference received from the student *
                      </label>
                      <input
                        autoComplete="off"
                        className="mt-2 h-12 w-full rounded-xl border border-[var(--itq-color-border)] px-4 font-mono uppercase"
                        id={`student-ref-${item.id}`}
                        maxLength={13}
                        minLength={13}
                        name="studentReference"
                        pattern="PR-[A-Fa-f0-9]{10}"
                        placeholder="PR-XXXXXXXXXX"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-black" htmlFor={`wa-${item.id}`}>
                        WhatsApp conversation reference *
                      </label>
                      <input
                        className="mt-2 h-12 w-full rounded-xl border border-[var(--itq-color-border)] px-4"
                        id={`wa-${item.id}`}
                        maxLength={160}
                        minLength={3}
                        name="whatsappReference"
                        placeholder="Example: WA-2026-08-13-1425"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-black" htmlFor={`note-${item.id}`}>
                        Optional note
                      </label>
                      <textarea
                        className="mt-2 min-h-20 w-full rounded-xl border border-[var(--itq-color-border)] p-4"
                        id={`note-${item.id}`}
                        maxLength={1000}
                        name="note"
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
                      The message came from the displayed number.
                    </label>
                    <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-950">
                      <input
                        className="mt-1"
                        name="confirmedReference"
                        required
                        type="checkbox"
                        value="true"
                      />{" "}
                      The student supplied the displayed reference and I matched it exactly.
                    </label>
                    <SubmitButton className="w-fit" pendingLabel="Issuing link…">
                      Approve and issue one-time link
                    </SubmitButton>
                  </form>
                  <details className="mt-5 rounded-2xl border border-red-100 p-4">
                    <summary className="cursor-pointer text-sm font-black text-red-800">
                      Reject request
                    </summary>
                    <form
                      action={`/api/admin/password-resets/${encodeURIComponent(item.id)}/reject`}
                      className="mt-4 grid gap-3"
                      method="post"
                    >
                      <CsrfInput token={csrfToken} />
                      <input name="locale" type="hidden" value="en" />
                      <label className="text-xs font-black" htmlFor={`reason-${item.id}`}>
                        Reason
                      </label>
                      <textarea
                        className="min-h-20 rounded-xl border border-[var(--itq-color-border)] p-3"
                        id={`reason-${item.id}`}
                        maxLength={1000}
                        minLength={3}
                        name="reason"
                        required
                      />
                      <SubmitButton className="w-fit" pendingLabel="Rejecting…" variant="secondary">
                        Reject and record reason
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
