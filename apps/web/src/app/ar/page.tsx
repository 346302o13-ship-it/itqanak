import type { Metadata } from "next";

import { LandingPage, type LandingPageCopy } from "@/components/marketing";
import { PublicShell } from "@/components/public-shell";
import { createContentRuntime } from "@/lib/content-runtime";

export const metadata: Metadata = {
  title: "إتقانك | خدمات دراستك في مكان واحد",
  description:
    "واجبات، بحوث، عروض تقديمية، مشاريع تخرج ومواقع إلكترونية — اطلب في نقرة، تابع من جوالك، وابدأ من ١٥ ريالاً.",
  alternates: { canonical: "/ar", languages: { "ar-SA": "/ar", en: "/en" } },
  openGraph: {
    title: "إتقانك | خدمات دراستك في مكان واحد",
    description: "من الواجب اليومي إلى مشروع التخرج، بأسعار رمزية ومتابعة واضحة من جوالك.",
    locale: "ar_SA",
    type: "website",
    url: "/ar",
    images: [{ url: "/images/itqanak-hero-v2.png", alt: "منصة إتقانك للدعم التعليمي" }],
  },
};
export const dynamic = "force-dynamic";

const landingCopy = {
  hero: {
    eyebrow: "منصة الدعم الدراسي",
    title: "خدمات دراستك كلها،",
    highlightedTitle: "في مكان واحد.",
    description:
      "من الواجب اليومي إلى البحث ومشروع التخرج والموقع الإلكتروني — اختر الخدمة، أرسل التفاصيل، وتابع كل تحديث من حسابك. الأسعار تبدأ من ١٥ ريالاً.",
    status: "الخدمات متاحة",
    primaryLabel: "استعرض الخدمات",
    whatsappLabel: "استفسار عبر واتساب",
    whatsappMessage: "مرحباً، أود معرفة الخدمة المناسبة لاحتياجي الدراسي في منصة إتقانك.",
    imageAlt: "منصة إتقانك للدعم الدراسي",
    priceChips: [
      "الواجبات من ٢٠ ر.س",
      "العروض التقديمية من ٤٠ ر.س",
      "مشاريع التخرج من ٣٠ ر.س",
      "شرح المواد من ١٥ ر.س",
    ],
    quickLinksLabel: "روابط سريعة",
    quickLinks: [
      { label: "الواجبات", slug: "assignment-guidance" },
      { label: "العروض التقديمية", slug: "presentation-visual-design" },
      { label: "مشاريع التخرج", slug: "project-guidance" },
      { label: "البحوث والتنسيق", slug: "document-formatting-review" },
      { label: "جميع الخدمات" },
    ],
  },
  stats: [
    { value: "‏٢٤+", label: "خدمة تعليمية مفصّلة" },
    { value: "‏٩", label: "مجالات دعم دراسي" },
    { value: "من ‏١٥ ر.س", label: "أسعار بداية واضحة" },
    { value: "واتساب", label: "دعم مباشر قبل الطلب" },
  ],
  trustItems: [
    {
      icon: "route",
      title: "كل شيء في مكان واحد",
      description: "واجبات وبحوث وعروض ومشاريع ومواقع — من نافذة واحدة بدل التنقل بين عدة أشخاص.",
    },
    {
      icon: "message",
      title: "متابعة من حسابك",
      description: "إشعار عند كل رد أو تحديث، وملفاتك محفوظة في حسابك للرجوع إليها في أي وقت.",
    },
    {
      icon: "lock",
      title: "أسعار واضحة وخصوصية",
      description:
        "السعر النهائي متفق عليه قبل بدء العمل، وطلبك وملفاتك لا يراها إلا الفريق المخوّل.",
    },
  ],
  services: {
    eyebrow: "الخدمات الأكثر طلباً",
    title: "ابدأ من الخدمة الأقرب لاحتياجك",
    description:
      "هذه الخدمات الأكثر طلباً بأسعارها التقريبية للبداية. اختر الخدمة لعرض تفاصيلها وبدء الطلب.",
    items: [
      {
        icon: "document",
        badge: "الأكثر طلباً",
        priceLabel: "يبدأ من ٢٠ ر.س",
        title: "إرشاد ومراجعة الواجبات",
        description: "نراجع حلّك، ونوضّح الأخطاء والفكرة خطوة بخطوة حتى تسلّم بثقة.",
        slug: "assignment-guidance",
      },
      {
        icon: "palette",
        badge: "الأكثر طلباً",
        priceLabel: "يبدأ من ٤٠ ر.س",
        title: "التصميم البصري للعروض",
        description: "عرض تقديمي متناسق لأي مقرر، جاهز للطباعة أو العرض المباشر.",
        slug: "presentation-visual-design",
      },
      {
        icon: "compass",
        badge: "الأكثر طلباً",
        priceLabel: "يبدأ من ٣٠ ر.س",
        title: "إرشاد مشاريع التخرج والمقررات",
        description: "توجيه عملي لفكرة المشروع وخطته وتنفيذه ومناقشته حتى التسليم.",
        slug: "project-guidance",
      },
      {
        icon: "document",
        priceLabel: "يبدأ من ٢٥ ر.س",
        title: "تنسيق ومراجعة المستند",
        description: "مراجعة لغوية وتنسيق احترافي لبحثك أو تقريرك حسب متطلبات جامعتك.",
        slug: "document-formatting-review",
      },
      {
        icon: "training",
        priceLabel: "يبدأ من ١٥ ر.س",
        title: "شرح المواد الدراسية",
        description: "جلسة تركّز على النقاط الصعبة في مادتك، بشرح مبسّط وأمثلة عملية.",
        slug: "subject-tutoring",
      },
      {
        icon: "code",
        priceLabel: "يبدأ من ٦٠ ر.س",
        title: "تطوير المواقع الإلكترونية",
        description: "موقع أو متجر إلكتروني لمشروعك، بتصميم نظيف وشرح لطريقة إدارته.",
        slug: "website-development",
      },
    ],
    itemCta: "عرض الخدمة",
    allCta: "جميع الخدمات",
  },
  process: {
    eyebrow: "بسيطة وسريعة",
    title: "اطلب في ٣ خطوات فقط",
    description:
      "من اختيار الخدمة إلى استلام العمل — كل خطوة واضحة، وتقدر تسألنا عبر واتساب في أي وقت.",
    steps: [
      {
        title: "اختر خدمتك",
        description: "واجب، بحث، عرض، مشروع أو موقع — اختر الأقرب إلى ما تحتاجه.",
      },
      {
        title: "أرسل التفاصيل",
        description: "اكتب المطلوب وأرفق ملفاتك، أو راسلنا مباشرة عبر واتساب.",
      },
      {
        title: "تابع من جوالك",
        description: "يوصلك إشعار عند كل تحديث، وتحمّل عملك جاهزاً من حسابك.",
      },
    ],
  },
  portal: {
    eyebrow: "بوابتك الخاصة",
    title: "كل طلباتك وملفاتك في صفحة واحدة",
    description:
      "من حفظ المسودة إلى تحميل العمل النهائي، تبقى تفاصيل كل طلب وحالته وملفاته مرتبة وسهلة الرجوع.",
    points: [
      "رقم واضح لكل طلب لسهولة المتابعة والرجوع.",
      "حالات مفهومة تخبرك أين وصل الطلب وهل يحتاج إجراءً منك.",
      "سجل زمني يحفظ كل تحديث مهم بالترتيب.",
      "ملفاتك خاصة، وتقدر تفتحها من جهازك حتى بعد انتهاء الطلب.",
    ],
    cta: "ادخل بوابة الطالب",
  },
  why: {
    eyebrow: "لماذا إتقانك؟",
    title: "تجربة مبنية على الوضوح والخصوصية",
    description: "لا نكتفي بتنفيذ الطلب؛ ننظّم رحلته كاملة حتى تعرف ما أرسلته وما تغيّر ومتى.",
    items: [
      {
        icon: "lock",
        title: "خاص وآمن",
        description: "طلبك وملفاتك لا يراها إلا أنت والفريق المخوّل بالعمل عليها.",
      },
      {
        icon: "files",
        title: "ملفاتك محفوظة",
        description: "كل ملف مرتبط بطلبه، وتقدر تفتحه من جهازك حتى بعد انتهاء الطلب.",
      },
      {
        icon: "message",
        title: "متابعة لحظية",
        description: "إشعار فوري على جوالك عند كل رد أو تغيّر في حالة الطلب.",
      },
      {
        icon: "headphones",
        title: "دعم بشري قريب",
        description: "اسألنا عبر واتساب قبل الطلب، ونساعدك تختار الخدمة الأنسب.",
      },
    ],
  },
  integrity: {
    eyebrow: "تعلم مسؤول",
    title: "النزاهة الأكاديمية جزء من الخدمة",
    description:
      "نساعد في الشرح والمراجعة والتنسيق والإرشاد والتطوير المشروع، ولا نقدم خدمات انتحال الشخصية أو أداء الاختبارات أو تجاوز أنظمة المؤسسة التعليمية.",
    commitment:
      "تبقى الأفكار والنتائج والعمل الأكاديمي المقيَّم مسؤولية الطالب، وتعمل خدماتنا على دعم الفهم وتحسين طريقة العرض.",
  },
  faq: {
    eyebrow: "أسئلة شائعة",
    title: "إجابات سريعة قبل أن تبدأ",
    description: "هذه أبرز الأسئلة عن الطلب والأسعار والملفات. ويمكنك سؤالنا مباشرة عند الحاجة.",
    items: [
      {
        question: "كم تكلفة الخدمة؟",
        answer:
          'أغلب الخدمات تعرض سعراً تقريبياً للبداية ("يبدأ من")، وتبدأ من ١٥ ريالاً. السعر النهائي يُحدَّد ويُتفق عليه بعد مراجعة نطاق طلبك وملفاته وموعده، وبعض الخدمات يُحدَّد سعرها بالاستفسار في المحادثة.',
      },
      {
        question: "كيف أختار الخدمة المناسبة؟",
        answer:
          "اقرأ وصف كل خدمة والنتيجة التي تغطيها. إذا كان احتياجك يجمع أكثر من جانب أو لم تجد الخيار الواضح، تواصل معنا عبر واتساب وسنساعدك في توجيه الطلب.",
      },
      {
        question: "هل يمكنني إرفاق ملفات مع الطلب؟",
        answer:
          "نعم، عندما تسمح الخدمة بذلك. تعرض صفحة الخدمة ما إذا كانت تقبل ملفات، وتظهر في بوابة الطلب حالة كل ملف بعد رفعه.",
      },
      {
        question: "من يستطيع رؤية طلبي وملفاتي؟",
        answer:
          "الطلب خاص بصاحب الحساب، ولا تصل إليه إلا الحسابات المخوّلة بتنفيذ العمل أو إدارته ضمن المنصة.",
      },
      {
        question: "ما الطلبات التي لا تقبلها إتقانك؟",
        answer:
          "لا نقبل دخول حسابات الغير أو أداء الاختبارات والواجبات المقيَّمة نيابة عن الطالب أو أي طلب يهدف إلى الغش أو انتحال العمل الأكاديمي.",
      },
    ],
    supportTitle: "لم تجد إجابتك؟",
    supportDescription: "اكتب لنا احتياجك باختصار وسنساعدك في تحديد نقطة البداية.",
    whatsappLabel: "تحدث مع الدعم",
  },
  finalCta: {
    eyebrow: "جاهز تبدأ؟",
    title: "حوّل احتياجك إلى طلب واضح خلال دقيقة",
    description: "اختر خدمتك الآن، أو اسألنا عبر واتساب إذا احتجت مساعدة في الاختيار.",
    primaryLabel: "اطلب الآن",
    whatsappLabel: "اسأل عبر واتساب",
  },
} satisfies LandingPageCopy;

export default async function ArabicLandingPage() {
  const runtime = await createContentRuntime();
  let contentBlocks;
  try {
    contentBlocks = await runtime.content.listPublishedBlocks("LANDING");
  } finally {
    await runtime.close();
  }
  return (
    <PublicShell active="home" locale="ar">
      <LandingPage contentBlocks={contentBlocks} copy={landingCopy} locale="ar" />
    </PublicShell>
  );
}
