import Link from "next/link";
import { notFound } from "next/navigation";

import { RequestDomainError, type RequestAttachmentSummary } from "@itqanak/requests";

import { AttachmentUpload } from "@/components/attachment-upload";
import { CsrfInput } from "@/components/auth-shell";
import { LocalDateTime } from "@/components/local-date-time";
import { RequestFields } from "@/components/request-fields";
import { RequestFlash } from "@/components/request-flash";
import { RequestStatusChip } from "@/components/request-status-chip";
import { RequestTimeline } from "@/components/request-timeline";
import { StudentShell } from "@/components/student-shell";
import { SubmitButton } from "@/components/submit-button";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

interface RequestDetailPageProps {
  readonly params: Promise<{ readonly requestNumber: string }>;
  readonly searchParams: Promise<{
    readonly status?: string | readonly string[];
    readonly notice?: string | readonly string[];
  }>;
}

const attachmentStatusLabels: Readonly<Record<RequestAttachmentSummary["scanStatus"], string>> = {
  NOT_REQUIRED: "لم يبدأ الفحص",
  PENDING_SCAN: "بانتظار الفحص الأمني",
  CLEAN: "تم الفحص — آمن",
  INFECTED: "مرفوض أمنياً",
  SCAN_ERROR: "تعذر الفحص",
  SCAN_SKIPPED_DEVELOPMENT: "لم يُفحص — بيئة تطوير",
  SCAN_SKIPPED_BY_ADMIN: "غير مفحوص — الفحص معطّل من الإدارة",
  REJECTED: "مرفوض",
};

function fileSize(bytes: number): string {
  return `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(
    bytes / (1024 * 1024),
  )} م.ب`;
}

function attachmentStateLabel(attachment: RequestAttachmentSummary): string {
  if (attachment.scanStatus === "INFECTED") {
    return "مرفوض أمنياً — أزل الملف واستبدله";
  }
  if (attachment.storageStatus === "PENDING_UPLOAD") {
    return "جارٍ استكمال الرفع";
  }
  if (attachment.storageStatus === "UPLOAD_FAILED") {
    return "فشل تخزين الملف";
  }
  if (attachment.storageStatus === "DELETE_PENDING") {
    return "جارٍ حذف الملف من التخزين";
  }
  if (attachment.storageStatus === "DELETED") {
    return "تم حذف الملف";
  }
  return attachmentStatusLabels[attachment.scanStatus];
}

function optionalValue(value: string | undefined): string {
  return value === undefined || value.length === 0 ? "غير محدد" : value;
}

export const metadata = { title: "تفاصيل الطلب" };
export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params, searchParams }: RequestDetailPageProps) {
  const [{ requestNumber }, query] = await Promise.all([params, searchParams]);
  const principal = await requireStudentPagePrincipal(
    `/ar/student/requests/${encodeURIComponent(requestNumber)}`,
    "requests.read.own",
  );
  const csrfToken = await csrfTokenForPage();
  const runtime = await createStudentRequestRuntime();
  let detail;
  let service;
  let maximumFileBytes;
  let development;
  let integrityVersion;
  try {
    try {
      detail = await runtime.requests.getStudentRequest(principal, requestNumber);
    } catch (error: unknown) {
      if (error instanceof RequestDomainError && error.code === "REQUEST_NOT_FOUND") {
        notFound();
      }
      throw error;
    }
    service = await runtime.catalog.getServiceByIdForRequest(detail.serviceId);
    maximumFileBytes = Math.min(
      runtime.config.storage.maxFileBytes,
      service?.maxFileSizeBytes ?? runtime.config.storage.maxFileBytes,
    );
    development = runtime.config.nodeEnv !== "production";
    integrityVersion = runtime.config.academicIntegrityVersion;
  } finally {
    await runtime.close();
  }

  const status = typeof query.status === "string" ? query.status : undefined;
  const notice = typeof query.notice === "string" ? query.notice : status;
  const editable = detail.status === "DRAFT";
  const attachmentsEditable = detail.status === "DRAFT" || detail.status === "SUBMITTED";
  const cancellable = detail.status === "DRAFT" || detail.status === "SUBMITTED";
  const acceptsFiles = service?.acceptsFiles === true;

  return (
    <StudentShell csrfToken={csrfToken} displayName={principal.displayName}>
      <RequestFlash {...(notice === undefined ? {} : { status: notice })} />
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link
            className="text-sm font-bold text-[var(--itq-color-brand-700)] underline"
            href="/ar/student/requests"
          >
            العودة إلى طلباتي
          </Link>
          <h1 className="mt-4 text-3xl font-black">{detail.title || "مسودة بلا عنوان"}</h1>
          <p className="mt-2 font-bold text-[var(--itq-color-muted)]" dir="ltr">
            {detail.requestNumber}
          </p>
        </div>
        <RequestStatusChip status={detail.status} />
      </div>

      <dl className="mt-7 grid gap-4 rounded-2xl bg-[var(--itq-color-brand-50)] p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">الخدمة</dt>
          <dd className="mt-1 font-black">{detail.serviceNameAr}</dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">تاريخ الإنشاء</dt>
          <dd className="mt-1 font-black">
            <LocalDateTime value={detail.createdAt.toISOString()} />
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">آخر تحديث</dt>
          <dd className="mt-1 font-black">
            <LocalDateTime value={detail.updatedAt.toISOString()} />
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">الموعد النهائي</dt>
          <dd className="mt-1 font-black">
            {detail.deadlineAt === undefined ? (
              "غير محدد"
            ) : (
              <LocalDateTime value={detail.deadlineAt.toISOString()} />
            )}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--itq-color-muted)]">الاستعجال</dt>
          <dd className="mt-1 font-black">{detail.urgency === "URGENT" ? "عاجل" : "عادي"}</dd>
        </div>
      </dl>

      {!editable ? (
        <section className="mt-9" aria-labelledby="request-description-title">
          <h2 className="text-xl font-black" id="request-description-title">
            تفاصيل الطلب
          </h2>
          <p className="mt-4 whitespace-pre-wrap leading-8">
            {detail.description || "لا يوجد وصف."}
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-bold text-[var(--itq-color-muted)]">اللغة</dt>
              <dd className="mt-1">{optionalValue(detail.languageCode)}</dd>
            </div>
            <div>
              <dt className="font-bold text-[var(--itq-color-muted)]">المستوى الدراسي</dt>
              <dd className="mt-1">{optionalValue(detail.academicLevel)}</dd>
            </div>
            <div>
              <dt className="font-bold text-[var(--itq-color-muted)]">المؤسسة</dt>
              <dd className="mt-1">{optionalValue(detail.institutionName)}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <section className="mt-9" aria-labelledby="edit-request-title">
          <h2 className="text-xl font-black" id="edit-request-title">
            تعديل المسودة
          </h2>
          <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
            الخدمة ثابتة لهذه المسودة. أنشئ مسودة أخرى إذا أردت خدمة مختلفة.
          </p>
          <form
            action={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}`}
            className="mt-6 grid gap-6"
            method="post"
          >
            <CsrfInput token={csrfToken} />
            <input name="version" type="hidden" value={detail.version} />
            <RequestFields
              defaults={{
                title: detail.title,
                description: detail.description,
                ...(detail.deadlineAt === undefined
                  ? {}
                  : { deadlineIso: detail.deadlineAt.toISOString() }),
                urgency: detail.urgency,
                ...(detail.languageCode === undefined ? {} : { languageCode: detail.languageCode }),
                ...(detail.academicLevel === undefined
                  ? {}
                  : { academicLevel: detail.academicLevel }),
                ...(detail.institutionName === undefined
                  ? {}
                  : { institutionName: detail.institutionName }),
                privacyRequested: detail.privacyRequested,
              }}
            />
            <SubmitButton pendingLabel="جارٍ الحفظ…">حفظ التعديلات</SubmitButton>
          </form>
        </section>
      )}

      <div className="mt-10">
        <section className="rounded-[1.5rem] border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
          <div>
            <h2 className="text-lg font-black">المحادثة الموحدة مع الدعم</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
              الرسائل والملفات وتحديثات جميع طلباتك موجودة في محادثة واحدة. سيفتح هذا الطلب مرتبطًا
              بالرسالة التالية.
            </p>
          </div>
          <Link
            className="mt-4 inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[var(--itq-color-brand-700)] px-5 text-sm font-black text-white no-underline sm:mt-0"
            href={`/ar/student/support?request=${encodeURIComponent(detail.id)}`}
          >
            فتح المحادثة
          </Link>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="attachments-title">
        <h2 className="text-xl font-black" id="attachments-title">
          الملفات
        </h2>
        {detail.attachments.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--itq-color-muted)]">لا توجد ملفات مرفقة.</p>
        ) : (
          <ul className="mt-5 grid gap-3">
            {detail.attachments.map((attachment) => {
              const canDownload =
                attachment.storageStatus === "STORED" &&
                (attachment.scanStatus === "CLEAN" ||
                  attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
                  (development && attachment.scanStatus === "SCAN_SKIPPED_DEVELOPMENT"));
              return (
                <li
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--itq-color-border)] p-4"
                  key={attachment.id}
                >
                  <span>
                    <span className="block font-black">{attachment.originalFilename}</span>
                    <span className="mt-1 block text-xs text-[var(--itq-color-muted)]">
                      {fileSize(attachment.sizeBytes)} — {attachmentStateLabel(attachment)}
                    </span>
                    {attachment.scanStatus === "SCAN_SKIPPED_DEVELOPMENT" ? (
                      <span className="mt-2 block text-xs font-bold text-amber-800">
                        تحذير: هذا الملف لم يخضع لفحص البرمجيات الضارة لأن البيئة تطويرية.
                      </span>
                    ) : null}
                    {attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ? (
                      <span className="mt-2 block text-xs font-bold text-amber-800">
                        تحذير: لم يُفحص هذا الملف بحثًا عن برمجيات ضارة. نزّله فقط إذا كنت تثق
                        بالمرسل، ولن تتم معاينته داخل المنصة.
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {canDownload ? (
                      <a
                        className="rounded-xl border border-[var(--itq-color-border)] px-4 py-2 text-sm font-black"
                        href={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/attachments/${encodeURIComponent(attachment.id)}/download`}
                      >
                        تنزيل
                      </a>
                    ) : null}
                    {attachmentsEditable ? (
                      <form
                        action={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/attachments/${encodeURIComponent(attachment.id)}/delete`}
                        method="post"
                      >
                        <CsrfInput token={csrfToken} />
                        <input name="version" type="hidden" value={detail.version} />
                        <SubmitButton pendingLabel="جارٍ الإزالة…">إزالة</SubmitButton>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {attachmentsEditable && acceptsFiles ? (
          <div className="mt-6">
            <AttachmentUpload
              csrfToken={csrfToken}
              maximumBytes={maximumFileBytes}
              requestNumber={detail.requestNumber}
              requestVersion={detail.version}
            />
          </div>
        ) : null}
      </section>

      {editable ? (
        <section
          className="mt-10 rounded-2xl border border-[var(--itq-color-border)] p-5"
          aria-labelledby="submit-title"
        >
          <h2 className="text-xl font-black" id="submit-title">
            إرسال الطلب
          </h2>
          <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
            تأكد من حفظ آخر تعديلاتك أولاً. بعد الإرسال لن تكون حقول الطلب قابلة للتعديل في هذه
            المرحلة.
          </p>
          <form
            action={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/submit`}
            className="mt-5 grid gap-4"
            method="post"
          >
            <CsrfInput token={csrfToken} />
            <input name="version" type="hidden" value={detail.version} />
            <input name="academicIntegrityVersion" type="hidden" value={integrityVersion} />
            <label className="flex items-start gap-3 rounded-xl bg-[var(--itq-color-brand-50)] p-4 text-sm font-semibold leading-7">
              <input
                className="mt-1 size-4"
                name="acceptedAcademicIntegrity"
                required
                type="checkbox"
                value="true"
              />
              أقر بأن الطلب ملتزم بسياسة النزاهة الأكاديمية الحالية ({integrityVersion})، وأن الخدمة
              لن تُستخدم للغش أو انتحال العمل الأكاديمي.
            </label>
            <SubmitButton pendingLabel="جارٍ إرسال الطلب…">إرسال الطلب الآن</SubmitButton>
          </form>
        </section>
      ) : null}

      {cancellable ? (
        <section className="mt-8 border-t border-[var(--itq-color-border)] pt-6">
          <form
            action={`/api/student/requests/${encodeURIComponent(detail.requestNumber)}/cancel`}
            method="post"
          >
            <CsrfInput token={csrfToken} />
            <input name="version" type="hidden" value={detail.version} />
            <SubmitButton pendingLabel="جارٍ الإلغاء…">إلغاء الطلب</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-[var(--itq-color-muted)]">
            الإلغاء نهائي، ويُرفض تلقائياً إذا بدأ تنفيذ الطلب أو تغيّرت حالته.
          </p>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="timeline-title">
        <h2 className="text-xl font-black" id="timeline-title">
          سجل التحديثات
        </h2>
        <div className="mt-5">
          <RequestTimeline entries={detail.events} />
        </div>
      </section>
    </StudentShell>
  );
}
