export type RedactedValue =
  | null
  | boolean
  | number
  | string
  | readonly RedactedValue[]
  | { readonly [key: string]: RedactedValue };

export interface RedactionOptions {
  /** Email addresses are private by default; opt out only for a justified event. */
  readonly redactEmail?: boolean;
}

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PARTS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "email",
  "phone",
  "filepath",
  "file_path",
  "filename",
  "file_name",
  "directory",
  "path",
] as const;

function isSensitiveKey(key: string, options: RedactionOptions): boolean {
  const normalized = key.toLowerCase().replace(/[\s-]/g, "_");
  if (options.redactEmail === false && normalized.includes("email")) {
    return false;
  }
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function sanitizeString(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1[REDACTED]@")
    .replace(/\b(bearer|basic)\s+[a-z0-9._~+/=-]+/giu, "$1 [REDACTED]")
    .replace(/(authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED]");
}

function redactError(error: Error): { readonly name: string; readonly message: string } {
  return {
    name: error.name,
    // Stacks include filesystem paths and can include query values. Never emit them.
    message: sanitizeString(error.message),
  };
}

function redactInternal(
  value: unknown,
  options: RedactionOptions,
  seen: WeakSet<object>,
): RedactedValue {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case "string":
      return sanitizeString(value);
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "bigint":
      return value.toString();
    case "undefined":
      return "[undefined]";
    case "symbol":
      return "[symbol]";
    case "function":
      return "[function]";
    case "object":
      break;
  }

  if (value instanceof Error) {
    return redactError(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "[invalid-date]" : value.toISOString();
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, options, seen));
  }

  const output: Record<string, RedactedValue> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = isSensitiveKey(key, options)
      ? REDACTED
      : redactInternal(nestedValue, options, seen);
  }
  return output;
}

/** Converts arbitrary logging data to JSON-safe data with privacy redaction. */
export function redact(value: unknown, options: RedactionOptions = {}): RedactedValue {
  return redactInternal(value, options, new WeakSet<object>());
}

export const redactedValue = REDACTED;
