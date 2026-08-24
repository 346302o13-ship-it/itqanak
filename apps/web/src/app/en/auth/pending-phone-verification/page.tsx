import Link from "next/link";

import { AuthShell, FormAlert } from "@/components/auth-shell";
import { SUPPORT_WHATSAPP_E164, supportWhatsAppHref } from "@/lib/support-contact";

export const metadata = { title: "Verify mobile number" };

export default function EnglishPendingPhoneVerificationPage() {
  return (
    <AuthShell
      description="Manual verification protects students from accounts registered with numbers they do not own."
      locale="en"
      title="Verify your mobile number"
    >
      <FormAlert tone="success">Your account details were saved securely.</FormAlert>
      <ol className="grid list-decimal gap-4 ps-5 leading-7">
        <li>Open WhatsApp using the same mobile number you registered.</li>
        <li>Send the prefilled support message. Never send your password.</li>
        <li>After an administrator matches the number, sign in using its E.164 format.</li>
      </ol>
      <a
        className="mt-7 flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-center font-black text-white"
        href={supportWhatsAppHref("en", "Student account verification")}
        rel="noreferrer"
        target="_blank"
      >
        Contact support on WhatsApp
      </a>
      <p className="mt-3 text-center text-sm text-[var(--itq-color-muted)]" dir="ltr">
        {SUPPORT_WHATSAPP_E164}
      </p>
      <p className="mt-6 text-center text-sm">
        Already verified?{" "}
        <Link className="font-bold underline" href="/en/auth/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
