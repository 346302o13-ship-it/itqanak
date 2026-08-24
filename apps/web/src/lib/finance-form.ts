import {
  assertFinanceCurrency,
  assertFinanceDueStatus,
  assertFinancePaymentMethod,
  type CreateFinanceDueInput,
  type FinanceListInput,
  type RecordFinancePaymentInput,
} from "@itqanak/finance";

import { formValue } from "./auth-runtime";

function optionalFormValue(formData: FormData, name: string): string | null {
  const value = formValue(formData, name).trim();
  return value.length === 0 ? null : value;
}

function integerFormValue(formData: FormData, name: string): number {
  const value = formValue(formData, name);
  if (!/^[1-9][0-9]*$/u.test(value)) return Number.NaN;
  return Number(value);
}

export function financeVersionFromForm(formData: FormData): number {
  return integerFormValue(formData, "expectedVersion");
}

function zonedDateTime(value: string | null): string | null {
  if (value === null) return null;
  // datetime-local is interpreted explicitly in Saudi time; this keeps server
  // parsing deterministic for the platform's primary operational timezone.
  return `${value}:00+03:00`;
}

export function createFinanceDueFromForm(formData: FormData): CreateFinanceDueInput {
  return {
    requestNumber: formValue(formData, "requestNumber"),
    titleAr: formValue(formData, "titleAr"),
    titleEn: formValue(formData, "titleEn"),
    descriptionAr: optionalFormValue(formData, "descriptionAr"),
    descriptionEn: optionalFormValue(formData, "descriptionEn"),
    amount: formValue(formData, "amount"),
    currency: assertFinanceCurrency(formValue(formData, "currency")),
    dueAt: zonedDateTime(optionalFormValue(formData, "dueAt")),
  };
}

export function recordFinancePaymentFromForm(formData: FormData): RecordFinancePaymentInput {
  return {
    expectedVersion: integerFormValue(formData, "expectedVersion"),
    method: assertFinancePaymentMethod(formValue(formData, "method")),
    reference: optionalFormValue(formData, "reference"),
    note: optionalFormValue(formData, "note"),
  };
}

export function parseFinanceListQuery(
  query: Readonly<Record<string, string | readonly string[] | undefined>>,
): FinanceListInput {
  const pageValue = typeof query.page === "string" ? Number(query.page) : Number.NaN;
  const statusValue = typeof query.status === "string" ? query.status : undefined;
  const currencyValue = typeof query.currency === "string" ? query.currency : undefined;
  let status: FinanceListInput["status"];
  let currency: FinanceListInput["currency"];
  try {
    status =
      statusValue === undefined || statusValue === ""
        ? undefined
        : assertFinanceDueStatus(statusValue);
  } catch {
    status = undefined;
  }
  try {
    currency =
      currencyValue === undefined || currencyValue === ""
        ? undefined
        : assertFinanceCurrency(currencyValue);
  } catch {
    currency = undefined;
  }
  return {
    ...(Number.isSafeInteger(pageValue) && pageValue >= 1 ? { page: pageValue } : {}),
    ...(typeof query.q === "string" ? { search: query.q.trim().slice(0, 100) } : {}),
    ...(status === undefined ? {} : { status }),
    ...(currency === undefined ? {} : { currency }),
  };
}
