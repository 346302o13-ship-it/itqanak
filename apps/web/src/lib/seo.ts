import type { Metadata } from "next";

const fallbackPublicUrl = "http://127.0.0.1:8080";

/**
 * Builds a metadata origin without evaluating the full application config at
 * build time. Paths, credentials, queries, and fragments are deliberately
 * discarded because canonical metadata must remain on the public origin.
 */
export function publicMetadataBase(value = process.env.PUBLIC_APP_URL): URL {
  try {
    const candidate = new URL(value ?? fallbackPublicUrl);
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return new URL(fallbackPublicUrl);
    }
    return new URL(`${candidate.origin}/`);
  } catch {
    return new URL(fallbackPublicUrl);
  }
}

export const privateSectionMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};
