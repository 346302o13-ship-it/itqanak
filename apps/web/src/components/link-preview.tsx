"use client";

import { useEffect, useState } from "react";

interface PreviewData {
  readonly url: string;
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly siteName?: string;
}

const cache = new Map<string, PreviewData | null>();

/** First http(s) URL in a message body, if any. */
export function firstUrl(text: string): string | undefined {
  return /(https?:\/\/[^\s<>"')]+)/iu.exec(text)?.[1];
}

export function LinkPreview({ url, locale }: Readonly<{ url: string; locale: "ar" | "en" }>) {
  const english = locale === "en";
  const [data, setData] = useState<PreviewData | null | undefined>(() => cache.get(url));
  const [imageOk, setImageOk] = useState(true);

  useEffect(() => {
    if (cache.has(url)) {
      setData(cache.get(url));
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
          credentials: "same-origin",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          preview?: PreviewData | null;
        };
        const preview = response.ok ? (payload.preview ?? null) : null;
        cache.set(url, preview);
        if (alive) setData(preview);
      } catch {
        cache.set(url, null);
        if (alive) setData(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  if (data === undefined || data === null) return null;
  let host = "";
  try {
    host = new URL(data.url).host;
  } catch {
    host = "";
  }

  return (
    <a
      className="mt-1.5 flex overflow-hidden rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] no-underline transition hover:bg-[var(--itq-color-surface-soft)]"
      href={data.url}
      rel="noreferrer noopener"
      target="_blank"
    >
      {data.image !== undefined && imageOk ? (
        <img
          alt=""
          className="size-[4.5rem] shrink-0 object-cover"
          loading="lazy"
          onError={() => setImageOk(false)}
          referrerPolicy="no-referrer"
          src={data.image}
        />
      ) : null}
      <span className="min-w-0 flex-1 p-2.5">
        <span className="block text-[10px] font-black uppercase tracking-wide text-[var(--itq-color-muted)]">
          {data.siteName ?? (host.length > 0 ? host : english ? "Link" : "رابط")}
        </span>
        {data.title !== undefined ? (
          <span className="mt-0.5 line-clamp-2 block text-xs font-black text-[var(--itq-color-ink)]">
            {data.title}
          </span>
        ) : null}
        {data.description !== undefined ? (
          <span className="mt-0.5 line-clamp-2 block text-[11px] text-[var(--itq-color-muted)]">
            {data.description}
          </span>
        ) : null}
      </span>
    </a>
  );
}
