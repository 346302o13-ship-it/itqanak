import Link from "next/link";

import { MessageIcon } from "./icons";
import { InstallAppButton } from "./install-app-button";

interface StudentSupportFabProps {
  readonly locale?: "ar" | "en";
}

/**
 * Floating action stack for the student portal. Replaces the old learning-guide
 * bot trigger: a signed-in student has a real conversation with the team, so the
 * button opens it directly. The install pill sits above it and shows only while
 * the app can still be installed on this device.
 */
export function StudentSupportFab({ locale = "ar" }: StudentSupportFabProps) {
  const english = locale === "en";
  return (
    <div className="fixed bottom-24 end-4 z-[71] flex flex-col items-end gap-2 lg:bottom-6 print:hidden">
      <InstallAppButton locale={locale} surface="student" variant="fab" />
      <Link
        className="inline-flex min-h-14 items-center gap-3 rounded-full border border-white/20 bg-[var(--itq-color-brand-800)] px-4 text-white shadow-[var(--itq-shadow-float)] transition hover:-translate-y-0.5 hover:bg-[var(--itq-color-brand-900)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--itq-color-brand-600)]"
        href={`/${locale}/student/support`}
      >
        <span className="grid size-9 place-items-center rounded-full bg-white/10">
          <MessageIcon className="size-5" />
        </span>
        <span className="pe-1 text-sm font-black">
          {english ? "Message the team" : "محادثة الإدارة"}
        </span>
      </Link>
    </div>
  );
}
