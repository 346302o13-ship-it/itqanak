import { AccountShell } from "@/components/account-shell";
import { CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { createAuthRuntime, csrfTokenForPage } from "@/lib/auth-runtime";
import { formatEnglishDate, requirePagePrincipal } from "@/lib/account-page";

interface SessionsPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}

export const metadata = { title: "Devices and sessions" };
export const dynamic = "force-dynamic";

export default async function EnglishSessionsPage({ searchParams }: SessionsPageProps) {
  const principal = await requirePagePrincipal("/en/account/sessions", "en");
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
    <AccountShell csrfToken={csrfToken} displayName={principal.displayName} locale="en">
      <h1 className="text-3xl font-black">Devices & sessions</h1>
      <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
        Session tokens and full IP addresses are never displayed. Revoke any session you do not
        recognise.
      </p>
      {status === "session_revoked" ? (
        <FormAlert tone="success">The session was revoked.</FormAlert>
      ) : null}
      {status === "failed" || status === "csrf" ? (
        <FormAlert>The action could not be completed. Refresh the page and try again.</FormAlert>
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
                  {session.current ? "This current session" : "Saved session"}
                </h2>
                <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                  Created: {formatEnglishDate(session.createdAt)} · Last active:{" "}
                  {formatEnglishDate(session.lastSeenAt)}
                </p>
                <p className="mt-1 text-sm text-[var(--itq-color-muted)]">
                  {session.userAgentSummary ?? "Unknown device"}
                </p>
              </div>
              {session.revokedAt === undefined ? (
                <form action={`/api/account/sessions/${session.id}/revoke`} method="post">
                  <CsrfInput token={csrfToken} />
                  <input name="locale" type="hidden" value="en" />
                  <SubmitButton pendingLabel="Revoking…">
                    {session.current ? "End this session" : "Revoke session"}
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-sm font-bold text-[var(--itq-color-muted)]">Revoked</p>
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
        <input name="locale" type="hidden" value="en" />
        <SubmitButton pendingLabel="Signing out…">Sign out of all devices</SubmitButton>
      </form>
    </AccountShell>
  );
}
