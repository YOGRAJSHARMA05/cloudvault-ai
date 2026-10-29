type LogLevel = "debug" | "info" | "warn" | "error";

type LogFormat = "json" | "pretty";

type LogFields = Record<string, unknown>;

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[redacted]";
const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|private/i;
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;

function readLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function readFormat(): LogFormat {
  const configured = process.env.LOG_FORMAT?.trim().toLowerCase();
  if (configured === "json" || configured === "pretty") return configured;
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

const activeLevel = LEVEL_WEIGHTS[readLevel()];
const activeFormat = readFormat();

function serializeError(error: Error): LogFields {
  return {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
    ...("digest" in error && typeof error.digest === "string" ? { digest: error.digest } : {}),
  };
}

function sanitize(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return serializeError(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  // Only references on the current path count as cycles; repeated siblings are
  // still rendered in full.
  if (seen.has(value)) return "[circular]";

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1, seen));
    }

    const result: LogFields = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      result[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(entry, depth + 1, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

/**
 * Normalizes the extra arguments passed to a log method. `Error` instances are
 * serialized, plain objects are merged, and primitives are stored under `detail`.
 */
function normalizeArgs(args: unknown[]): LogFields {
  const fields: LogFields = {};
  const details: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      fields.error = serializeError(arg);
    } else if (arg && typeof arg === "object" && !Array.isArray(arg)) {
      Object.assign(fields, sanitize(arg) as LogFields);
    } else if (arg !== undefined) {
      details.push(sanitize(arg));
    }
  }

  if (details.length === 1) fields.detail = details[0];
  else if (details.length > 1) fields.details = details;
  return fields;
}

function write(level: LogLevel, scope: string, message: string, args: unknown[]): void {
  if (LEVEL_WEIGHTS[level] < activeLevel) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    scope,
    message,
    service: "cloudvault-ai",
    environment: process.env.NODE_ENV ?? "development",
    ...normalizeArgs(args),
  };

  const line =
    activeFormat === "json"
      ? JSON.stringify(entry)
      : `${entry.time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${
          Object.keys(entry).length > 6
            ? ` ${JSON.stringify(
                Object.fromEntries(
                  Object.entries(entry).filter(
                    ([key]) =>
                      !["time", "level", "scope", "message", "service", "environment"].includes(key),
                  ),
                ),
              )}`
            : ""
        }`;

  try {
    if (level === "error" || level === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  } catch {
    // Logging must never crash a request.
  }
}

export type Logger = {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

/** Creates a logger that tags every entry with a stable scope name. */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, ...args) => write("debug", scope, message, args),
    info: (message, ...args) => write("info", scope, message, args),
    warn: (message, ...args) => write("warn", scope, message, args),
    error: (message, ...args) => write("error", scope, message, args),
  };
}

export const logger = createLogger("app");
