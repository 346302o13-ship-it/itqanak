import { hasAdminAccess } from "@itqanak/auth";

import { AccountShell } from "@/components/account-shell";
import { CsrfInput, FormAlert } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage, createAuthRuntime } from "@/lib/auth-runtime";
import { formatEnglishDate, requirePagePrincipal } from "@/lib/account-page";

interface AccountPageProps {
  readonly searchParams: Promise<{ readonly status?: string | string[] }>;
}

const academicLevelOptions: readonly (readonly [string, string])[] = [
  ["SECONDARY", "Secondary school"],
  ["DIPLOMA", "Diploma"],
  ["BACHELOR", "Bachelor's"],
  ["MASTER", "Master's"],
  ["DOCTORATE", "Doctorate"],
  ["PROFESSIONAL", "Professional"],
  ["OTHER", "Other"],
];

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function EnglishAccountPage({ searchParams }: AccountPageProps) {
  const principal = await requirePagePrincipal("/en/account", "en");
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
      locale="en"
    >
      <h1 className="text-3xl font-black">My account</h1>
      <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
        Update your name and review your account details. Changing your contact number requires a
        separate verification process.
      </p>
      {status === "profile_saved" ? (
        <FormAlert tone="success">Your display name was saved.</FormAlert>
      ) : null}
      {status === "rate_limited" ? (
        <FormAlert>Too many attempts. Please try again later.</FormAlert>
      ) : null}
      {status === "failed" || status === "csrf" ? (
        <FormAlert>The change could not be saved. Refresh the page and try again.</FormAlert>
      ) : null}
      <dl className="mt-7 grid gap-4 rounded-2xl bg-[var(--itq-color-brand-50)] p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">
            {account.phoneE164 === undefined ? "Email address" : "Mobile number"}
          </dt>
          <dd className="mt-1 font-semibold" dir="ltr">
            {account.phoneE164 ?? account.email ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">Verification status</dt>
          <dd className="mt-1 font-semibold">
            {account.phoneVerificationStatus === "VERIFIED" ? "Mobile verified" : "Email verified"}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">Account created</dt>
          <dd className="mt-1 font-semibold">{formatEnglishDate(account.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">Role</dt>
          <dd className="mt-1 font-semibold">
            {account.roles.includes("ADMIN") ? "Administrator" : "Student"}
          </dd>
        </div>
      </dl>
      <form action="/api/account/profile" className="mt-8 grid max-w-lg gap-5" method="post">
        <CsrfInput token={csrfToken} />
        <input name="locale" type="hidden" value="en" />
        <div>
          <label className="text-sm font-bold" htmlFor="displayName">
            Display name
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
                Academic level
              </label>
              <select
                className={inputClassName}
                defaultValue={account.academicLevel ?? ""}
                id="academicLevel"
                name="academicLevel"
              >
                <option value="">Not specified</option>
                {academicLevelOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-bold" htmlFor="institutionName">
                Institution or university
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
                We use these to pre-fill your new requests.
              </p>
            </div>
          </>
        )}
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </form>
    </AccountShell>
  );
}
