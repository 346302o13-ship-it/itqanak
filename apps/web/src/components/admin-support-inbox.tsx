import Link from "next/link";

import type { SupportConversationSummary, SupportMessage } from "@itqanak/requests";

import { MessageIcon } from "./icons";
import { SupportChat } from "./support-chat";

interface AdminSupportInboxProps {
  readonly conversations: readonly SupportConversationSummary[];
  readonly csrfToken: string | undefined;
  readonly locale?: "ar" | "en";
  readonly messages: readonly SupportMessage[];
  readonly search?: string;
  readonly selected?: SupportConversationSummary;
}

export function AdminSupportInbox({
  conversations,
  csrfToken,
  locale = "ar",
  messages,
  search,
  selected,
}: AdminSupportInboxProps) {
  const english = locale === "en";
  const prefix = `/${locale}/admin/support`;
  return (
    <div className="grid min-h-[42rem] overflow-hidden rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="border-b border-[var(--itq-color-border)] bg-[#f8fbfa] lg:border-b-0 lg:border-e">
        <div className="border-b border-[var(--itq-color-border)] p-4">
          <h2 className="font-black">{english ? "Support inbox" : "صندوق محادثات الدعم"}</h2>
          <form action={prefix} className="mt-3" method="get">
            <input
              aria-label={english ? "Search conversations" : "بحث في المحادثات"}
              className="w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-2.5 text-sm"
              defaultValue={search}
              maxLength={100}
              name="q"
              placeholder={english ? "Name or mobile…" : "الاسم أو الجوال…"}
            />
          </form>
        </div>
        <div className="max-h-[36rem] overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--itq-color-muted)]">
              <MessageIcon className="mx-auto size-8" />
              <p className="mt-3 font-bold">
                {english ? "No support conversations yet" : "لا توجد محادثات دعم بعد"}
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === selected?.id;
              const href = `${prefix}?conversation=${encodeURIComponent(conversation.id)}${
                search === undefined ? "" : `&q=${encodeURIComponent(search)}`
              }`;
              return (
                <Link
                  className={`mb-1 block rounded-2xl border p-3 transition ${
                    active
                      ? "border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)]"
                      : "border-transparent hover:bg-white"
                  }`}
                  href={href}
                  key={conversation.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black">{conversation.studentDisplayName}</p>
                      <p
                        className="mt-0.5 truncate text-xs font-bold text-[var(--itq-color-muted)]"
                        dir="ltr"
                      >
                        {conversation.studentPhoneE164}
                      </p>
                    </div>
                    {conversation.unreadCount > 0 ? (
                      <span className="grid min-w-6 place-items-center rounded-full bg-[var(--itq-color-brand-700)] px-1.5 py-1 text-[10px] font-black text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 truncate text-xs text-[var(--itq-color-muted)]" dir="auto">
                    {conversation.lastMessagePreview ??
                      (english ? "No messages yet" : "لا توجد رسائل بعد")}
                  </p>
                </Link>
              );
            })
          )}
        </div>
      </aside>
      <main className="min-w-0 p-3 sm:p-5">
        {selected === undefined ? (
          <div className="grid min-h-[36rem] place-items-center text-center">
            <div>
              <MessageIcon className="mx-auto size-10 text-[var(--itq-color-brand-700)]" />
              <p className="mt-4 font-black">{english ? "Choose a conversation" : "اختر محادثة"}</p>
              <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                {english
                  ? "Open a student from the inbox or student directory."
                  : "افتح طالبًا من الصندوق أو من دليل الطلاب."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <div>
                <p className="font-black">{selected.studentDisplayName}</p>
                <p className="text-xs font-bold text-[var(--itq-color-muted)]" dir="ltr">
                  {selected.studentPhoneE164}
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">
                {english ? "General support" : "دعم عام"}
              </span>
            </div>
            <SupportChat
              conversationId={selected.id}
              csrfToken={csrfToken}
              locale={locale}
              messages={messages}
              mode="admin"
            />
          </>
        )}
      </main>
    </div>
  );
}
