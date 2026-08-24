import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { LocalDateTime } from "@/components/local-date-time";
import { MessageIcon, SearchIcon, VerifiedIcon } from "@/components/icons";
import { RequestStatusChip } from "@/components/request-status-chip";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

interface RequestsPageProps {
  readonly searchParams: Promise<{ readonly q?: string | readonly string[] }>;
}

export const metadata = { title: "الطلبات والمحادثات" };
export const dynamic = "force-dynamic";

export default async function AdminRequestsPage({ searchParams }: RequestsPageProps) {
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const [principal, csrfToken] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/requests"),
    csrfTokenForPage(),
  ]);
  const runtime = await createStudentRequestRuntime();
  let conversations;
  try {
    conversations = await runtime.chat.listConversations(principal, {
      page: 1,
      pageSize: 50,
      ...(search.length === 0 ? {} : { search }),
    });
  } finally {
    await runtime.close();
  }
  return (
    <AdminShell csrfToken={csrfToken} displayName={principal.displayName}>
      <section className="overflow-hidden rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white shadow-[var(--itq-shadow-sm)]">
        <header className="border-b border-[var(--itq-color-border)] p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black text-[var(--itq-color-brand-700)]">صندوق العمل</p>
              <h1 className="mt-1 text-3xl font-black">الطلبات والمحادثات</h1>
              <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                اختر طالباً لمراجعة الطلب والرد وتغيير حالته.
              </p>
            </div>
            <span className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700">
              {new Intl.NumberFormat("ar-SA").format(
                conversations.items.reduce((total, item) => total + item.unreadCount, 0),
              )}{" "}
              غير مقروءة
            </span>
          </div>
          <form className="relative mt-6" method="get">
            <SearchIcon className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-[var(--itq-color-muted)]" />
            <input
              className="h-12 w-full rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] px-4 pe-12 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
              defaultValue={search}
              name="q"
              placeholder="ابحث بالاسم أو رقم الطلب أو العنوان…"
              type="search"
            />
          </form>
        </header>
        <div className="grid gap-2 p-3 sm:p-5">
          {conversations.items.length === 0 ? (
            <div className="grid place-items-center py-20 text-center">
              <MessageIcon className="size-10 text-[var(--itq-color-brand-300)]" />
              <p className="mt-4 font-black">لا توجد محادثات مطابقة</p>
            </div>
          ) : (
            conversations.items.map((item) => (
              <Link
                className="grid items-center gap-4 rounded-2xl border border-transparent p-4 transition hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)] sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                href={`/ar/admin/requests/${encodeURIComponent(item.requestNumber)}`}
                key={item.id}
              >
                <span className="relative grid size-12 place-items-center rounded-2xl bg-[#112c38] font-black text-white">
                  {item.studentDisplayName.trim().slice(0, 1) || "ط"}
                  {item.unreadCount > 0 ? (
                    <span className="absolute -end-1 -top-1 grid size-6 place-items-center rounded-full bg-red-500 text-[10px] ring-2 ring-white">
                      {item.unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="truncate">{item.studentDisplayName}</strong>
                    {item.assignedAdminDisplayName !== undefined ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">
                        <VerifiedIcon className="size-3" /> {item.assignedAdminDisplayName}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">
                        غير مسند
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-sm font-bold" dir="auto">
                    {item.lastMessagePreview ?? item.requestTitle ?? "لا رسائل بعد"}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--itq-color-muted)]">
                    {item.studentPhoneE164 === undefined ? null : (
                      <>
                        <bdi dir="ltr">{item.studentPhoneE164}</bdi>
                        <span aria-hidden="true"> · </span>
                      </>
                    )}
                    <bdi dir="ltr">{item.requestNumber}</bdi>
                  </span>
                </span>
                <span className="flex items-center gap-3 sm:block sm:text-end">
                  <RequestStatusChip status={item.requestStatus} />
                  {item.lastMessageAt === undefined ? null : (
                    <span className="mt-2 block text-[10px] font-semibold text-[var(--itq-color-muted)]">
                      <LocalDateTime value={item.lastMessageAt.toISOString()} />
                    </span>
                  )}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </AdminShell>
  );
}
