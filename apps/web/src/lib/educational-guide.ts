import { SUPPORT_WHATSAPP_E164 } from "./support-contact";

export type EducationalGuideLocale = "ar" | "en";
export type EducationalGuideAudience = "public" | "student";

export interface EducationalGuideAction {
  readonly href: string;
  readonly label: string;
  readonly external?: boolean;
}

export interface EducationalGuideAnswer {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly steps?: readonly string[];
  readonly action?: EducationalGuideAction;
}

interface GuideEntry extends EducationalGuideAnswer {
  readonly keywords: readonly string[];
  readonly actionKind?: "services" | "request" | "account" | "learning" | "support";
}

const entriesByLocale: Readonly<Record<EducationalGuideLocale, readonly GuideEntry[]>> = {
  ar: [
    {
      id: "choose-service",
      title: "كيف أختار الخدمة المناسبة؟",
      summary:
        "اختر الترجمة للنصوص والوثائق، والتصميم للعروض، والمراجعة لتحسين التنسيق واللغة، والدعم التقني للمشكلات البرمجية، والإرشاد البحثي للمنهجية والمصادر، والجلسة التعليمية للفهم والتدريب.",
      steps: [
        "حدّد النتيجة التي تريد الوصول إليها، لا اسم المقرر فقط.",
        "اذكر اللغة والتخصص والموعد والملفات المتاحة بوضوح.",
        "إن بقي الاختيار غير واضح، تواصل مع الدعم قبل إنشاء الطلب.",
      ],
      keywords: [
        "اختار",
        "اختيار",
        "خدمه",
        "الخدمه",
        "ترجمه",
        "تصميم",
        "تنسيق",
        "برمجه",
        "بحث",
        "شرح",
      ],
      actionKind: "services",
    },
    {
      id: "request-flow",
      title: "كيف أبدأ وأتابع طلبي؟",
      summary:
        "بعد إنشاء الحساب وتأكيد رقم الجوال، افتح طلباً جديداً، اختر الخدمة، واكتب المطلوب والموعد. ستجد تحديثات الحالة ومحادثة الطلب وملفاته داخل بوابة الطالب.",
      steps: [
        "اكتب وصفاً محدداً وأرفق الملفات المرتبطة بالمطلوب فقط.",
        "تابع حالة الطلب والرسائل من صفحة الطلب نفسها.",
        "استخدم محادثة الطلب للتوضيحات حتى يبقى السياق منظماً.",
      ],
      keywords: ["طلب", "اطلب", "ابدأ", "انشاء", "متابعه", "حاله", "تحديث", "محادثه"],
      actionKind: "request",
    },
    {
      id: "phone-verification",
      title: "كيف يتم تأكيد رقم الجوال؟",
      summary:
        "يتم التأكيد يدوياً لحماية الحساب: راسل دعم إتقانك عبر واتساب من نفس رقم الجوال المسجل، ثم ينتظر الحساب مراجعة الدعم وتأكيده.",
      steps: [
        "استخدم الرقم نفسه الذي أدخلته عند التسجيل.",
        "لا ترسل كلمة المرور أو أي رمز سري إلى أي شخص.",
        "بعد التأكيد، ارجع إلى المنصة وسجّل الدخول.",
      ],
      keywords: ["تاكيد", "توثيق", "رقم", "جوال", "هاتف", "واتساب", "حساب"],
      actionKind: "account",
    },
    {
      id: "files-privacy",
      title: "ما أفضل طريقة لإرسال الملفات؟",
      summary:
        "أرسل الملفات المرتبطة بالطلب من صفحته، وسمّها بوضوح. يمكنك إرسال مستندات وصور أو تسجيل صوتي عندما تكون مفيدة، وتُفحص المرفقات قبل إتاحتها.",
      steps: [
        "احذف كلمات المرور والبيانات البنكية وأي بيانات لا يحتاجها الطلب.",
        "اخفِ أرقام الهوية والدرجات والمعلومات الشخصية غير الضرورية.",
        "تأكد من أن لديك حق مشاركة الملف، ولا ترفع محتوى مخالفاً أو ضاراً.",
      ],
      keywords: ["ملف", "ملفات", "مرفق", "صوره", "صور", "صوت", "خصوصيه", "ارسال", "رفع"],
      actionKind: "request",
    },
    {
      id: "responsible-learning",
      title: "كيف أستفيد تعليمياً بصورة مسؤولة؟",
      summary:
        "استخدم الخدمة للفهم والتدريب والمراجعة وتحسين عملك، ثم راجع النتيجة بنفسك ووثّق المصادر والتزم بسياسة جامعتك أو جهتك التعليمية.",
      steps: [
        "اطلب شرح الفكرة وخطوات الحل وأمثلة تدريبية، لا انتحال عمل شخص آخر.",
        "قارن الملاحظات بالمقرر والمصادر الأصلية واسأل عما لم تفهمه.",
        "لا تستخدم المنصة للغش في اختبار أو لتقديم عمل لا يمثل تعلمك.",
      ],
      keywords: ["تعلم", "دراسه", "شرح", "مسؤول", "امانه", "غش", "واجب", "اختبار", "مصادر"],
      actionKind: "learning",
    },
    {
      id: "password-support",
      title: "نسيت كلمة المرور، ماذا أفعل؟",
      summary:
        "استعادة الوصول تتم بمساعدة الدعم. تواصل عبر واتساب من رقم الجوال المسجل واطلب مراجعة إعادة التعيين؛ لن يطلب منك الدعم إرسال كلمة مرورك الحالية.",
      steps: [
        "تواصل من رقم الحساب نفسه لتسهيل التحقق.",
        "انتظر تأكيد الدعم قبل محاولة الدخول مجدداً.",
        "اختر كلمة مرور جديدة وفريدة ولا تشاركها مع أحد.",
      ],
      keywords: ["نسيت", "كلمه", "مرور", "دخول", "استعاده", "تغيير", "تعديل"],
      actionKind: "support",
    },
  ],
  en: [
    {
      id: "choose-service",
      title: "How do I choose the right service?",
      summary:
        "Choose translation for texts and documents, design for presentations, review for language and formatting, technical support for software issues, research guidance for methods and sources, and a learning session for explanation and practice.",
      steps: [
        "Describe the outcome you need, not only the course name.",
        "Include the language, subject, deadline, and available files.",
        "If the choice is still unclear, ask support before opening a request.",
      ],
      keywords: [
        "choose",
        "service",
        "translation",
        "design",
        "formatting",
        "technical",
        "research",
        "explain",
      ],
      actionKind: "services",
    },
    {
      id: "request-flow",
      title: "How do I start and track a request?",
      summary:
        "After creating your account and confirming your mobile number, open a new request, choose a service, and provide the brief and deadline. Status updates, messages, and files stay together in the student portal.",
      steps: [
        "Write a specific brief and attach only relevant files.",
        "Track status and messages from the request page.",
        "Use the request conversation for clarifications so the context stays organized.",
      ],
      keywords: ["request", "order", "start", "create", "track", "status", "update", "message"],
      actionKind: "request",
    },
    {
      id: "phone-verification",
      title: "How is my mobile number confirmed?",
      summary:
        "Confirmation is reviewed manually to protect your account. Message ITQANAK support on WhatsApp from the same mobile number you registered, then wait for support to confirm it.",
      steps: [
        "Use the same number entered during registration.",
        "Never send your password or a secret code to anyone.",
        "After confirmation, return to the platform and sign in.",
      ],
      keywords: [
        "verify",
        "verification",
        "confirm",
        "phone",
        "mobile",
        "number",
        "whatsapp",
        "account",
      ],
      actionKind: "account",
    },
    {
      id: "files-privacy",
      title: "What is the best way to send files?",
      summary:
        "Send request-related files from its page and name them clearly. Documents, images, or a voice note can be used when helpful, and attachments are scanned before they are made available.",
      steps: [
        "Remove passwords, banking details, and information the request does not need.",
        "Redact identity numbers, grades, and unnecessary personal information.",
        "Make sure you have permission to share the file and never upload harmful content.",
      ],
      keywords: [
        "file",
        "attachment",
        "document",
        "image",
        "photo",
        "voice",
        "privacy",
        "upload",
        "send",
      ],
      actionKind: "request",
    },
    {
      id: "responsible-learning",
      title: "How do I use support responsibly?",
      summary:
        "Use the service to understand, practise, review, and improve your own work. Check the result yourself, cite sources, and follow your institution's academic rules.",
      steps: [
        "Ask for explanations, solution steps, and practice examples—not impersonation or copied work.",
        "Compare guidance with your course and original sources, then ask about anything unclear.",
        "Do not use the platform to cheat in an assessment or submit work that misrepresents your learning.",
      ],
      keywords: [
        "learn",
        "study",
        "explain",
        "responsible",
        "integrity",
        "cheat",
        "assignment",
        "exam",
        "sources",
      ],
      actionKind: "learning",
    },
    {
      id: "password-support",
      title: "I forgot my password. What should I do?",
      summary:
        "Account recovery is reviewed by support. Contact us on WhatsApp from your registered number and request a reset review; support will never ask you to send your current password.",
      steps: [
        "Message from the same number used by the account.",
        "Wait for support's confirmation before trying again.",
        "Choose a new, unique password and never share it.",
      ],
      keywords: ["forgot", "password", "login", "sign in", "recover", "reset", "change"],
      actionKind: "support",
    },
  ],
};

const diacriticsPattern = /[\u064b-\u065f\u0670]/gu;
const punctuationPattern = /[^\p{L}\p{N}\s]/gu;

export function normalizeGuideQuery(query: string): string {
  return query
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(diacriticsPattern, "")
    .replace(/[أإآ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/ؤ/gu, "و")
    .replace(/ئ/gu, "ي")
    .replace(punctuationPattern, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function localHref(
  locale: EducationalGuideLocale,
  audience: EducationalGuideAudience,
  actionKind: GuideEntry["actionKind"],
): EducationalGuideAction | undefined {
  const prefix = `/${locale}`;
  const english = locale === "en";

  switch (actionKind) {
    case "services":
      return {
        href: `${prefix}/services`,
        label: english ? "Browse services" : "استعرض الخدمات",
      };
    case "request":
      return {
        href: audience === "student" ? `${prefix}/student/requests/new` : `${prefix}/auth/register`,
        label:
          audience === "student"
            ? english
              ? "Create a request"
              : "إنشاء طلب"
            : english
              ? "Create an account"
              : "إنشاء حساب",
      };
    case "account":
      return {
        href: audience === "student" ? `${prefix}/account` : `${prefix}/auth/register`,
        label:
          audience === "student"
            ? english
              ? "Open account settings"
              : "فتح إعدادات الحساب"
            : english
              ? "Create an account"
              : "إنشاء حساب",
      };
    case "learning":
      return {
        href: `${prefix}/services/guided-learning-session`,
        label: english ? "Explore learning sessions" : "استعرض جلسات الشرح",
      };
    case "support":
      return {
        external: true,
        href: educationalGuideSupportHref(locale),
        label: english ? "Contact support on WhatsApp" : "تواصل مع الدعم عبر واتساب",
      };
    default:
      return undefined;
  }
}

export function educationalGuideSupportHref(locale: EducationalGuideLocale): string {
  const message =
    locale === "en"
      ? "Hello ITQANAK support. I could not find a sufficient answer in the platform guide and need your help."
      : "مرحباً دعم إتقانك. لم أجد إجابة كافية في مرشد المنصة وأحتاج مساعدتكم.";
  return `https://wa.me/${SUPPORT_WHATSAPP_E164.slice(1)}?text=${encodeURIComponent(message)}`;
}

function withAction(
  entry: GuideEntry,
  locale: EducationalGuideLocale,
  audience: EducationalGuideAudience,
): EducationalGuideAnswer {
  const answer: EducationalGuideAnswer =
    entry.steps === undefined
      ? { id: entry.id, summary: entry.summary, title: entry.title }
      : { id: entry.id, steps: entry.steps, summary: entry.summary, title: entry.title };
  const action = localHref(locale, audience, entry.actionKind);
  return action === undefined ? answer : { ...answer, action };
}

export function educationalGuideTopics(
  locale: EducationalGuideLocale,
  audience: EducationalGuideAudience,
): readonly EducationalGuideAnswer[] {
  return entriesByLocale[locale].map((entry) => withAction(entry, locale, audience));
}

export function findEducationalGuideAnswer(
  locale: EducationalGuideLocale,
  audience: EducationalGuideAudience,
  query: string,
): EducationalGuideAnswer | undefined {
  const normalizedQuery = normalizeGuideQuery(query);
  if (normalizedQuery.length < 2) {
    return undefined;
  }

  let bestEntry: GuideEntry | undefined;
  let bestScore = 0;

  for (const entry of entriesByLocale[locale]) {
    const normalizedTitle = normalizeGuideQuery(entry.title);
    let score = normalizedTitle.includes(normalizedQuery) ? 4 : 0;

    for (const keyword of entry.keywords) {
      const normalizedKeyword = normalizeGuideQuery(keyword);
      if (normalizedQuery.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ") ? 3 : 2;
      }
    }

    if (score > bestScore) {
      bestEntry = entry;
      bestScore = score;
    }
  }

  // A single generic word (for example, “status”) is not enough to guess the
  // visitor's intent. Ambiguous questions are intentionally handed to support.
  return bestEntry === undefined || bestScore < 4
    ? undefined
    : withAction(bestEntry, locale, audience);
}
