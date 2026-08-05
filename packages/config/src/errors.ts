export type ConfigIssueCode = "invalid" | "missing" | "secret_file" | "unsafe_production_value";

export interface ConfigIssue {
  readonly field: string;
  readonly code: ConfigIssueCode;
  readonly message: string;
}

/**
 * A deliberately value-free startup error. Configuration often contains
 * credentials, so callers must never receive the offending value or path.
 */
export class ConfigError extends Error {
  public readonly issues: readonly ConfigIssue[];

  public constructor(issues: readonly ConfigIssue[]) {
    super(
      `Invalid application configuration: ${issues
        .map((issue) => `${issue.field} ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ConfigError";
    this.issues = issues;
  }
}
