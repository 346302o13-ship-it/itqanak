export function classNames(...values: ReadonlyArray<string | false | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}
