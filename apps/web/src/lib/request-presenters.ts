export const requestStatusLabels = {
  DRAFT: "مسودة",
  SUBMITTED: "مُرسل",
  UNDER_REVIEW: "قيد المراجعة",
  WAITING_FOR_STUDENT: "بانتظار ردك",
  QUOTED: "بانتظار الموافقة",
  ACCEPTED: "مقبول",
  IN_PROGRESS: "قيد التنفيذ",
  DELIVERED: "تم التسليم",
  REVISION_REQUESTED: "طُلب تعديل",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
  REJECTED: "مرفوض",
} as const;

export type PresentableRequestStatus = keyof typeof requestStatusLabels;
export type RequestStatusTone = "info" | "success" | "warning";

export const englishRequestStatusLabels: Readonly<Record<PresentableRequestStatus, string>> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  WAITING_FOR_STUDENT: "Waiting for your reply",
  QUOTED: "Awaiting approval",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  DELIVERED: "Delivered",
  REVISION_REQUESTED: "Revision requested",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

export function requestStatusLabel(status: string, locale: "ar" | "en" = "ar"): string {
  if (!Object.hasOwn(requestStatusLabels, status)) {
    return locale === "en" ? "Request status" : "حالة الطلب";
  }
  const normalizedStatus = status as PresentableRequestStatus;
  return locale === "en"
    ? englishRequestStatusLabels[normalizedStatus]
    : requestStatusLabels[normalizedStatus];
}

export function requestStatusTone(status: string): RequestStatusTone {
  if (status === "COMPLETED" || status === "DELIVERED") {
    return "success";
  }
  if (
    status === "WAITING_FOR_STUDENT" ||
    status === "QUOTED" ||
    status === "REVISION_REQUESTED" ||
    status === "CANCELLED" ||
    status === "REJECTED"
  ) {
    return "warning";
  }
  return "info";
}

const requestEventLabels: Readonly<Record<string, string>> = {
  REQUEST_CREATED: "تم إنشاء الطلب",
  REQUEST_UPDATED: "تم تحديث الطلب",
  REQUEST_SUBMITTED: "تم إرسال الطلب",
  REQUEST_CANCELLED: "تم إلغاء الطلب",
  REQUEST_STATUS_CHANGED: "تغيرت حالة الطلب",
  REQUEST_DETAILS_UPDATED: "حدّثت الإدارة تفاصيل الطلب",
  ATTACHMENT_ADDED: "تمت إضافة ملف",
  ATTACHMENT_REMOVED: "تمت إزالة ملف",
  FILE_SCAN_COMPLETED: "اكتمل فحص الملف",
  FILE_SCAN_FAILED: "تعذر فحص الملف",
};

const englishRequestEventLabels: Readonly<Record<string, string>> = {
  REQUEST_CREATED: "Request created",
  REQUEST_UPDATED: "Request updated",
  REQUEST_SUBMITTED: "Request submitted",
  REQUEST_CANCELLED: "Request cancelled",
  REQUEST_STATUS_CHANGED: "Request status changed",
  REQUEST_DETAILS_UPDATED: "Request details updated by the team",
  ATTACHMENT_ADDED: "File added",
  ATTACHMENT_REMOVED: "File removed",
  FILE_SCAN_COMPLETED: "File security scan completed",
  FILE_SCAN_FAILED: "File security scan failed",
};

export function requestEventLabel(eventType: string, locale: "ar" | "en" = "ar"): string {
  return locale === "en"
    ? (englishRequestEventLabels[eventType] ?? "Request history updated")
    : (requestEventLabels[eventType] ?? "تم تحديث سجل الطلب");
}
