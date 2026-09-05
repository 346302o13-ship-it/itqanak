import "server-only";

export interface LinkPreviewData {
  readonly url: string;
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly siteName?: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#0*39;|&apos;/gu, "'")
    .replace(/&nbsp;/gu, " ")
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/gu, (_, dec: string) => String.fromCodePoint(Number(dec)));
}

function clean(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  const text = decodeEntities(value).replace(/\s+/gu, " ").trim();
  if (text.length === 0) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Pull `content` from the first `<meta>` whose property/name matches any key. */
function metaContent(html: string, keys: readonly string[]): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    const tag = match[0];
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1]?.toLowerCase();
    if (key === undefined || !keys.includes(key)) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/iu.exec(tag)?.[1];
    if (content !== undefined && content.trim().length > 0) return content;
  }
  return undefined;
}

export function parseLinkPreview(
  html: string,
  finalUrl: string,
  originalUrl: string,
): LinkPreviewData {
  const head = html.slice(0, 200_000);
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(head)?.[1];
  const title =
    clean(metaContent(head, ["og:title", "twitter:title"]), 140) ?? clean(titleTag, 140);
  const description = clean(
    metaContent(head, ["og:description", "twitter:description", "description"]),
    280,
  );
  const siteName = clean(metaContent(head, ["og:site_name"]), 60);

  let image: string | undefined;
  const rawImage = metaContent(head, ["og:image", "og:image:secure_url", "twitter:image"]);
  if (rawImage !== undefined) {
    try {
      const resolved = new URL(decodeEntities(rawImage).trim(), finalUrl);
      // Only surface an https image; the browser loads it directly, and a
      // non-https or odd-scheme image is not worth the mixed-content noise.
      if (resolved.protocol === "https:") image = resolved.toString();
    } catch {
      image = undefined;
    }
  }

  return {
    url: originalUrl,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(image === undefined ? {} : { image }),
    ...(siteName === undefined ? {} : { siteName }),
  };
}
