import {
  assertContentTarget,
  assertContentVariant,
  assertContentVersion,
  type ContentBlockFields,
} from "@itqanak/content";

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function optionalFormValue(formData: FormData, key: string): string | null {
  const value = formValue(formData, key).trim();
  return value.length === 0 ? null : value;
}

function integerFormValue(formData: FormData, key: string): number {
  const value = formValue(formData, key);
  if (!/^\d{1,6}$/u.test(value)) return Number.NaN;
  return Number(value);
}

export function contentBlockFieldsFromForm(formData: FormData): ContentBlockFields {
  return {
    slug: formValue(formData, "slug"),
    target: assertContentTarget(formValue(formData, "target")),
    variant: assertContentVariant(formValue(formData, "variant")),
    titleAr: formValue(formData, "titleAr"),
    titleEn: formValue(formData, "titleEn"),
    bodyAr: formValue(formData, "bodyAr"),
    bodyEn: formValue(formData, "bodyEn"),
    actionLabelAr: optionalFormValue(formData, "actionLabelAr"),
    actionLabelEn: optionalFormValue(formData, "actionLabelEn"),
    actionHref: optionalFormValue(formData, "actionHref"),
    active: formValue(formData, "active") === "true",
    sortOrder: integerFormValue(formData, "sortOrder"),
  };
}

export function contentVersionFromForm(formData: FormData): number {
  return assertContentVersion(integerFormValue(formData, "version"));
}
