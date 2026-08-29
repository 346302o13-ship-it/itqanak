import Link from "next/link";

import { AuthShell, FormAlert } from "@/components/auth-shell";
import { SUPPORT_WHATSAPP_E164, supportWhatsAppHref } from "@/lib/support-contact";

export const metadata = { title: "تأكيد رقم الجوال" };

export default function PendingPhoneVerificationPage() {
  return (
    <AuthShell
      description="نراجع الحساب يدوياً لحماية الطلاب ومنع استخدام أرقام لا يملكونها."
      title="بقي تأكيد رقم الجوال"
    >
      <FormAlert tone="success">تم حفظ بيانات الحساب بأمان.</FormAlert>
      <ol className="grid list-decimal gap-4 pe-5 leading-7">
        <li>افتح واتساب باستخدام رقم الجوال نفسه الذي سجلته في المنصة.</li>
        <li>أرسل رسالة الدعم الجاهزة، ولا ترسل كلمة المرور أو أي بيانات حساسة.</li>
        <li>بعد مطابقة الرقم وتأكيد الإدارة للحساب، سجّل الدخول برقمك بصيغة دولية.</li>
      </ol>
      <a
        className="mt-7 flex min-h-12 items-center justify-center rounded-xl bg-[var(--itq-color-success-600)] px-5 py-3 text-center font-black text-white"
        href={supportWhatsAppHref("ar", "تأكيد حساب طالب")}
        rel="noreferrer"
        target="_blank"
      >
        مراسلة الدعم عبر واتساب
      </a>
      <p className="mt-3 text-center text-sm text-[var(--itq-color-muted)]" dir="ltr">
        {SUPPORT_WHATSAPP_E164}
      </p>
      <p className="mt-6 text-center text-sm">
        تم تأكيد الحساب؟{" "}
        <Link className="font-bold underline" href="/ar/auth/login">
          تسجيل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}
