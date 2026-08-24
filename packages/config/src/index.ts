import { config as loadDotenvFile } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
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

export const emailDeliveryModes = ["disabled", "smtp", "test"] as const;
export type EmailDeliveryMode = (typeof emailDeliveryModes)[number];

export const fileScanModes = ["disabled", "clamav"] as const;
export type FileScanMode = (typeof fileScanModes)[number];

export interface ConfigRequirements {
  readonly database?: boolean;
  readonly redis?: boolean;
  readonly sessionSecret?: boolean;
  readonly whatsappCredentials?: boolean;
  readonly authEmailPayloadKey?: boolean;
  readonly storage?: boolean;
  readonly fileScanning?: boolean;
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
  readonly academicIntegrityVersion: string;
  readonly migrationsDirectory: string;
  readonly logLevel: LogLevel;
  readonly whatsapp: {
    readonly mode: WhatsAppMode;
    readonly phoneNumberId?: string;
    readonly templateName?: string;
    readonly templateLanguage?: string;
    readonly graphApiVersion: string;
    readonly supportRecipientE164?: string;
    readonly maxAttempts: number;
    readonly notificationsNotBefore?: string;
  };
  readonly storage: {
    readonly driver: "local" | "s3";
    readonly localPath: string;
    readonly maxFileBytes: number;
    readonly maxFilesPerRequest: number;
    readonly maxTotalBytesPerRequest: number;
    readonly s3?: {
      readonly endpoint?: string;
      readonly region: string;
      readonly bucket: string;
      readonly forcePathStyle: boolean;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
    };
  };
  readonly fileScanning: {
    readonly mode: FileScanMode;
    readonly clamavHost: string;
    readonly clamavPort: number;
    readonly connectTimeoutMs: number;
    readonly scanTimeoutMs: number;
    readonly maxAttempts: number;
  };
  readonly operationalControls: {
    /** Maximum staleness of the public maintenance-mode decision. */
    readonly maintenanceCacheTtlMs: number;
  };
  readonly auth: {
    readonly studentSessionAbsoluteTtlSeconds: number;
    readonly studentSessionIdleTtlSeconds: number;
    readonly adminSessionAbsoluteTtlSeconds: number;
    readonly adminSessionIdleTtlSeconds: number;
    readonly emailVerificationTtlSeconds: number;
    readonly passwordResetTtlSeconds: number;
    readonly rateLimitEnabled: boolean;
    readonly emailDeliveryMode: EmailDeliveryMode;
    readonly termsVersion: string;
    readonly privacyVersion: string;
    readonly emailPayloadKey?: string;
    readonly smtp?: {
      readonly host: string;
      readonly port: number;
      readonly secure: boolean;
      readonly fromName: string;
      readonly fromAddress: string;
      readonly password: string;
    };
  };
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly sessionSecret?: string;
  readonly whatsappAppSecret?: string;
  readonly whatsappVerifyToken?: string;
  readonly whatsappAccessToken?: string;
}

export interface SafeAppConfig {
  readonly nodeEnv: RuntimeEnvironment;
  readonly serviceName: string;
  readonly appName: string;
  readonly defaultLocale: "ar" | "en";
  readonly publicAppUrl: string;
  readonly adminAppUrl: string;
  readonly academicIntegrityVersion: string;
  readonly migrationsDirectory: string;
  readonly logLevel: LogLevel;
  readonly whatsapp: AppConfig["whatsapp"];
  readonly storage: {
    readonly driver: AppConfig["storage"]["driver"];
    readonly maxFileBytes: number;
    readonly maxFilesPerRequest: number;
    readonly maxTotalBytesPerRequest: number;
    readonly hasLocalPath: boolean;
    readonly hasS3Configuration: boolean;
  };
  /** Intentionally exposes only the operating mode, never scanner network details. */
  readonly fileScanning: Pick<AppConfig["fileScanning"], "mode">;
  readonly operationalControls: AppConfig["operationalControls"];
  readonly auth: Omit<AppConfig["auth"], "emailPayloadKey" | "smtp"> & {
    readonly hasSmtpConfiguration: boolean;
  };
  readonly hasDatabaseUrl: boolean;
  readonly hasRedisUrl: boolean;
  readonly hasSessionSecret: boolean;
  readonly hasAuthEmailPayloadKey: boolean;
  readonly hasWhatsAppAccessToken: boolean;
}

const urlSchema = z.string().trim().url();
const positiveIntegerSchema = z.coerce.number().int().positive().max(1_073_741_824);
const booleanSchema = z.enum(["true", "false"]);

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

function parseBoolean(
  issues: ConfigIssue[],
  field: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = booleanSchema.safeParse(value.trim().toLowerCase());
  if (!parsed.success) {
    pushIssue(issues, field, "invalid", "must be true or false");
    return fallback;
  }
  return parsed.data === "true";
}

function parseRequiredText(
  issues: ConfigIssue[],
  field: string,
  value: string | undefined,
  fallback: string,
): string {
  const parsed = (value ?? fallback).trim();
  if (parsed.length === 0) {
    pushIssue(issues, field, "missing", "is required");
    return fallback;
  }
  return parsed;
}

function parseOptionalEmail(
  issues: ConfigIssue[],
  field: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const parsed = z.string().trim().email().safeParse(value);
  if (!parsed.success) {
    pushIssue(issues, field, "invalid", "must be a valid email address");
    return undefined;
  }
  return parsed.data;
}

function isValidAuthPayloadKey(value: string): boolean {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function hasWeakProductionMarker(value: string): boolean {
  const normalized = value.toLowerCase();
  return ["change-me", "replace-me", "example", "placeholder", "localhost"].some((marker) =>
    normalized.includes(marker),
  );
}

function isPrivateDockerS3Endpoint(value: string): boolean {
  try {
    const endpoint = new URL(value);
    return (
      endpoint.protocol === "http:" &&
      endpoint.hostname === "minio" &&
      (endpoint.port === "" || endpoint.port === "9000") &&
      endpoint.pathname === "/" &&
      endpoint.search === "" &&
      endpoint.hash === ""
    );
  } catch {
    return false;
  }
}

function assertProductionSafety(
  config: AppConfig,
  requirements: ConfigRequirements,
  issues: ConfigIssue[],
): void {
  if (config.nodeEnv !== "production") {
    return;
  }

  if (!config.publicAppUrl.startsWith("https://")) {
    pushIssue(issues, "PUBLIC_APP_URL", "unsafe_production_value", "must use HTTPS in production");
  }
  if (!config.adminAppUrl.startsWith("https://")) {
    pushIssue(issues, "ADMIN_APP_URL", "unsafe_production_value", "must use HTTPS in production");
  }
  if (requirements.fileScanning === true && config.fileScanning.mode !== "clamav") {
    pushIssue(issues, "FILE_SCAN_MODE", "unsafe_production_value", "must be clamav in production");
  }
  if (requirements.storage === true && config.storage.driver !== "s3") {
    pushIssue(issues, "STORAGE_DRIVER", "unsafe_production_value", "must be s3 in production");
  }
  if (
    requirements.storage === true &&
    config.storage.s3?.endpoint !== undefined &&
    !config.storage.s3.endpoint.startsWith("https://") &&
    !isPrivateDockerS3Endpoint(config.storage.s3.endpoint)
  ) {
    pushIssue(
      issues,
      "STORAGE_S3_ENDPOINT",
      "unsafe_production_value",
      "must use HTTPS in production when configured",
    );
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
  let whatsappAccessToken: string | undefined;
  let authEmailPayloadKey: string | undefined;
  let smtpPassword: string | undefined;
  let storageS3AccessKeyId: string | undefined;
  let storageS3SecretAccessKey: string | undefined;
  try {
    databaseUrl = resolveSecret(environment, "DATABASE_URL", { secretDirectory });
    redisUrl = resolveSecret(environment, "REDIS_URL", { secretDirectory });
    sessionSecret = resolveSecret(environment, "SESSION_SECRET", { secretDirectory });
    whatsappAppSecret = resolveSecret(environment, "WHATSAPP_APP_SECRET", { secretDirectory });
    whatsappVerifyToken = resolveSecret(environment, "WHATSAPP_VERIFY_TOKEN", { secretDirectory });
    whatsappAccessToken = resolveSecret(environment, "WHATSAPP_ACCESS_TOKEN", {
      secretDirectory,
      // The token is only required when WHATSAPP_MODE is enabled (validated
      // below). Compose mounts an intentionally empty optional secret while
      // WhatsApp is disabled, so an empty file must not fail configuration.
      allowEmpty: true,
    });
    authEmailPayloadKey = resolveSecret(environment, "AUTH_EMAIL_PAYLOAD_KEY", {
      secretDirectory,
    });
    smtpPassword = resolveSecret(environment, "SMTP_PASSWORD", { secretDirectory });
    storageS3AccessKeyId = resolveSecret(environment, "STORAGE_S3_ACCESS_KEY_ID", {
      secretDirectory,
    });
    storageS3SecretAccessKey = resolveSecret(environment, "STORAGE_S3_SECRET_ACCESS_KEY", {
      secretDirectory,
    });
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      issues.push(...error.issues);
    } else {
      throw error;
    }
  }

  databaseUrl = parseOptionalUrl(issues, "DATABASE_URL", databaseUrl);
  redisUrl = parseOptionalUrl(issues, "REDIS_URL", redisUrl);
  if (authEmailPayloadKey !== undefined && !isValidAuthPayloadKey(authEmailPayloadKey)) {
    pushIssue(
      issues,
      "AUTH_EMAIL_PAYLOAD_KEY",
      "invalid",
      "must decode to exactly 32 bytes of key material",
    );
    authEmailPayloadKey = undefined;
  }

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
  const whatsappPhoneNumberId = environment.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const whatsappTemplateName = environment.WHATSAPP_TEMPLATE_NAME?.trim();
  const whatsappTemplateLanguage = (environment.WHATSAPP_TEMPLATE_LANGUAGE ?? "ar").trim();
  const whatsappGraphApiVersion = (environment.WHATSAPP_GRAPH_API_VERSION ?? "v25.0").trim();
  const whatsappSupportRecipientE164 = environment.WHATSAPP_SUPPORT_RECIPIENT_E164?.trim();
  const whatsappNotificationsNotBefore = environment.WHATSAPP_NOTIFICATIONS_NOT_BEFORE?.trim();
  const whatsappMaxAttempts = parsePositiveInteger(
    issues,
    "WHATSAPP_MAX_ATTEMPTS",
    environment.WHATSAPP_MAX_ATTEMPTS,
    8,
  );
  if (whatsappMaxAttempts > 20) {
    pushIssue(issues, "WHATSAPP_MAX_ATTEMPTS", "invalid", "must not exceed 20");
  }
  if (!/^v[0-9]{1,3}\.[0-9]{1,3}$/u.test(whatsappGraphApiVersion)) {
    pushIssue(issues, "WHATSAPP_GRAPH_API_VERSION", "invalid", "must look like v25.0");
  }
  if (
    whatsappSupportRecipientE164 !== undefined &&
    !/^\+[1-9][0-9]{7,14}$/u.test(whatsappSupportRecipientE164)
  ) {
    pushIssue(
      issues,
      "WHATSAPP_SUPPORT_RECIPIENT_E164",
      "invalid",
      "must be an E.164 phone number",
    );
  }
  let normalizedWhatsAppNotificationsNotBefore: string | undefined;
  if (whatsappNotificationsNotBefore !== undefined && whatsappNotificationsNotBefore !== "") {
    const parsed = new Date(whatsappNotificationsNotBefore);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(
        whatsappNotificationsNotBefore,
      ) ||
      Number.isNaN(parsed.getTime())
    ) {
      pushIssue(
        issues,
        "WHATSAPP_NOTIFICATIONS_NOT_BEFORE",
        "invalid",
        "must be an RFC 3339 UTC timestamp",
      );
    } else {
      normalizedWhatsAppNotificationsNotBefore = parsed.toISOString();
    }
  }
  if (whatsappMode === "enabled") {
    if (whatsappPhoneNumberId === undefined || !/^[0-9]{5,30}$/u.test(whatsappPhoneNumberId)) {
      pushIssue(issues, "WHATSAPP_PHONE_NUMBER_ID", "missing", "is required in enabled mode");
    }
    if (whatsappTemplateName === undefined || !/^[a-z0-9_]{1,512}$/u.test(whatsappTemplateName)) {
      pushIssue(issues, "WHATSAPP_TEMPLATE_NAME", "missing", "is required in enabled mode");
    }
    if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/u.test(whatsappTemplateLanguage)) {
      pushIssue(issues, "WHATSAPP_TEMPLATE_LANGUAGE", "invalid", "is not a valid locale code");
    }
    if (whatsappSupportRecipientE164 === undefined) {
      pushIssue(
        issues,
        "WHATSAPP_SUPPORT_RECIPIENT_E164",
        "missing",
        "is required in enabled mode",
      );
    }
    if (whatsappAccessToken === undefined || whatsappAccessToken.trim().length < 20) {
      pushIssue(issues, "WHATSAPP_ACCESS_TOKEN", "missing", "is required in enabled mode");
    }
    if (normalizedWhatsAppNotificationsNotBefore === undefined) {
      pushIssue(
        issues,
        "WHATSAPP_NOTIFICATIONS_NOT_BEFORE",
        "missing",
        "is required in enabled mode to prevent historical notification delivery",
      );
    }
  }
  const storageDriver = parseEnum(
    issues,
    "STORAGE_DRIVER",
    environment.STORAGE_DRIVER,
    ["local", "s3"] as const,
    "local",
  );
  const fileScanMode = parseEnum(
    issues,
    "FILE_SCAN_MODE",
    environment.FILE_SCAN_MODE,
    fileScanModes,
    "disabled",
  );
  const maintenanceCacheTtlMs = parsePositiveInteger(
    issues,
    "OPERATIONAL_STATE_CACHE_TTL_MS",
    environment.OPERATIONAL_STATE_CACHE_TTL_MS,
    2_000,
  );
  if (maintenanceCacheTtlMs < 250 || maintenanceCacheTtlMs > 10_000) {
    pushIssue(
      issues,
      "OPERATIONAL_STATE_CACHE_TTL_MS",
      "invalid",
      "must be between 250 and 10000 milliseconds",
    );
  }
  const emailDeliveryMode = parseEnum(
    issues,
    "EMAIL_DELIVERY_MODE",
    environment.EMAIL_DELIVERY_MODE,
    emailDeliveryModes,
    "disabled",
  );
  const studentSessionAbsoluteTtlSeconds = parsePositiveInteger(
    issues,
    "AUTH_STUDENT_SESSION_ABSOLUTE_TTL_SECONDS",
    environment.AUTH_STUDENT_SESSION_ABSOLUTE_TTL_SECONDS,
    2_592_000,
  );
  const studentSessionIdleTtlSeconds = parsePositiveInteger(
    issues,
    "AUTH_STUDENT_SESSION_IDLE_TTL_SECONDS",
    environment.AUTH_STUDENT_SESSION_IDLE_TTL_SECONDS,
    604_800,
  );
  const adminSessionAbsoluteTtlSeconds = parsePositiveInteger(
    issues,
    "AUTH_ADMIN_SESSION_ABSOLUTE_TTL_SECONDS",
    environment.AUTH_ADMIN_SESSION_ABSOLUTE_TTL_SECONDS,
    43_200,
  );
  const adminSessionIdleTtlSeconds = parsePositiveInteger(
    issues,
    "AUTH_ADMIN_SESSION_IDLE_TTL_SECONDS",
    environment.AUTH_ADMIN_SESSION_IDLE_TTL_SECONDS,
    7_200,
  );
  if (studentSessionIdleTtlSeconds > studentSessionAbsoluteTtlSeconds) {
    pushIssue(
      issues,
      "AUTH_STUDENT_SESSION_IDLE_TTL_SECONDS",
      "invalid",
      "must not exceed the absolute session TTL",
    );
  }
  if (adminSessionIdleTtlSeconds > adminSessionAbsoluteTtlSeconds) {
    pushIssue(
      issues,
      "AUTH_ADMIN_SESSION_IDLE_TTL_SECONDS",
      "invalid",
      "must not exceed the absolute session TTL",
    );
  }
  if (adminSessionAbsoluteTtlSeconds >= studentSessionAbsoluteTtlSeconds) {
    pushIssue(
      issues,
      "AUTH_ADMIN_SESSION_ABSOLUTE_TTL_SECONDS",
      "invalid",
      "must be shorter than the student absolute session TTL",
    );
  }
  if (emailDeliveryMode === "test" && nodeEnv !== "test") {
    pushIssue(issues, "EMAIL_DELIVERY_MODE", "unsafe_production_value", "test mode is test-only");
  }
  const smtpHost = (environment.SMTP_HOST ?? "").trim();
  const smtpFromAddress = parseOptionalEmail(
    issues,
    "SMTP_FROM_ADDRESS",
    environment.SMTP_FROM_ADDRESS,
  );
  const smtpPort = parsePositiveInteger(issues, "SMTP_PORT", environment.SMTP_PORT, 587);
  const smtpSecure = parseBoolean(issues, "SMTP_SECURE", environment.SMTP_SECURE, false);
  const smtpFromName = parseRequiredText(
    issues,
    "SMTP_FROM_NAME",
    environment.SMTP_FROM_NAME,
    appName.length === 0 ? "ITQANAK" : appName,
  );
  const storageLocalPath = parseRequiredText(
    issues,
    "STORAGE_LOCAL_PATH",
    environment.STORAGE_LOCAL_PATH,
    "/var/lib/itqanak/private-uploads",
  );
  const maxFileBytes = parsePositiveInteger(
    issues,
    "UPLOAD_MAX_FILE_BYTES",
    environment.UPLOAD_MAX_FILE_BYTES,
    20 * 1_024 * 1_024,
  );
  const maxFilesPerRequest = parsePositiveInteger(
    issues,
    "UPLOAD_MAX_FILES_PER_REQUEST",
    environment.UPLOAD_MAX_FILES_PER_REQUEST,
    10,
  );
  const maxTotalBytesPerRequest = parsePositiveInteger(
    issues,
    "UPLOAD_MAX_TOTAL_BYTES_PER_REQUEST",
    environment.UPLOAD_MAX_TOTAL_BYTES_PER_REQUEST,
    100 * 1_024 * 1_024,
  );
  if (maxFilesPerRequest > 100) {
    pushIssue(issues, "UPLOAD_MAX_FILES_PER_REQUEST", "invalid", "must not exceed 100");
  }
  if (maxTotalBytesPerRequest < maxFileBytes) {
    pushIssue(
      issues,
      "UPLOAD_MAX_TOTAL_BYTES_PER_REQUEST",
      "invalid",
      "must be at least UPLOAD_MAX_FILE_BYTES",
    );
  }
  if (
    storageDriver === "local" &&
    (!isAbsolute(storageLocalPath) || resolve(/* turbopackIgnore: true */ storageLocalPath) === "/")
  ) {
    pushIssue(
      issues,
      "STORAGE_LOCAL_PATH",
      "invalid",
      "must be a safe absolute directory for local storage",
    );
  }

  const storageS3Endpoint = parseOptionalUrl(
    issues,
    "STORAGE_S3_ENDPOINT",
    environment.STORAGE_S3_ENDPOINT,
  );
  const storageS3Region = (environment.STORAGE_S3_REGION ?? "").trim();
  const storageS3Bucket = (environment.STORAGE_S3_BUCKET ?? "").trim();
  let storageS3: AppConfig["storage"]["s3"];
  if (storageDriver === "s3") {
    if (storageS3Region.length === 0) {
      pushIssue(issues, "STORAGE_S3_REGION", "missing", "is required for s3 storage");
    } else if (storageS3Region.length > 64 || !/^[a-z0-9-]+$/u.test(storageS3Region)) {
      pushIssue(issues, "STORAGE_S3_REGION", "invalid", "must be a valid region identifier");
    }
    if (storageS3Bucket.length === 0) {
      pushIssue(issues, "STORAGE_S3_BUCKET", "missing", "is required for s3 storage");
    } else if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(storageS3Bucket)) {
      pushIssue(issues, "STORAGE_S3_BUCKET", "invalid", "must be a valid private bucket name");
    }
    if (storageS3Endpoint !== undefined) {
      const parsedEndpoint = new URL(storageS3Endpoint);
      if (parsedEndpoint.protocol !== "http:" && parsedEndpoint.protocol !== "https:") {
        pushIssue(issues, "STORAGE_S3_ENDPOINT", "invalid", "must use HTTP or HTTPS");
      }
      if (parsedEndpoint.username.length > 0 || parsedEndpoint.password.length > 0) {
        pushIssue(issues, "STORAGE_S3_ENDPOINT", "invalid", "must not contain credentials");
      }
    }
    if (storageS3AccessKeyId === undefined) {
      pushIssue(issues, "STORAGE_S3_ACCESS_KEY_ID", "missing", "is required for s3 storage");
    }
    if (storageS3SecretAccessKey === undefined) {
      pushIssue(issues, "STORAGE_S3_SECRET_ACCESS_KEY", "missing", "is required for s3 storage");
    }
    storageS3 = {
      ...(storageS3Endpoint === undefined ? {} : { endpoint: storageS3Endpoint }),
      region: storageS3Region,
      bucket: storageS3Bucket,
      forcePathStyle: parseBoolean(
        issues,
        "STORAGE_S3_FORCE_PATH_STYLE",
        environment.STORAGE_S3_FORCE_PATH_STYLE,
        false,
      ),
      accessKeyId: storageS3AccessKeyId ?? "",
      secretAccessKey: storageS3SecretAccessKey ?? "",
    };
  }
  const auth = {
    studentSessionAbsoluteTtlSeconds,
    studentSessionIdleTtlSeconds,
    adminSessionAbsoluteTtlSeconds,
    adminSessionIdleTtlSeconds,
    emailVerificationTtlSeconds: parsePositiveInteger(
      issues,
      "AUTH_EMAIL_VERIFICATION_TTL_SECONDS",
      environment.AUTH_EMAIL_VERIFICATION_TTL_SECONDS,
      86_400,
    ),
    passwordResetTtlSeconds: parsePositiveInteger(
      issues,
      "AUTH_PASSWORD_RESET_TTL_SECONDS",
      environment.AUTH_PASSWORD_RESET_TTL_SECONDS,
      1_800,
    ),
    rateLimitEnabled: parseBoolean(
      issues,
      "AUTH_RATE_LIMIT_ENABLED",
      environment.AUTH_RATE_LIMIT_ENABLED,
      true,
    ),
    emailDeliveryMode,
    termsVersion: parseRequiredText(issues, "TERMS_VERSION", environment.TERMS_VERSION, "2026-08"),
    privacyVersion: parseRequiredText(
      issues,
      "PRIVACY_VERSION",
      environment.PRIVACY_VERSION,
      "2026-08",
    ),
    ...(authEmailPayloadKey === undefined ? {} : { emailPayloadKey: authEmailPayloadKey }),
  } satisfies Omit<AppConfig["auth"], "smtp">;

  if (emailDeliveryMode !== "disabled" && authEmailPayloadKey === undefined) {
    pushIssue(
      issues,
      "AUTH_EMAIL_PAYLOAD_KEY",
      "missing",
      "is required when auth email delivery is enabled",
    );
  }
  if (emailDeliveryMode === "smtp") {
    if (smtpHost.length === 0) {
      pushIssue(issues, "SMTP_HOST", "missing", "is required in smtp delivery mode");
    }
    if (smtpFromAddress === undefined) {
      pushIssue(issues, "SMTP_FROM_ADDRESS", "missing", "is required in smtp delivery mode");
    }
    if (smtpPassword === undefined || smtpPassword.length === 0) {
      pushIssue(issues, "SMTP_PASSWORD", "missing", "is required in smtp delivery mode");
    }
  }

  const config: AppConfig = {
    nodeEnv,
    serviceName: serviceName.length === 0 ? "unknown-service" : serviceName,
    appName: appName.length === 0 ? "ITQANAK" : appName,
    defaultLocale,
    publicAppUrl,
    adminAppUrl,
    academicIntegrityVersion: parseRequiredText(
      issues,
      "ACADEMIC_INTEGRITY_VERSION",
      environment.ACADEMIC_INTEGRITY_VERSION,
      "2026-08",
    ),
    migrationsDirectory: (environment.MIGRATIONS_DIR ?? "migrations").trim() || "migrations",
    logLevel,
    whatsapp: {
      mode: whatsappMode,
      ...(whatsappPhoneNumberId ? { phoneNumberId: whatsappPhoneNumberId } : {}),
      ...(whatsappTemplateName ? { templateName: whatsappTemplateName } : {}),
      templateLanguage: whatsappTemplateLanguage,
      graphApiVersion: whatsappGraphApiVersion,
      ...(whatsappSupportRecipientE164
        ? { supportRecipientE164: whatsappSupportRecipientE164 }
        : {}),
      maxAttempts: whatsappMaxAttempts,
      ...(normalizedWhatsAppNotificationsNotBefore
        ? { notificationsNotBefore: normalizedWhatsAppNotificationsNotBefore }
        : {}),
    },
    storage: {
      driver: storageDriver,
      localPath: storageLocalPath,
      maxFileBytes,
      maxFilesPerRequest,
      maxTotalBytesPerRequest,
      ...(storageS3 === undefined ? {} : { s3: storageS3 }),
    },
    fileScanning: {
      mode: fileScanMode,
      clamavHost: parseRequiredText(issues, "CLAMAV_HOST", environment.CLAMAV_HOST, "clamav"),
      clamavPort: parsePositiveInteger(issues, "CLAMAV_PORT", environment.CLAMAV_PORT, 3310),
      connectTimeoutMs: parsePositiveInteger(
        issues,
        "CLAMAV_CONNECT_TIMEOUT_MS",
        environment.CLAMAV_CONNECT_TIMEOUT_MS,
        3_000,
      ),
      scanTimeoutMs: parsePositiveInteger(
        issues,
        "CLAMAV_SCAN_TIMEOUT_MS",
        environment.CLAMAV_SCAN_TIMEOUT_MS,
        30_000,
      ),
      maxAttempts: parsePositiveInteger(
        issues,
        "FILE_SCAN_MAX_ATTEMPTS",
        environment.FILE_SCAN_MAX_ATTEMPTS,
        5,
      ),
    },
    operationalControls: { maintenanceCacheTtlMs },
    auth: {
      ...auth,
      ...(emailDeliveryMode !== "smtp" ||
      smtpFromAddress === undefined ||
      smtpPassword === undefined
        ? {}
        : {
            smtp: {
              host: smtpHost,
              port: smtpPort,
              secure: smtpSecure,
              fromName: smtpFromName,
              fromAddress: smtpFromAddress,
              password: smtpPassword,
            },
          }),
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
    ...(whatsappAccessToken === undefined || whatsappAccessToken.length === 0
      ? {}
      : { whatsappAccessToken }),
  };

  if (config.fileScanning.clamavPort > 65_535) {
    pushIssue(issues, "CLAMAV_PORT", "invalid", "must be a valid TCP port");
  }
  if (config.fileScanning.connectTimeoutMs > 60_000) {
    pushIssue(issues, "CLAMAV_CONNECT_TIMEOUT_MS", "invalid", "must not exceed 60000");
  }
  if (config.fileScanning.scanTimeoutMs > 300_000) {
    pushIssue(issues, "CLAMAV_SCAN_TIMEOUT_MS", "invalid", "must not exceed 300000");
  }
  if (config.fileScanning.maxAttempts > 20) {
    pushIssue(issues, "FILE_SCAN_MAX_ATTEMPTS", "invalid", "must not exceed 20");
  }

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
  if (requirements.authEmailPayloadKey === true && config.auth.emailPayloadKey === undefined) {
    pushIssue(issues, "AUTH_EMAIL_PAYLOAD_KEY", "missing", "is required by this service");
  }

  assertProductionSafety(config, requirements, issues);
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
    academicIntegrityVersion: config.academicIntegrityVersion,
    migrationsDirectory: config.migrationsDirectory,
    logLevel: config.logLevel,
    whatsapp: config.whatsapp,
    storage: {
      driver: config.storage.driver,
      maxFileBytes: config.storage.maxFileBytes,
      maxFilesPerRequest: config.storage.maxFilesPerRequest,
      maxTotalBytesPerRequest: config.storage.maxTotalBytesPerRequest,
      hasLocalPath: config.storage.localPath.length > 0,
      hasS3Configuration: config.storage.s3 !== undefined,
    },
    fileScanning: { mode: config.fileScanning.mode },
    operationalControls: config.operationalControls,
    auth: {
      studentSessionAbsoluteTtlSeconds: config.auth.studentSessionAbsoluteTtlSeconds,
      studentSessionIdleTtlSeconds: config.auth.studentSessionIdleTtlSeconds,
      adminSessionAbsoluteTtlSeconds: config.auth.adminSessionAbsoluteTtlSeconds,
      adminSessionIdleTtlSeconds: config.auth.adminSessionIdleTtlSeconds,
      emailVerificationTtlSeconds: config.auth.emailVerificationTtlSeconds,
      passwordResetTtlSeconds: config.auth.passwordResetTtlSeconds,
      rateLimitEnabled: config.auth.rateLimitEnabled,
      emailDeliveryMode: config.auth.emailDeliveryMode,
      termsVersion: config.auth.termsVersion,
      privacyVersion: config.auth.privacyVersion,
      hasSmtpConfiguration: config.auth.smtp !== undefined,
    },
    hasDatabaseUrl: config.databaseUrl !== undefined,
    hasRedisUrl: config.redisUrl !== undefined,
    hasSessionSecret: config.sessionSecret !== undefined,
    hasAuthEmailPayloadKey: config.auth.emailPayloadKey !== undefined,
    hasWhatsAppAccessToken: config.whatsappAccessToken !== undefined,
  };
}
