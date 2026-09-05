/**
 * Canned admin replies for the support composer. Fixed set for now — the
 * per-admin editable version (table + CRUD) is in the chat-audit backlog.
 * `{name}` is replaced with the student's display name at insert time.
 */
export interface QuickReply {
  readonly title: string;
  readonly body: string;
}

const byLocale: Readonly<Record<"ar" | "en", readonly QuickReply[]>> = {
  ar: [
    {
      title: "ترحيب",
      body: "أهلاً {name}! معك فريق إتقانك. كيف نقدر نساعدك اليوم؟",
    },
    {
      title: "طلب تفاصيل",
      body: "لخدمتك بشكل أدق، ممكن ترسل لنا تفاصيل المطلوب كاملة (نوع العمل، عدد الصفحات/الشرائح، وموعد التسليم)؟",
    },
    {
      title: "استلام الطلب",
      body: "تم استلام طلبك ✅ سنراجعه ونرجع لك بعرض السعر والمدة في أقرب وقت.",
    },
    {
      title: "تذكير بالسداد",
      body: "تذكير ودّي: يوجد مبلغ مستحق على طلبك. تقدر تسدد وترفع الإيصال من صفحة الطلب، وأي استفسار احنا حاضرين.",
    },
    {
      title: "جاري التنفيذ",
      body: "طلبك قيد التنفيذ الآن، وسنوافيك بالتحديثات أولاً بأول. شكراً لصبرك 🙏",
    },
    {
      title: "تم التسليم",
      body: "تم تسليم طلبك 🎉 نرجو مراجعته، وإذا احتجت أي تعديل خلال فترة المراجعة خبّرنا.",
    },
  ],
  en: [
    {
      title: "Welcome",
      body: "Hi {name}! This is the ITQANAK team. How can we help you today?",
    },
    {
      title: "Ask for details",
      body: "To help accurately, could you share the full brief (type of work, number of pages/slides, and the deadline)?",
    },
    {
      title: "Request received",
      body: "We've received your request ✅ We'll review it and get back to you with a quote and timeline shortly.",
    },
    {
      title: "Payment reminder",
      body: "Friendly reminder: there's an amount due on your request. You can pay and upload the receipt from the request page — let us know if you have any questions.",
    },
    {
      title: "In progress",
      body: "Your request is now in progress and we'll keep you posted. Thanks for your patience 🙏",
    },
    {
      title: "Delivered",
      body: "Your request has been delivered 🎉 Please review it, and tell us within the review window if anything needs changing.",
    },
  ],
};

export function quickReplies(locale: "ar" | "en"): readonly QuickReply[] {
  return byLocale[locale];
}

export function fillQuickReply(
  body: string,
  studentName: string | undefined,
  locale: "ar" | "en",
): string {
  const name = studentName?.trim() || (locale === "en" ? "there" : "بك");
  return body.replaceAll("{name}", name);
}
