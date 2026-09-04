import "server-only";

import type { GeminiFunctionDeclaration, ToolExecutor } from "@itqanak/ai";
import type { AuthenticatedPrincipal } from "@itqanak/auth";
import type { FinanceService } from "@itqanak/finance";
import type { RequestService } from "@itqanak/requests";

/** A signed-in student's chat must never hand back a link to the public
 *  marketing site (they are already inside their own portal) — only their
 *  own student area or account settings. */
export function isAllowedStudentActionHref(href: string): boolean {
  return /^\/(ar|en)\/(student|account)(\/|$)/u.test(href);
}

export function buildStudentSystemInstruction(displayName: string, locale: "ar" | "en"): string {
  const english = locale === "en";
  const lines = english
    ? [
        `You are the ITQANAK assistant inside the student portal, talking with ${displayName}.`,
        "You can see this student's own requests, request statuses, and payment dues through the tools provided — nothing about any other student, ever.",
        "Use get_my_overview for a general status question, get_my_request_detail for one specific request (needs its request number, e.g. ITQ-2026-000019), and get_my_dues for payment/balance questions.",
        "Stay on ITQANAK topics: their requests, dues, how to use the portal, the academic-integrity policy. For anything else, politely say it's outside what you can help with here.",
        "The platform never takes an exam/quiz on a student's behalf, never logs into a student's LMS/account, and never delivers plagiarized work presented as the student's own — say so if asked.",
        "Never invent a request, amount, or status — only state what a tool actually returned.",
        'Formatting: plain text only. You may use **bold** for a label and "- " at the start of a line for a short bullet list — nothing else (no headings, no numbered lists, no tables, no code blocks).',
      ]
    : [
        `أنت مساعد إتقانك داخل بوابة الطالب، وتتحدث مع ${displayName}.`,
        "يمكنك الاطلاع فقط على طلبات هذا الطالب وحالاتها ومستحقاته المالية عبر الأدوات المتاحة — لا شيء يخص أي طالب آخر إطلاقاً.",
        "استخدم get_my_overview لسؤال عام عن الحالة، وget_my_request_detail لطلب محدد (يحتاج رقم الطلب مثل ITQ-2026-000019)، وget_my_dues لأسئلة الدفع والرصيد.",
        "التزم بمواضيع إتقانك: طلباته، مستحقاته، طريقة استخدام البوابة، سياسة النزاهة الأكاديمية. لأي شيء آخر، وضّح بلطف أن هذا خارج ما يمكنك المساعدة به هنا.",
        "المنصة لا تؤدي اختباراً نيابة عن الطالب، ولا تدخل حساب نظام الطالب الدراسي، ولا تسلّم عملاً منتحلاً باعتباره عمل الطالب الأصلي — وضّح ذلك إذا سُئلت.",
        "لا تختلق أبداً طلباً أو مبلغاً أو حالة — اذكر فقط ما أعادته الأداة فعلياً.",
        "التنسيق: نص عادي فقط. يمكنك استخدام **غامق** لتمييز عنصر، و«- » في بداية السطر لقائمة نقطية قصيرة — لا شيء غير ذلك (لا عناوين، لا ترقيم، لا جداول، لا أكواد).",
      ];
  return lines.join("\n");
}

export const studentTools: readonly GeminiFunctionDeclaration[] = [
  {
    name: "get_my_overview",
    description: "Counts of active/waiting/completed requests, plus the 5 most recent ones.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_my_request_detail",
    description: "Full detail (status, timeline, files) for one of the student's own requests.",
    parameters: {
      type: "object",
      properties: {
        requestNumber: { type: "string", description: "e.g. ITQ-2026-000019" },
      },
      required: ["requestNumber"],
    },
  },
  {
    name: "get_my_dues",
    description: "The student's outstanding/paid balance summary, by currency.",
    parameters: { type: "object", properties: {} },
  },
];

export function createStudentToolExecutor(
  requests: RequestService,
  finance: FinanceService,
  principal: AuthenticatedPrincipal,
): ToolExecutor {
  return async (name, args) => {
    switch (name) {
      case "get_my_overview": {
        const dashboard = await requests.getStudentDashboard(principal);
        return {
          activeCount: dashboard.activeCount,
          waitingForStudentCount: dashboard.waitingForStudentCount,
          completedCount: dashboard.completedCount,
          recent: dashboard.recent.map((item) => ({
            requestNumber: item.requestNumber,
            title: item.title,
            status: item.status,
          })),
        };
      }
      case "get_my_request_detail": {
        const requestNumber = typeof args.requestNumber === "string" ? args.requestNumber : "";
        if (requestNumber.trim().length === 0) return { error: "missing_request_number" };
        try {
          const detail = await requests.getStudentRequest(principal, requestNumber);
          return {
            requestNumber: detail.requestNumber,
            title: detail.title,
            status: detail.status,
            ...(detail.deadlineAt === undefined
              ? {}
              : { deadlineAt: detail.deadlineAt.toISOString() }),
            createdAt: detail.createdAt.toISOString(),
            updatedAt: detail.updatedAt.toISOString(),
          };
        } catch {
          return { error: "request_not_found" };
        }
      }
      case "get_my_dues": {
        const report = await finance.getStudentReport(principal);
        return {
          totals: report.totals.map((total) => ({
            currency: total.currency,
            unpaidCount: total.unpaidCount,
            unpaidAmount: total.unpaidAmountMinor / 10 ** total.minorUnit,
            paidAmount: total.paidAmountMinor / 10 ** total.minorUnit,
          })),
        };
      }
      default:
        return { error: "unknown_tool" };
    }
  };
}
