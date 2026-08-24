"use client";

import { useEffect, useState } from "react";

const tokenPattern = /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/u;

interface IssuedPasswordResetLinkProps {
  readonly expiresAt: string;
  readonly locale: "ar" | "en";
  readonly phoneE164: string;
  readonly publicAppUrl: string;
  readonly publicReference: string;
}

export function IssuedPasswordResetLink({
  expiresAt,
  locale,
  phoneE164,
  publicAppUrl,
  publicReference,
}: IssuedPasswordResetLinkProps) {
  const english = locale === "en";
  const [resetLink, setResetLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const candidate = new URLSearchParams(globalThis.location.hash.slice(1)).get("token") ?? "";
    if (tokenPattern.test(candidate)) {
      setResetLink(`${publicAppUrl}/${locale}/auth/reset-password#token=${candidate}`);
    }
    if (globalThis.location.hash.length > 0) {
      globalThis.history.replaceState(
        null,
        "",
        `${globalThis.location.pathname}${globalThis.location.search}`,
      );
    }
  }, [locale, publicAppUrl]);

  const copy = async () => {
    if (resetLink.length === 0) return;
    await globalThis.navigator.clipboard.writeText(resetLink);
    setCopied(true);
  };

  return (
    <div className="mt-6 grid gap-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-7 text-amber-950">
        <strong className="block font-black">
          {english
            ? "This link is shown only on this screen"
            : "يظهر هذا الرابط في هذه الشاشة مرة واحدة"}
        </strong>
        {english
          ? "Copy it now, open the existing WhatsApp conversation, confirm the recipient is the registered number, then paste the link. Never ask for or send a password."
          : "انسخه الآن، وافتح محادثة واتساب الحالية، وتأكد أن المستلم هو الرقم المسجل، ثم الصق الرابط. لا تطلب كلمة المرور ولا ترسلها."}
      </div>
      <dl className="grid gap-3 rounded-2xl bg-[var(--itq-color-surface-soft)] p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">
            {english ? "Recovery reference" : "مرجع الاستعادة"}
          </dt>
          <dd className="mt-1 font-mono font-black" dir="ltr">
            {publicReference}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">
            {english ? "Registered number" : "الرقم المسجل"}
          </dt>
          <dd className="mt-1 font-black" dir="ltr">
            {phoneE164}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-bold text-[var(--itq-color-muted)]">
            {english ? "Link expires" : "تنتهي صلاحية الرابط"}
          </dt>
          <dd className="mt-1 font-black">
            <time dateTime={expiresAt}>
              {new Intl.DateTimeFormat(english ? "en-US" : "ar-SA", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(expiresAt))}
            </time>
          </dd>
        </div>
      </dl>
      {resetLink.length === 0 ? (
        <p
          className="rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-950"
          role="alert"
        >
          {english
            ? "The one-time link is no longer available on this screen. Ask the student to submit a new recovery request."
            : "لم يعد الرابط الأحادي متاحاً في هذه الشاشة. اطلب من الطالب إرسال طلب استعادة جديد."}
        </p>
      ) : (
        <>
          <label className="text-sm font-black" htmlFor="issued-reset-link">
            {english ? "One-time reset link" : "رابط إعادة التعيين الأحادي"}
          </label>
          <textarea
            className="min-h-28 w-full rounded-xl border border-[var(--itq-color-border)] bg-white p-4 font-mono text-xs"
            dir="ltr"
            id="issued-reset-link"
            readOnly
            value={resetLink}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="min-h-12 rounded-xl bg-[var(--itq-color-brand-700)] px-5 font-black text-white"
              onClick={copy}
              type="button"
            >
              {copied
                ? english
                  ? "Copied"
                  : "تم النسخ"
                : english
                  ? "Copy secure link"
                  : "نسخ الرابط الآمن"}
            </button>
            <a
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#159447] px-5 font-black text-white"
              href={`https://wa.me/${phoneE164.replace("+", "")}`}
              rel="noreferrer noopener"
              target="_blank"
            >
              {english ? "Open verified WhatsApp chat" : "فتح محادثة واتساب الموثقة"}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
