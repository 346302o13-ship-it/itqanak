export const contentTargets = ["LANDING", "STUDENT_DASHBOARD"] as const;
export type ContentTarget = (typeof contentTargets)[number];

export const contentVariants = ["INFO", "HIGHLIGHT", "ANNOUNCEMENT", "ACTION"] as const;
export type ContentVariant = (typeof contentVariants)[number];

export interface ContentBlockFields {
  readonly slug: string;
  readonly target: ContentTarget;
  readonly variant: ContentVariant;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly bodyAr: string;
  readonly bodyEn: string;
  readonly actionLabelAr: string | null;
  readonly actionLabelEn: string | null;
  readonly actionHref: string | null;
  readonly active: boolean;
  readonly sortOrder: number;
}

export interface ContentBlock extends ContentBlockFields {
  readonly id: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type CreateContentBlockInput = ContentBlockFields;

export interface UpdateContentBlockInput extends ContentBlockFields {
  readonly expectedVersion: number;
}

export interface SetContentBlockVisibilityInput {
  readonly active: boolean;
  readonly expectedVersion: number;
}

export interface DeleteContentBlockInput {
  readonly expectedVersion: number;
}

export const contentBlockErrorCodes = [
  "INVALID_ID",
  "INVALID_SLUG",
  "INVALID_TARGET",
  "INVALID_VARIANT",
  "INVALID_TITLE",
  "INVALID_BODY",
  "INVALID_ACTION",
  "INVALID_SORT_ORDER",
  "INVALID_VERSION",
  "CONTENT_NOT_FOUND",
  "VERSION_CONFLICT",
  "SLUG_CONFLICT",
] as const;

export type ContentBlockErrorCode = (typeof contentBlockErrorCodes)[number];

export class ContentBlockError extends Error {
  public constructor(public readonly code: ContentBlockErrorCode) {
    super(code);
    this.name = "ContentBlockError";
  }
}
