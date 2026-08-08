import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

import { ConfigError, type ConfigIssue } from "./errors.js";

export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

export interface SecretResolverOptions {
  /** Directory used by Docker and systemd secret mounts. */
  readonly secretDirectory?: string;
}

const DEFAULT_SECRET_DIRECTORY = "/run/secrets";
const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function issueForSecret(name: string, message: string): ConfigError {
  const issue: ConfigIssue = {
    field: `${name}_FILE`,
    code: "secret_file",
    message,
  };
  return new ConfigError([issue]);
}

function assertSecretName(name: string): void {
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new Error("Secret names must use uppercase letters, numbers, and underscores.");
  }
}

function isWithinDirectory(candidate: string, directory: string): boolean {
  const normalizedDirectory = resolve(directory);
  const normalizedCandidate = resolve(candidate);
  return normalizedCandidate.startsWith(`${normalizedDirectory}${sep}`);
}

function readSecretFile(name: string, filePath: string, secretDirectory: string): string {
  if (!isWithinDirectory(filePath, secretDirectory)) {
    throw issueForSecret(name, "must reference a file inside the configured secret directory");
  }

  try {
    const realSecretDirectory = realpathSync(secretDirectory);
    const realFilePath = realpathSync(filePath);
    if (!isWithinDirectory(realFilePath, realSecretDirectory)) {
      throw issueForSecret(name, "resolves outside the configured secret directory");
    }

    const value = readFileSync(realFilePath, "utf8").replace(/[\r\n]+$/, "");
    if (value.length === 0) {
      throw issueForSecret(name, "must not be empty");
    }
    return value;
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      throw error;
    }
    // Do not expose a file path, operating-system error, or secret contents.
    throw issueForSecret(name, "could not be read");
  }
}

function readOptionalConventionalSecretFile(
  name: string,
  filePath: string,
  secretDirectory: string,
): string | undefined {
  try {
    return readSecretFile(name, filePath, secretDirectory);
  } catch (error: unknown) {
    if (
      error instanceof ConfigError &&
      error.issues.length === 1 &&
      error.issues[0]?.message === "must not be empty"
    ) {
      // Compose may mount an intentionally empty optional secret while an
      // integration is disabled. Required consumers still fail later through
      // their normal configuration requirement checks.
      return undefined;
    }
    throw error;
  }
}

/**
 * Resolves NAME_FILE before NAME. If neither is configured, a Docker-style
 * lowercase file (for example /run/secrets/database_url) is used when present.
 */
export function resolveSecret(
  environment: EnvironmentVariables,
  name: string,
  options: SecretResolverOptions = {},
): string | undefined {
  assertSecretName(name);

  const secretDirectory = options.secretDirectory ?? DEFAULT_SECRET_DIRECTORY;
  const configuredFile = environment[`${name}_FILE`];
  if (configuredFile !== undefined && configuredFile.trim() !== "") {
    return readSecretFile(name, configuredFile.trim(), secretDirectory);
  }

  if (configuredFile !== undefined) {
    throw issueForSecret(name, "must not be empty when configured");
  }

  const conventionalFile = resolve(secretDirectory, name.toLowerCase());
  if (existsSync(/* turbopackIgnore: true */ conventionalFile)) {
    return readOptionalConventionalSecretFile(name, conventionalFile, secretDirectory);
  }

  const directValue = environment[name];
  if (directValue === undefined) {
    return undefined;
  }
  const normalized = directValue.trim();
  return normalized.length === 0 ? undefined : normalized;
}

export const defaultSecretDirectory = DEFAULT_SECRET_DIRECTORY;
