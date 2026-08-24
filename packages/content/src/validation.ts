import {
  ContentBlockError,
  contentTargets,
  contentVariants,
  type ContentBlockFields,
  type ContentTarget,
  type ContentVariant,
} from "./types.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalizeText(
  value: string,
  minimum: number,
  maximum: number,
  code: "INVALID_TITLE" | "INVALID_BODY",
): string {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ContentBlockError(code);
  }
  return normalized;
}

function normalizeActionText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 80) {
    throw new ContentBlockError("INVALID_ACTION");
  }
  return normalized;
}

export function assertContentBlockId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new ContentBlockError("INVALID_ID");
  return normalized;
}

export function assertContentTarget(value: string): ContentTarget {
  if (!(contentTargets as readonly string[]).includes(value)) {
    throw new ContentBlockError("INVALID_TARGET");
  }
  return value as ContentTarget;
}

export function assertContentVariant(value: string): ContentVariant {
  if (!(contentVariants as readonly string[]).includes(value)) {
    throw new ContentBlockError("INVALID_VARIANT");
  }
  return value as ContentVariant;
}

export function assertContentVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ContentBlockError("INVALID_VERSION");
  }
  return value;
}

export function normalizeContentBlockFields(input: ContentBlockFields): ContentBlockFields {
  const slug = input.slug.trim().toLowerCase();
  if (!slugPattern.test(slug) || slug.length < 2 || slug.length > 80) {
    throw new ContentBlockError("INVALID_SLUG");
  }
  const sortOrder = input.sortOrder;
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 100_000) {
    throw new ContentBlockError("INVALID_SORT_ORDER");
  }

  const actionLabelAr = normalizeActionText(input.actionLabelAr);
  const actionLabelEn = normalizeActionText(input.actionLabelEn);
  let actionHref = input.actionHref?.trim() ?? null;
  if (actionHref === "") actionHref = null;
  const actionFields = [actionLabelAr, actionLabelEn, actionHref];
  if (
    actionFields.some((value) => value === null) &&
    actionFields.some((value) => value !== null)
  ) {
    throw new ContentBlockError("INVALID_ACTION");
  }
  if (actionHref !== null) {
    if (actionHref.length > 1000) throw new ContentBlockError("INVALID_ACTION");
    if (actionHref.startsWith("/")) {
      if (
        actionHref.startsWith("//") ||
        !/^\/[A-Za-z0-9][A-Za-z0-9_./?%&=#-]*$/u.test(actionHref)
      ) {
        throw new ContentBlockError("INVALID_ACTION");
      }
    } else {
      try {
        const parsed = new URL(actionHref);
        if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
          throw new ContentBlockError("INVALID_ACTION");
        }
      } catch (error: unknown) {
        if (error instanceof ContentBlockError) throw error;
        throw new ContentBlockError("INVALID_ACTION");
      }
    }
  }

  return {
    slug,
    target: assertContentTarget(input.target),
    variant: assertContentVariant(input.variant),
    titleAr: normalizeText(input.titleAr, 2, 160, "INVALID_TITLE"),
    titleEn: normalizeText(input.titleEn, 2, 160, "INVALID_TITLE"),
    bodyAr: normalizeText(input.bodyAr, 2, 4000, "INVALID_BODY"),
    bodyEn: normalizeText(input.bodyEn, 2, 4000, "INVALID_BODY"),
    actionLabelAr,
    actionLabelEn,
    actionHref,
    active: input.active,
    sortOrder,
  };
}
