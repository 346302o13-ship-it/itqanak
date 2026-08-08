import { AccountShell } from "@/components/account-shell";
import { CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { createAuthRuntime, csrfTokenForPage } from "@/lib/auth-runtime";
import { formatArabicDate, requirePagePrincipal } from "@/lib/account-page";

interface SessionsPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}

export const metadata = { title: "إدارة الجلسات" };
export const dynamic = "force-dynamic";

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const principal = await requirePagePrincipal("/ar/account/sessions");
  const [csrfToken, query] = await Promise.all([csrfTokenForPage(), searchParams]);
  const runtime = await createAuthRuntime();
  let sessions;
  try {
    sessions = await runtime.auth.listSessions(principal);
  } finally {
    await runtime.close();
  }
  const status = typeof query.status === "string" ? query.status : undefined;
  return (
    <AccountShell csrfToken={csrfToken} displayName={principal.displayName}>
      <h1 className="text-3xl font-black">الجلسات والأجهزة</h1>
      <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
        لا نعرض رموز الجلسات أو عناوين IP الكاملة. يمكنك إبطال أي جلسة لا تعرفها.
      </p>
      {status === "session_revoked" ? <FormAlert tone="success">تم إبطال الجلسة.</FormAlert> : null}
      {status === "failed" || status === "csrf" ? (
        <FormAlert>تعذر تنفيذ العملية. حدّث الصفحة ثم أعد المحاولة.</FormAlert>
      ) : null}
      <div className="mt-7 grid gap-4">
        {sessions.map((session) => (
          <article
            className="rounded-2xl border border-[var(--itq-color-border)] p-5"
            key={session.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-black">
                  {session.current ? "هذه الجلسة الحالية" : "جلسة محفوظة"}
                </h2>
                <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                  أُنشئت: {formatArabicDate(session.createdAt)} · آخر نشاط:{" "}
                  {formatArabicDate(session.lastSeenAt)}
                </p>
                <p className="mt-1 text-sm text-[var(--itq-color-muted)]">
                  {session.userAgentSummary ?? "جهاز غير معروف"}
                </p>
              </div>
              {session.revokedAt === undefined ? (
                <form action={`/api/account/sessions/${session.id}/revoke`} method="post">
                  <CsrfInput token={csrfToken} />
                  <SubmitButton pendingLabel="جارٍ الإبطال…">
                    {session.current ? "إنهاء هذه الجلسة" : "إبطال الجلسة"}
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-sm font-bold text-[var(--itq-color-muted)]">مبطلة</p>
              )}
            </div>
          </article>
        ))}
      </div>
      <form
        action="/api/account/sessions/revoke-all"
        className="mt-7 border-t border-[var(--itq-color-border)] pt-7"
        method="post"
      >
        <CsrfInput token={csrfToken} />
        <SubmitButton pendingLabel="جارٍ الإنهاء…">تسجيل الخروج من جميع الأجهزة</SubmitButton>
      </form>
    </AccountShell>
  );
}
