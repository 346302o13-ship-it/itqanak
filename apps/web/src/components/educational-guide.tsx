"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type JSX } from "react";

import { CloseIcon, MessageIcon, SendIcon, ShieldCheckIcon, WhatsAppIcon } from "./icons";
import {
  educationalGuideSupportHref,
  educationalGuideTopics,
  findEducationalGuideAnswer,
  type EducationalGuideAnswer,
  type EducationalGuideAudience,
  type EducationalGuideLocale,
} from "@/lib/educational-guide";

interface EducationalGuideProps {
  readonly locale?: EducationalGuideLocale;
  readonly audience?: EducationalGuideAudience;
}

interface GuideMessage {
  readonly id: number;
  readonly question: string;
  readonly answer: EducationalGuideAnswer | undefined;
}

export function EducationalGuide({
  audience = "public",
  locale = "ar",
}: EducationalGuideProps): JSX.Element {
  const english = locale === "en";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<readonly GuideMessage[]>([]);
  const nextMessageId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();
  const topics = educationalGuideTopics(locale, audience);
  const supportHref = educationalGuideSupportHref(locale);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    inputRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  const answerQuestion = (question: string) => {
    const cleanQuestion = question
      .replace(/[\r\n\t]+/gu, " ")
      .trim()
      .slice(0, 240);
    if (cleanQuestion.length < 2) {
      return;
    }

    const answer = findEducationalGuideAnswer(locale, audience, cleanQuestion);
    setMessages((current) => [
      ...current.slice(-3),
      { id: nextMessageId.current++, question: cleanQuestion, answer },
    ]);
    setQuery("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    answerQuestion(query);
  };

  const panelPosition =
    audience === "student" ? "bottom-40 sm:bottom-20 lg:bottom-20" : "bottom-20 sm:bottom-24";
  const triggerPosition = audience === "student" ? "bottom-24 lg:bottom-6" : "bottom-4 sm:bottom-6";

  return (
    <div dir={english ? "ltr" : "rtl"} lang={locale}>
      {open ? (
        <section
          aria-labelledby={titleId}
          aria-modal="false"
          className={`fixed inset-x-3 ${panelPosition} z-[70] flex max-h-[min(39rem,calc(100dvh-11rem))] flex-col overflow-hidden rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-[0_28px_90px_rgba(11,38,46,0.24)] sm:inset-x-auto sm:end-6 sm:w-[27rem]`}
          id={panelId}
          role="dialog"
        >
          <header className="relative overflow-hidden bg-[var(--itq-color-brand-900)] px-5 pb-5 pt-4 text-white">
            <div
              aria-hidden="true"
              className="absolute -end-8 -top-12 size-36 rounded-full bg-[var(--itq-color-brand-600)]/35 blur-2xl"
            />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-[var(--itq-color-accent-200)] ring-1 ring-white/15">
                  <MessageIcon className="size-5" />
                </span>
                <div>
                  <h2 className="font-black" id={titleId}>
                    {english ? "ITQANAK Learning Guide" : "مرشد إتقانك التعليمي"}
                  </h2>
                  <p className="mt-1 text-[11px] font-bold text-white/65">
                    {english ? "Curated platform guidance" : "إرشادات موثوقة داخل المنصة"}
                  </p>
                </div>
              </div>
              <button
                aria-label={english ? "Close learning guide" : "إغلاق المرشد التعليمي"}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                type="button"
              >
                <CloseIcon className="size-5" />
              </button>
            </div>
            <div className="relative mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold leading-5 text-white/75 ring-1 ring-white/10">
              <ShieldCheckIcon className="size-4 shrink-0 text-[var(--itq-color-success-600)]" />
              {english
                ? "Your question is matched on this device and is not sent to an external service."
                : "تتم مطابقة سؤالك على جهازك ولا يُرسل إلى أي خدمة خارجية."}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto bg-[var(--itq-color-surface-soft)] p-4 [scrollbar-width:thin]">
            <div className="rounded-2xl rounded-ss-md border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4 shadow-sm">
              <p className="text-sm font-extrabold leading-7">
                {english
                  ? "Welcome. Choose a topic or type a short question about services, requests, verification, files, or responsible learning."
                  : "أهلاً بك. اختر موضوعاً أو اكتب سؤالاً قصيراً عن الخدمات أو الطلبات أو التوثيق أو الملفات أو التعلم المسؤول."}
              </p>
            </div>

            {messages.length === 0 ? (
              <div
                aria-label={english ? "Suggested topics" : "موضوعات مقترحة"}
                className="mt-4 grid grid-cols-2 gap-2"
              >
                {topics.map((topic) => (
                  <button
                    className="min-h-14 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-2 text-start text-xs font-black leading-5 text-[var(--itq-color-ink-soft)] shadow-sm transition hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--itq-color-brand-600)]"
                    key={topic.id}
                    onClick={() => answerQuestion(topic.title)}
                    type="button"
                  >
                    {topic.title}
                  </button>
                ))}
              </div>
            ) : null}

            <div aria-live="polite" className="mt-4 grid gap-4" role="log">
              {messages.map((message) => (
                <div className="grid gap-2" key={message.id}>
                  <p className="ms-auto max-w-[88%] rounded-2xl rounded-se-md bg-[var(--itq-color-brand-700)] px-4 py-2.5 text-sm font-bold leading-6 text-white">
                    {message.question}
                  </p>
                  {message.answer === undefined ? (
                    <div className="max-w-[94%] rounded-2xl rounded-ss-md border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4 shadow-sm">
                      <p className="text-sm font-bold leading-7">
                        {english
                          ? "I do not have a sufficiently precise saved answer for that question. Support can help without sending your typed question automatically."
                          : "لا توجد لدي إجابة محفوظة ودقيقة بما يكفي لهذا السؤال. يستطيع الدعم مساعدتك دون إرسال سؤالك المكتوب تلقائياً."}
                      </p>
                      <a
                        className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--itq-color-whatsapp-600)] px-4 py-2 text-xs font-black text-white transition hover:bg-[var(--itq-color-whatsapp-700)]"
                        href={supportHref}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <WhatsAppIcon className="size-4" />
                        {english ? "Ask support on WhatsApp" : "اسأل الدعم عبر واتساب"}
                      </a>
                    </div>
                  ) : (
                    <article className="max-w-[94%] rounded-2xl rounded-ss-md border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4 shadow-sm">
                      <h3 className="text-sm font-black text-[var(--itq-color-brand-strong)]">
                        {message.answer.title}
                      </h3>
                      <p className="mt-2 text-sm font-semibold leading-7 text-[var(--itq-color-ink-soft)]">
                        {message.answer.summary}
                      </p>
                      {message.answer.steps === undefined ? null : (
                        <ol className="mt-3 grid gap-2 text-xs font-semibold leading-6 text-[var(--itq-color-muted)]">
                          {message.answer.steps.map((step, index) => (
                            <li className="flex gap-2" key={step}>
                              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--itq-color-brand-50)] text-[10px] font-black text-[var(--itq-color-brand-strong)]">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {message.answer.action === undefined ? null : (
                        <a
                          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-[var(--itq-color-brand-50)] px-4 py-2 text-xs font-black text-[var(--itq-color-brand-strong)] transition hover:bg-[var(--itq-color-brand-100)]"
                          href={message.answer.action.href}
                          rel={message.answer.action.external === true ? "noreferrer" : undefined}
                          target={message.answer.action.external === true ? "_blank" : undefined}
                        >
                          {message.answer.action.label}
                        </a>
                      )}
                    </article>
                  )}
                </div>
              ))}
            </div>
          </div>

          <form
            className="border-t border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3"
            onSubmit={handleSubmit}
          >
            <label className="sr-only" htmlFor={`${panelId}-question`}>
              {english ? "Your question" : "سؤالك"}
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] p-1.5 focus-within:border-[var(--itq-color-brand-500)] focus-within:ring-2 focus-within:ring-[var(--itq-color-brand-100)]">
              <input
                className="min-h-10 min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold outline-none placeholder:text-[var(--itq-color-muted)]"
                id={`${panelId}-question`}
                maxLength={240}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={english ? "Type a short question…" : "اكتب سؤالاً قصيراً…"}
                ref={inputRef}
                type="text"
                value={query}
              />
              <button
                aria-label={english ? "Find an answer" : "ابحث عن إجابة"}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-brand-700)] text-white transition hover:bg-[var(--itq-color-brand-800)] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={query.trim().length < 2}
                type="submit"
              >
                <SendIcon className={`size-4 ${english ? "" : "rotate-180"}`} />
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={
          open
            ? english
              ? "Close learning guide"
              : "إغلاق المرشد التعليمي"
            : english
              ? "Open learning guide"
              : "فتح المرشد التعليمي"
        }
        className={`fixed end-4 ${triggerPosition} z-[71] inline-flex min-h-14 items-center gap-3 rounded-full border border-white/20 bg-[var(--itq-color-brand-800)] px-4 text-white shadow-[var(--itq-shadow-float)] transition hover:-translate-y-0.5 hover:bg-[var(--itq-color-brand-900)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--itq-color-brand-600)] sm:end-6`}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="grid size-9 place-items-center rounded-full bg-white/10">
          {open ? <CloseIcon className="size-5" /> : <MessageIcon className="size-5" />}
        </span>
        <span className="hidden pe-1 text-sm font-black sm:inline">
          {english ? "Learning guide" : "المرشد التعليمي"}
        </span>
      </button>
    </div>
  );
}
