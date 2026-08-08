export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/ar/account",
): string {
  if (value === null || value === undefined || value.length === 0) {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  try {
    const parsed = new URL(value, "https://itqanak.invalid");
    if (parsed.origin !== "https://itqanak.invalid") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
