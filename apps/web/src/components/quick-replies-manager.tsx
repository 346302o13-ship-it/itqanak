"use client";

import { useEffect, useRef, useState } from "react";

import { CloseIcon } from "./icons";

export interface CustomQuickReply {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

const TITLE_MAX = 80;
const BODY_MAX = 2_000;

export function QuickRepliesManager({
  csrfToken,
  items,
  locale,
  onChange,
  onClose,
}: Readonly<{
  csrfToken: string | undefined;
  items: readonly CustomQuickReply[];
  locale: "ar" | "en";
  onChange: (items: readonly CustomQuickReply[]) => void;
  onClose: () => void;
}>) {
  const english = locale === "en";
  const [list, setList] = useState<readonly CustomQuickReply[]>(items);
  const [editingId, setEditingId] = useState<string>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const push = (next: readonly CustomQuickReply[]) => {
    setList(next);
    onChange(next);
  };

  const reset = () => {
    setEditingId(undefined);
    setTitle("");
    setBody("");
    setError(undefined);
  };

  async function save(): Promise<void> {
    if (csrfToken === undefined || busy) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (trimmedTitle.length === 0 || trimmedBody.length === 0) {
      setError(english ? "Both fields are required." : "الحقلان مطلوبان.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const isEdit = editingId !== undefined;
      const response = await fetch(
        isEdit ? `/api/admin/quick-replies/${editingId}` : "/api/admin/quick-replies",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ csrfToken, title: trimmedTitle, body: trimmedBody }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        item?: CustomQuickReply;
        error?: string;
      };
      if (!response.ok || payload.item === undefined) {
        setError(
          payload.error === "QUICK_REPLY_LIMIT"
            ? english
              ? "You've reached the template limit."
              : "وصلت للحد الأقصى من القوالب."
            : english
              ? "Could not save. Check the fields."
              : "تعذّر الحفظ. راجع الحقول.",
        );
        return;
      }
      const item = payload.item;
      push(isEdit ? list.map((entry) => (entry.id === item.id ? item : entry)) : [...list, item]);
      reset();
    } catch {
      setError(english ? "Could not save." : "تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    if (csrfToken === undefined || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/quick-replies/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken }),
      });
      if (response.ok) {
        push(list.filter((entry) => entry.id !== id));
        if (editingId === id) reset();
      } else {
        setError(english ? "Could not delete." : "تعذّر الحذف.");
      }
    } catch {
      setError(english ? "Could not delete." : "تعذّر الحذف.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[120] grid place-items-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex max-h-[85vh] w-[min(30rem,94vw)] flex-col overflow-hidden rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-[var(--itq-color-border)] px-4 py-3">
          <p className="text-sm font-black">{english ? "Quick reply templates" : "قوالب الردود"}</p>
          <button
            aria-label={english ? "Close" : "إغلاق"}
            className="grid size-8 place-items-center rounded-full text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)]"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <form
            className="grid gap-2 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <input
              aria-label={english ? "Title" : "العنوان"}
              className="rounded-lg border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
              maxLength={TITLE_MAX}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder={english ? "Title (e.g. Welcome)" : "العنوان (مثال: ترحيب)"}
              value={title}
            />
            <textarea
              aria-label={english ? "Message" : "النص"}
              className="min-h-20 resize-none rounded-lg border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--itq-color-brand-500)]"
              dir="auto"
              maxLength={BODY_MAX}
              onChange={(event) => setBody(event.currentTarget.value)}
              placeholder={
                english
                  ? "Reply text. Use {name} for the student's name."
                  : "نص الرد. استخدم {name} لاسم الطالب."
              }
              value={body}
            />
            {error === undefined ? null : (
              <p className="text-xs font-bold text-[var(--itq-color-danger-700)]">{error}</p>
            )}
            <div className="flex items-center justify-end gap-2">
              {editingId === undefined ? null : (
                <button
                  className="rounded-lg px-3 py-1.5 text-xs font-black text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)]"
                  onClick={reset}
                  type="button"
                >
                  {english ? "Cancel" : "إلغاء"}
                </button>
              )}
              <button
                className="rounded-lg bg-[var(--itq-color-brand-700)] px-4 py-1.5 text-xs font-black text-white disabled:opacity-50"
                disabled={busy}
                type="submit"
              >
                {editingId === undefined
                  ? english
                    ? "Add template"
                    : "إضافة قالب"
                  : english
                    ? "Save changes"
                    : "حفظ التعديل"}
              </button>
            </div>
          </form>

          <ul className="mt-3 grid gap-1.5">
            {list.length === 0 ? (
              <li className="rounded-xl border border-dashed border-[var(--itq-color-border)] p-4 text-center text-xs text-[var(--itq-color-muted)]">
                {english ? "No custom templates yet." : "لا توجد قوالب مخصصة بعد."}
              </li>
            ) : (
              list.map((entry) => (
                <li
                  className="rounded-xl border border-[var(--itq-color-border)] p-3"
                  key={entry.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-black">{entry.title}</p>
                    <div className="flex shrink-0 gap-1 text-[10px] font-black">
                      <button
                        className="rounded px-2 py-1 text-[var(--itq-color-brand-strong)] hover:bg-[var(--itq-color-brand-50)]"
                        onClick={() => {
                          setEditingId(entry.id);
                          setTitle(entry.title);
                          setBody(entry.body);
                          setError(undefined);
                        }}
                        type="button"
                      >
                        {english ? "Edit" : "تعديل"}
                      </button>
                      <button
                        className="rounded px-2 py-1 text-[var(--itq-color-danger-700)] hover:bg-[var(--itq-color-danger-50)] disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void remove(entry.id)}
                        type="button"
                      >
                        {english ? "Delete" : "حذف"}
                      </button>
                    </div>
                  </div>
                  <p
                    className="mt-1 line-clamp-2 text-[11px] text-[var(--itq-color-muted)]"
                    dir="auto"
                  >
                    {entry.body}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
