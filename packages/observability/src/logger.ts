import { redact, type RedactedValue, type RedactionOptions } from "./redact.js";

export const logLevels = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

export interface LogFields {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly durationMs?: number;
  readonly [key: string]: unknown;
}

export interface LoggerOptions {
  readonly service: string;
  readonly environment: string;
  readonly level?: LogLevel;
  readonly fields?: LogFields;
  readonly redact?: RedactionOptions;
  /** A testable destination for one complete JSON line. */
  readonly write?: (line: string) => void;
  readonly now?: () => Date;
}

export interface Logger {
  readonly service: string;
  readonly environment: string;
  child(fields: LogFields): Logger;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  log(level: LogLevel, event: string, fields?: LogFields): void;
  time<T>(event: string, operation: () => T, fields?: LogFields): T;
  timeAsync<T>(event: string, operation: () => Promise<T>, fields?: LogFields): Promise<T>;
}

type LogRecord = {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly environment: string;
  readonly event: string;
  readonly [key: string]: RedactedValue | LogLevel;
};

const levelWeight: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function defaultWrite(line: string): void {
  process.stdout.write(`${line}\n`);
}

function asObject(value: RedactedValue): Record<string, RedactedValue> {
  if (value !== null && !Array.isArray(value) && typeof value === "object") {
    return { ...(value as Readonly<Record<string, RedactedValue>>) };
  }
  return { value };
}

class JsonLogger implements Logger {
  public readonly service: string;
  public readonly environment: string;

  private readonly threshold: number;
  private readonly fields: LogFields;
  private readonly redaction: RedactionOptions;
  private readonly write: (line: string) => void;
  private readonly now: () => Date;

  public constructor(options: LoggerOptions) {
    this.service = options.service;
    this.environment = options.environment;
    this.threshold = levelWeight[options.level ?? "info"];
    this.fields = options.fields ?? {};
    this.redaction = options.redact ?? {};
    this.write = options.write ?? defaultWrite;
    this.now = options.now ?? (() => new Date());
  }

  public child(fields: LogFields): Logger {
    return new JsonLogger({
      service: this.service,
      environment: this.environment,
      level: this.level,
      fields: { ...this.fields, ...fields },
      redact: this.redaction,
      write: this.write,
      now: this.now,
    });
  }

  public debug(event: string, fields: LogFields = {}): void {
    this.log("debug", event, fields);
  }

  public info(event: string, fields: LogFields = {}): void {
    this.log("info", event, fields);
  }

  public warn(event: string, fields: LogFields = {}): void {
    this.log("warn", event, fields);
  }

  public error(event: string, fields: LogFields = {}): void {
    this.log("error", event, fields);
  }

  public log(level: LogLevel, event: string, fields: LogFields = {}): void {
    if (levelWeight[level] < this.threshold) {
      return;
    }

    const redactedFields = asObject(redact({ ...this.fields, ...fields }, this.redaction));
    const record: LogRecord = {
      timestamp: this.now().toISOString(),
      level,
      service: this.service,
      environment: this.environment,
      event,
      ...redactedFields,
    };
    this.write(JSON.stringify(record));
  }

  public time<T>(event: string, operation: () => T, fields: LogFields = {}): T {
    const startedAt = Date.now();
    try {
      const result = operation();
      this.info(event, { ...fields, durationMs: Date.now() - startedAt });
      return result;
    } catch (error: unknown) {
      this.error(event, { ...fields, durationMs: Date.now() - startedAt, error });
      throw error;
    }
  }

  public async timeAsync<T>(
    event: string,
    operation: () => Promise<T>,
    fields: LogFields = {},
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await operation();
      this.info(event, { ...fields, durationMs: Date.now() - startedAt });
      return result;
    } catch (error: unknown) {
      this.error(event, { ...fields, durationMs: Date.now() - startedAt, error });
      throw error;
    }
  }

  private get level(): LogLevel {
    return logLevels.find((candidate) => levelWeight[candidate] === this.threshold) ?? "info";
  }
}

export function createLogger(options: LoggerOptions): Logger {
  if (options.service.trim().length === 0) {
    throw new Error("Logger service must not be empty.");
  }
  if (options.environment.trim().length === 0) {
    throw new Error("Logger environment must not be empty.");
  }
  return new JsonLogger(options);
}
