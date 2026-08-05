import { config as loadDotenvFile } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import { ConfigError, type ConfigIssue } from "./errors.js";
import { defaultSecretDirectory, resolveSecret, type EnvironmentVariables } from "./secrets.js";

export { ConfigError, type ConfigIssue, type ConfigIssueCode } from "./errors.js";
export {
  defaultSecretDirectory,
  resolveSecret,
  type EnvironmentVariables,
  type SecretResolverOptions,
} from "./secrets.js";

export const runtimeEnvironments = ["development", "test", "production"] as const;
export type RuntimeEnvironment = (typeof runtimeEnvironments)[number];

export const logLevels = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

export const whatsappModes = ["disabled", "dry-run", "enabled"] as const;
export type WhatsAppMode = (typeof whatsappModes)[number];

export interface ConfigRequirements {
  readonly database?: boolean;
  readonly redis?: boolean;
  readonly sessionSecret?: boolean;
  readonly whatsappCredentials?: boolean;
}

export interface LoadConfigOptions {
  readonly environment?: EnvironmentVariables;
  readonly serviceName?: string;
  readonly requirements?: ConfigRequirements;
  readonly secretDirectory?: string;
  /**
   * Explicit opt-in because loading .env mutates process.env. It is rejected
   * outside development to avoid accidental production configuration files.
   */
  readonly loadDotenv?: boolean;
  readonly dotenvPath?: string;
}

export interface AppConfig {
  readonly nodeEnv: RuntimeEnvironment;
  readonly serviceName: string;
  readonly appName: string;
  readonly defaultLocale: "ar" | "en";
  readonly publicAppUrl: string;
  readonly adminAppUrl: string;
  readonly migrationsDirectory: string;
  readonly logLevel: LogLevel;
  readonly whatsapp: {
    readonly mode: WhatsAppMode;
    readonly phoneNumberId?: string;
    readonly templateName?: string;
    readonly templateLanguage?: string;
  };
  readonly storage: {
    readonly driver: "local" | "s3";
    readonly localPath?: string;
    readonly maxUploadBytes: number;
  };
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly sessionSecret?: string;
  readonly whatsappAppSecret?: string;
  readonly whatsappVerifyToken?: string;
}

export interface SafeAppConfig {
  readonly nodeEnv: RuntimeEnvironment;
  readonly serviceName: string;
  readonly appName: string;
  readonly defaultLocale: "ar" | "en";
  readonly publicAppUrl: string;
  readonly adminAppUrl: string;
  readonly migrationsDirectory: string;
  readonly logLevel: LogLevel;
  readonly whatsapp: AppConfig["whatsapp"];
  readonly storage: AppConfig["storage"];
  readonly hasDatabaseUrl: boolean;
  readonly hasRedisUrl: boolean;
  readonly hasSessionSecret: boolean;
}

const urlSchema = z.string().trim().url();
const positiveIntegerSchema = z.coerce.number().int().positive().max(1_073_741_824);

function pushIssue(
  issues: ConfigIssue[],
  field: string,
  code: ConfigIssue["code"],
  message: string,
): void {
  issues.push({ field, code, message });
}

function parseOptionalUrl(
  issues: ConfigIssue[],
  field: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  const parsed = urlSchema.safeParse(value);
  if (!parsed.success) {
    pushIssue(issues, field, "invalid", "must be a valid URL");
    return undefined;
  }
  return parsed.data;
}

function parseRequiredUrl(issues: ConfigIssue[], field: string, value: string | undefined): string {
  const parsed = parseOptionalUrl(issues, field, value);
  if (parsed === undefined) {
    if (value === undefined || value.length === 0) {
      pushIssue(issues, field, "missing", "is required");
    }
    return "";
  }
  return parsed;
}

function parseEnum<T extends readonly [string, ...string[]]>(
  issues: ConfigIssue[],
  field: string,
  value: string | undefined,
  values: T,
  fallback: T[number],
): T[number] {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = z.enum(values).safeParse(value.trim());
  if (!parsed.success) {
    pushIssue(issues, field, "invalid", `must be one of: ${values.join(", ")}`);
    return fallback;
  }
  return parsed.data;
}

function parsePositiveInteger(
  issues: ConfigIssue[],
  field: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = positiveIntegerSchema.safeParse(value);
  if (!parsed.success) {
    pushIssue(issues, field, "invalid", "must be a positive integer within the allowed range");
    return fallback;
  }
  return parsed.data;
}

function hasWeakProductionMarker(value: string): boolean {
  const normalized = value.toLowerCase();
  return ["change-me", "replace-me", "example", "placeholder", "localhost"].some((marker) =>
    normalized.includes(marker),
  );
}

function assertProductionSafety(config: AppConfig, issues: ConfigIssue[]): void {
  if (config.nodeEnv !== "production") {
    return;
  }

  if (!config.publicAppUrl.startsWith("https://")) {
    pushIssue(issues, "PUBLIC_APP_URL", "unsafe_production_value", "must use HTTPS in production");
  }
  if (!config.adminAppUrl.startsWith("https://")) {
    pushIssue(issues, "ADMIN_APP_URL", "unsafe_production_value", "must use HTTPS in production");
  }

  for (const [field, value] of [
    ["DATABASE_URL", config.databaseUrl],
    ["REDIS_URL", config.redisUrl],
    ["SESSION_SECRET", config.sessionSecret],
  ] as const) {
    if (value !== undefined && hasWeakProductionMarker(value)) {
      pushIssue(issues, field, "unsafe_production_value", "contains a development placeholder");
    }
  }
}

function getEnvironment(options: LoadConfigOptions): EnvironmentVariables {
  return options.environment ?? process.env;
}

function findWorkspaceDotenvPath(startDirectory: string): string | undefined {
  let currentDirectory = resolve(startDirectory);
  while (true) {
    const workspaceMarker = join(currentDirectory, "pnpm-workspace.yaml");
    if (existsSync(/* turbopackIgnore: true */ workspaceMarker)) {
      return join(currentDirectory, ".env");
    }
    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return undefined;
    }
    currentDirectory = parentDirectory;
  }
}

/** Loads a dotenv file only for a development process. */
export function loadDevelopmentEnv(
  options: {
    readonly environment?: EnvironmentVariables;
    readonly path?: string;
  } = {},
): void {
  const environment = options.environment ?? process.env;
  const declaredEnvironment = environment.NODE_ENV ?? environment.APP_ENV ?? "development";
  if (declaredEnvironment !== "development") {
    throw new ConfigError([
      {
        field: "NODE_ENV",
        code: "unsafe_production_value",
        message: ".env loading is allowed only in development",
      },
    ]);
  }

  const path = options.path ?? findWorkspaceDotenvPath(process.cwd());
  const result = loadDotenvFile(path === undefined ? {} : { path });
  if (result.error !== undefined) {
    // Missing .env is normal. Other parser and I/O details remain intentionally private.
    const errorCode = "code" in result.error ? result.error.code : undefined;
    if (errorCode !== "ENOENT") {
      throw new ConfigError([
        {
          field: ".env",
          code: "invalid",
          message: "could not be loaded",
        },
      ]);
    }
  }
}

/**
 * Validates configuration without ever including secret values in errors.
 * DATABASE_URL and REDIS_URL become mandatory only when their service needs
 * them, so administrative build commands need not invent unrelated values.
 */
export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  if (options.loadDotenv === true) {
    loadDevelopmentEnv({
      ...(options.environment === undefined ? {} : { environment: options.environment }),
      ...(options.dotenvPath === undefined ? {} : { path: options.dotenvPath }),
    });
  }

  const environment = getEnvironment(options);
  const issues: ConfigIssue[] = [];
  const nodeEnv = parseEnum(
    issues,
    "NODE_ENV",
    environment.NODE_ENV ?? environment.APP_ENV,
    runtimeEnvironments,
    "development",
  );

  if (
    environment.NODE_ENV !== undefined &&
    environment.APP_ENV !== undefined &&
    environment.NODE_ENV !== environment.APP_ENV
  ) {
    pushIssue(issues, "APP_ENV", "invalid", "must match NODE_ENV when both are set");
  }

  const secretDirectory = options.secretDirectory ?? defaultSecretDirectory;
  let databaseUrl: string | undefined;
  let redisUrl: string | undefined;
  let sessionSecret: string | undefined;
  let whatsappAppSecret: string | undefined;
  let whatsappVerifyToken: string | undefined;
  try {
    databaseUrl = resolveSecret(environment, "DATABASE_URL", { secretDirectory });
    redisUrl = resolveSecret(environment, "REDIS_URL", { secretDirectory });
    sessionSecret = resolveSecret(environment, "SESSION_SECRET", { secretDirectory });
    whatsappAppSecret = resolveSecret(environment, "WHATSAPP_APP_SECRET", { secretDirectory });
    whatsappVerifyToken = resolveSecret(environment, "WHATSAPP_VERIFY_TOKEN", { secretDirectory });
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      issues.push(...error.issues);
    } else {
      throw error;
    }
  }

  databaseUrl = parseOptionalUrl(issues, "DATABASE_URL", databaseUrl);
  redisUrl = parseOptionalUrl(issues, "REDIS_URL", redisUrl);

  const appName = (environment.APP_NAME ?? "ITQANAK").trim();
  if (appName.length === 0) {
    pushIssue(issues, "APP_NAME", "invalid", "must not be empty");
  }
  const serviceName = (options.serviceName ?? environment.SERVICE_NAME ?? "unknown-service").trim();
  if (serviceName.length === 0) {
    pushIssue(issues, "SERVICE_NAME", "invalid", "must not be empty");
  }

  const publicAppUrl = parseRequiredUrl(
    issues,
    "PUBLIC_APP_URL",
    environment.PUBLIC_APP_URL ?? "http://localhost:8080",
  );
  const adminAppUrl = parseRequiredUrl(
    issues,
    "ADMIN_APP_URL",
    environment.ADMIN_APP_URL ?? "http://localhost:8080/ar/admin",
  );
  const defaultLocale = parseEnum(
    issues,
    "DEFAULT_LOCALE",
    environment.DEFAULT_LOCALE,
    ["ar", "en"] as const,
    "ar",
  );
  const logLevel = parseEnum(issues, "LOG_LEVEL", environment.LOG_LEVEL, logLevels, "info");
  const whatsappMode = parseEnum(
    issues,
    "WHATSAPP_MODE",
    environment.WHATSAPP_MODE,
    whatsappModes,
    "disabled",
  );
  const storageDriver = parseEnum(
    issues,
    "STORAGE_DRIVER",
    environment.STORAGE_DRIVER,
    ["local", "s3"] as const,
    "local",
  );

  const config: AppConfig = {
    nodeEnv,
    serviceName: serviceName.length === 0 ? "unknown-service" : serviceName,
    appName: appName.length === 0 ? "ITQANAK" : appName,
    defaultLocale,
    publicAppUrl,
    adminAppUrl,
    migrationsDirectory: (environment.MIGRATIONS_DIR ?? "migrations").trim() || "migrations",
    logLevel,
    whatsapp: {
      mode: whatsappMode,
      ...(environment.WHATSAPP_PHONE_NUMBER_ID?.trim()
        ? { phoneNumberId: environment.WHATSAPP_PHONE_NUMBER_ID.trim() }
        : {}),
      ...(environment.WHATSAPP_TEMPLATE_NAME?.trim()
        ? { templateName: environment.WHATSAPP_TEMPLATE_NAME.trim() }
        : {}),
      ...(environment.WHATSAPP_TEMPLATE_LANGUAGE?.trim()
        ? { templateLanguage: environment.WHATSAPP_TEMPLATE_LANGUAGE.trim() }
        : {}),
    },
    storage: {
      driver: storageDriver,
      ...(environment.STORAGE_LOCAL_PATH?.trim()
        ? { localPath: environment.STORAGE_LOCAL_PATH.trim() }
        : {}),
      maxUploadBytes: parsePositiveInteger(
        issues,
        "MAX_UPLOAD_BYTES",
        environment.MAX_UPLOAD_BYTES,
        26_214_400,
      ),
    },
    ...(databaseUrl === undefined ? {} : { databaseUrl }),
    ...(redisUrl === undefined ? {} : { redisUrl }),
    ...(sessionSecret === undefined || sessionSecret.length === 0 ? {} : { sessionSecret }),
    ...(whatsappAppSecret === undefined || whatsappAppSecret.length === 0
      ? {}
      : { whatsappAppSecret }),
    ...(whatsappVerifyToken === undefined || whatsappVerifyToken.length === 0
      ? {}
      : { whatsappVerifyToken }),
  };

  const requirements = options.requirements ?? {};
  if (requirements.database === true && config.databaseUrl === undefined) {
    pushIssue(issues, "DATABASE_URL", "missing", "is required by this service");
  }
  if (requirements.redis === true && config.redisUrl === undefined) {
    pushIssue(issues, "REDIS_URL", "missing", "is required by this service");
  }
  if (requirements.sessionSecret === true && config.sessionSecret === undefined) {
    pushIssue(issues, "SESSION_SECRET", "missing", "is required by this service");
  }
  if (requirements.whatsappCredentials === true) {
    if (config.whatsappAppSecret === undefined) {
      pushIssue(issues, "WHATSAPP_APP_SECRET", "missing", "is required by this service");
    }
    if (config.whatsappVerifyToken === undefined) {
      pushIssue(issues, "WHATSAPP_VERIFY_TOKEN", "missing", "is required by this service");
    }
  }

  assertProductionSafety(config, issues);
  if (issues.length > 0) {
    throw new ConfigError(issues);
  }
  return config;
}

/** Returns configuration suitable for structured logs and diagnostics. */
export function toSafeConfig(config: AppConfig): SafeAppConfig {
  return {
    nodeEnv: config.nodeEnv,
    serviceName: config.serviceName,
    appName: config.appName,
    defaultLocale: config.defaultLocale,
    publicAppUrl: config.publicAppUrl,
    adminAppUrl: config.adminAppUrl,
    migrationsDirectory: config.migrationsDirectory,
    logLevel: config.logLevel,
    whatsapp: config.whatsapp,
    storage: config.storage,
    hasDatabaseUrl: config.databaseUrl !== undefined,
    hasRedisUrl: config.redisUrl !== undefined,
    hasSessionSecret: config.sessionSecret !== undefined,
  };
}
