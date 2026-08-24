const submissionKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const requestNumberPattern = /^ITQ-(?<year>[0-9]{4})-(?<sequence>[0-9]{6,})$/u;

declare const submissionKeyBrand: unique symbol;
export type SubmissionKey = string & { readonly [submissionKeyBrand]: true };

export function isSubmissionKey(value: string): value is SubmissionKey {
  return submissionKeyPattern.test(value);
}

export function assertSubmissionKey(value: string): asserts value is SubmissionKey {
  if (!isSubmissionKey(value)) {
    throw new TypeError("Submission key must be a valid UUID.");
  }
}

export function normalizeSubmissionKey(value: string): SubmissionKey {
  const normalized = value.trim().toLowerCase();
  assertSubmissionKey(normalized);
  return normalized;
}

export function generateSubmissionKey(): SubmissionKey {
  return crypto.randomUUID() as SubmissionKey;
}

function resolveRequestNumberYear(dateOrYear: Date | number): number {
  const year = dateOrYear instanceof Date ? dateOrYear.getUTCFullYear() : dateOrYear;
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError("Request number year must contain four digits.");
  }
  return year;
}

export function formatRequestNumber(
  sequence: number | bigint,
  dateOrYear: Date | number = new Date(),
): string {
  if (
    (typeof sequence === "number" && (!Number.isSafeInteger(sequence) || sequence < 1)) ||
    (typeof sequence === "bigint" && sequence < 1n)
  ) {
    throw new RangeError("Request number sequence must be a positive safe integer.");
  }

  const year = resolveRequestNumberYear(dateOrYear);
  return `ITQ-${String(year)}-${String(sequence).padStart(6, "0")}`;
}

export function isRequestNumber(value: string): boolean {
  const match = requestNumberPattern.exec(value);
  if (match === null) {
    return false;
  }
  const sequence = match.groups?.sequence;
  return sequence !== undefined && !/^0+$/u.test(sequence);
}
