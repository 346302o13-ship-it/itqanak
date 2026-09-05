"use client";

/**
 * Unsent-message drafts, kept per-viewer in localStorage — never sent
 * anywhere, never shared between the student and the admin looking at the
 * same conversation. A draft is a convenience, never worth surfacing an
 * error for, so every access is wrapped: storage can throw in private
 * browsing, when disabled, or over quota.
 */
export function draftStorageKey(kind: string, id: string): string {
  return `itq-draft:${kind}:${id}`;
}

export function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeDraft(key: string, value: string): void {
  try {
    if (value.trim().length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignored — see file comment.
  }
}
