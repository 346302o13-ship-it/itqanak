import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark, Surface } from "@itqanak/ui";

import { CsrfInput } from "./auth-shell";
import { SubmitButton } from "./submit-button";

interface AccountShellProps {
  readonly displayName: string;
  readonly csrfToken: string | undefined;
  readonly children: ReactNode;
}

const navigation = [
  { href: "/ar/account", label: "الحساب" },
  { href: "/ar/account/security", label: "الأمان" },
  { href: "/ar/account/sessions", label: "الجلسات" },
] as const;

export function AccountShell({ displayName, csrfToken, children }: AccountShellProps) {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <Link className="inline-flex items-center gap-3 text-lg font-black" href="/ar">
          <BrandMark />
          إتقانك
        </Link>
        <form action="/api/auth/logout" method="post">
          <CsrfInput token={csrfToken} />
          <SubmitButton pendingLabel="جارٍ الخروج…">تسجيل الخروج</SubmitButton>
        </form>
      </div>
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <Surface className="h-fit p-4 sm:p-5">
          <p className="px-3 pb-3 text-sm font-black">مرحباً، {displayName}</p>
          <nav aria-label="إدارة الحساب" className="grid gap-1">
            {navigation.map((item) => (
              <Link
                className="rounded-xl px-3 py-3 text-sm font-bold text-[var(--itq-color-brand-800)] hover:bg-[var(--itq-color-brand-50)]"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </Surface>
        <Surface>{children}</Surface>
      </div>
    </main>
  );
}
