/**
 * Field-level messaging for the registration form. The POST handler redirects
 * back with a short `e=<code>` plus the non-secret values the visitor already
 * typed (`n` name, `m` email, `p` phone, `c` country); the page repopulates the
 * fields and shows the message beside the one that failed instead of a single
 * opaque "could not create the account".
 */
export const registerErrorCodes = [
  "pw_mismatch",
  "pw_weak",
  "email",
  "email_taken",
  "phone",
  "country",
  "consent",
  "csrf",
  "rate",
  "failed",
] as const;

export type RegisterErrorCode = (typeof registerErrorCodes)[number];

export type RegisterFieldKey =
  | "displayName"
  | "email"
  | "countryCode"
  | "phone"
  | "password"
  | "consent";

export interface RegisterFieldMessages {
  readonly summary?: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly countryCode?: string;
  readonly phone?: string;
  readonly password?: string;
  readonly consent?: string;
}

function isRegisterErrorCode(value: string | undefined): value is RegisterErrorCode {
  return value !== undefined && (registerErrorCodes as readonly string[]).includes(value);
}

const copy: Record<
  "ar" | "en",
  Record<RegisterErrorCode, { summary: string; field?: RegisterFieldKey; message?: string }>
> = {
  ar: {
    pw_mismatch: {
      summary: "كلمتا المرور غير متطابقتين.",
      field: "password",
      message: "أعد إدخال كلمة المرور نفسها في الحقلين.",
    },
    pw_weak: {
      summary: "كلمة المرور يجب أن تكون بين 12 و128 حرفاً.",
      field: "password",
      message: "استخدم 12 حرفاً على الأقل، ويفضّل عبارة مرور طويلة.",
    },
    email: {
      summary: "صيغة البريد الإلكتروني غير صحيحة.",
      field: "email",
      message: "تحقق من البريد، مثال: name@example.com",
    },
    email_taken: {
      summary: "هذا البريد مسجّل بالفعل.",
      field: "email",
      message: "لديك حساب بهذا البريد؟ سجّل الدخول بدل إنشاء حساب جديد.",
    },
    phone: {
      summary: "رقم الجوال غير صالح للدولة المختارة.",
      field: "phone",
      message: "أدخل الرقم المحلي بدون رمز الدولة، مثال: 05xxxxxxxx",
    },
    country: {
      summary: "اختر دولة من القائمة.",
      field: "countryCode",
      message: "الدول المدعومة حالياً: السعودية والإمارات والكويت.",
    },
    consent: {
      summary: "يلزم الموافقة على الشروط وسياسة الخصوصية.",
      field: "consent",
      message: "علّم على الموافقتين للمتابعة.",
    },
    csrf: { summary: "انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة." },
    rate: { summary: "تجاوزت الحد المؤقت للمحاولات. انتظر قليلاً ثم أعد المحاولة." },
    failed: { summary: "تعذّر إتمام التسجيل. راجع البيانات ثم أعد المحاولة." },
  },
  en: {
    pw_mismatch: {
      summary: "The two passwords do not match.",
      field: "password",
      message: "Enter the same password in both fields.",
    },
    pw_weak: {
      summary: "The password must be 12 to 128 characters.",
      field: "password",
      message: "Use at least 12 characters; a long passphrase is best.",
    },
    email: {
      summary: "That email address is not valid.",
      field: "email",
      message: "Check the address, e.g. name@example.com",
    },
    email_taken: {
      summary: "That email is already registered.",
      field: "email",
      message: "Already have an account? Sign in instead.",
    },
    phone: {
      summary: "That mobile number is not valid for the selected country.",
      field: "phone",
      message: "Enter the local number without the country code, e.g. 05xxxxxxxx",
    },
    country: {
      summary: "Choose a country from the list.",
      field: "countryCode",
      message: "Supported today: Saudi Arabia, the UAE, and Kuwait.",
    },
    consent: {
      summary: "You must accept the Terms and the Privacy Policy.",
      field: "consent",
      message: "Tick both boxes to continue.",
    },
    csrf: { summary: "The security form expired. Refresh the page and retry." },
    rate: { summary: "Too many attempts. Wait a moment and try again." },
    failed: { summary: "We could not complete registration. Review the details and retry." },
  },
};

export function registerFieldMessages(
  code: string | undefined,
  locale: "ar" | "en",
): RegisterFieldMessages {
  if (!isRegisterErrorCode(code)) return {};
  const entry = copy[locale][code];
  const base: RegisterFieldMessages = { summary: entry.summary };
  if (entry.field === undefined || entry.message === undefined) return base;
  return { ...base, [entry.field]: entry.message };
}

/** The field a screen reader / keyboard user should land on after the summary. */
export function firstErroredField(messages: RegisterFieldMessages): RegisterFieldKey | undefined {
  const order: readonly RegisterFieldKey[] = [
    "displayName",
    "email",
    "countryCode",
    "phone",
    "password",
    "consent",
  ];
  return order.find((key) => messages[key] !== undefined);
}
