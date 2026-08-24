import { FormAlert } from "./auth-shell";

const successMessages: Readonly<Record<string, string>> = {
  draft_created: "تم إنشاء المسودة. أكمل البيانات وأرفق الملفات ثم أرسل الطلب.",
  draft_exists: "هذه المسودة محفوظة مسبقاً وتم فتحها دون إنشاء نسخة مكررة.",
  saved: "تم حفظ التعديلات.",
  submitted: "تم إرسال الطلب بنجاح.",
  cancelled: "تم إلغاء الطلب.",
  attachment_deleted: "تمت إزالة الملف من الطلب.",
};

const errorMessages: Readonly<Record<string, string>> = {
  invalid: "تعذر قبول البيانات. راجع الحقول ثم أعد المحاولة.",
  csrf: "انتهت صلاحية النموذج. حدّث الصفحة ثم أعد المحاولة.",
  conflict: "تغير الطلب في عملية أخرى. حدّث الصفحة ثم أعد المحاولة.",
  forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  not_found: "تعذر العثور على الطلب أو الملف ضمن حسابك.",
  unavailable: "الخدمة المطلوبة غير متاحة مؤقتاً. حاول لاحقاً.",
  failed: "تعذر إتمام العملية. حاول مجدداً.",
};

const englishSuccessMessages: Readonly<Record<string, string>> = {
  draft_created: "Draft created. Complete the details, add any files, then submit the request.",
  draft_exists: "This draft already existed and was reopened without creating a duplicate.",
  saved: "Your changes were saved.",
  submitted: "Your request was submitted successfully.",
  cancelled: "Your request was cancelled.",
  attachment_deleted: "The file was removed from the request.",
};

const englishErrorMessages: Readonly<Record<string, string>> = {
  invalid: "We could not accept the information. Review the fields and try again.",
  csrf: "The form expired. Refresh the page and try again.",
  conflict: "The request changed elsewhere. Refresh the page and retry.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "We could not find that request or file in your account.",
  unavailable: "The requested service is temporarily unavailable. Please try later.",
  failed: "We could not complete the action. Please try again.",
};

export function RequestFlash({
  status,
  locale = "ar",
}: Readonly<{ status?: string; locale?: "ar" | "en" }>) {
  const successes = locale === "en" ? englishSuccessMessages : successMessages;
  const errors = locale === "en" ? englishErrorMessages : errorMessages;
  const message = status === undefined ? undefined : successes[status];
  if (message !== undefined) {
    return <FormAlert tone="success">{message}</FormAlert>;
  }
  const errorMessage = status === undefined ? undefined : errors[status];
  return errorMessage === undefined ? null : <FormAlert>{errorMessage}</FormAlert>;
}
