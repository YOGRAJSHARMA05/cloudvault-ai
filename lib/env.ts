import { z } from "zod";

/**
 * Runtime environment validation.
 *
 * Required values are only enforced when `NODE_ENV=production`; local
 * development stays usable with the minimal `.env.example` setup. Parsing is
 * cached, non-throwing, and never includes secret values in its report so it can
 * safely be reused by the health endpoint and startup instrumentation.
 */

const optionalString = z.string().trim().optional();

const urlString = z
  .string()
  .trim()
  .optional()
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid http(s) URL.");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_VERSION: optionalString,

  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required."),
  AUTH_SECRET: z.string().trim().min(16, "AUTH_SECRET must be at least 16 characters.").optional(),
  AUTH_URL: urlString,
  NEXTAUTH_URL: urlString,
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  SHARE_SECRET: z.string().trim().min(16).optional(),

  NEXT_PUBLIC_SUPABASE_URL: urlString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: optionalString,

  CLOUDVAULT_STORAGE_DIR: optionalString,

  UPSTASH_REDIS_REST_URL: urlString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  KV_REST_API_URL: urlString,
  KV_REST_API_TOKEN: optionalString,
  REDIS_REST_URL: urlString,
  REDIS_REST_TOKEN: optionalString,

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", ""]).optional(),
  LOG_FORMAT: z.enum(["json", "pretty", ""]).optional(),
  HEALTH_CHECK_TOKEN: optionalString,

  AI_PROVIDER: z.enum(["auto", "openai", "gemini", "local", "google", ""]).optional(),
  AI_EMBEDDING_PROVIDER: z.enum(["auto", "openai", "gemini", "local", "google", ""]).optional(),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().optional(),
  AI_MAX_CONTEXT_CHARS: z.coerce.number().int().positive().optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  OPENAI_API_KEY: optionalString,
  OPENAI_CHAT_MODEL: optionalString,
  OPENAI_EMBEDDING_MODEL: optionalString,
  OPENAI_BASE_URL: urlString,
  GEMINI_API_KEY: optionalString,
  GEMINI_CHAT_MODEL: optionalString,
  GEMINI_EMBEDDING_MODEL: optionalString,
  GEMINI_BASE_URL: urlString,

  MALWARE_SCAN_URL: urlString,
  MALWARE_SCAN_TOKEN: optionalString,
});

export type Env = z.infer<typeof envSchema>;

export type EnvIssue = {
  key: string;
  message: string;
  severity: "error" | "warning";
};

export type EnvReport = {
  ok: boolean;
  environment: Env["NODE_ENV"];
  issues: EnvIssue[];
  /** Safe, non-secret summary used by the health endpoint and startup logs. */
  summary: {
    version: string;
    databaseConfigured: boolean;
    authConfigured: boolean;
    googleAuthConfigured: boolean;
    storageBackend: "supabase" | "local";
    shareSecretConfigured: boolean;
    rateLimitBackend: "redis" | "local";
    logLevel: string;
    logFormat: string;
    aiProviderConfigured: boolean;
    healthCheckTokenConfigured: boolean;
  };
};

let cached: EnvReport | null = null;

function storageBackend(env: Env): "supabase" | "local" {
  const hasUrl = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
  const hasKey = Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY);
  return hasUrl && hasKey ? "supabase" : "local";
}

function redisConfigured(env: Env): boolean {
  return Boolean(
    (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) ||
      (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) ||
      (env.REDIS_REST_URL && env.REDIS_REST_TOKEN),
  );
}

function aiConfigured(env: Env): boolean {
  return Boolean(
    env.OPENAI_API_KEY ||
      env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GOOGLE_API_KEY,
  );
}

function buildReport(env: Env, issues: EnvIssue[]): EnvReport {
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    environment: env.NODE_ENV,
    issues,
    summary: {
      version: env.APP_VERSION || "0.1.0",
      databaseConfigured: Boolean(env.DATABASE_URL),
      authConfigured: Boolean(env.AUTH_SECRET),
      googleAuthConfigured: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
      storageBackend: storageBackend(env),
      shareSecretConfigured: Boolean(env.SHARE_SECRET || env.AUTH_SECRET),
      rateLimitBackend: redisConfigured(env) ? "redis" : "local",
      logLevel: (env.LOG_LEVEL || (env.NODE_ENV === "production" ? "info" : "debug")),
      logFormat: (env.LOG_FORMAT || (env.NODE_ENV === "production" ? "json" : "pretty")),
      aiProviderConfigured: aiConfigured(env),
      healthCheckTokenConfigured: Boolean(env.HEALTH_CHECK_TOKEN),
    },
  };
}

function collectWarnings(env: Env, issues: EnvIssue[]): void {
  const add = (key: string, message: string) => issues.push({ key, message, severity: "warning" });

  if (env.NODE_ENV === "production") {
    if (!env.AUTH_SECRET) add("AUTH_SECRET", "Set AUTH_SECRET in production.");
    if (!env.AUTH_URL && !env.NEXTAUTH_URL) {
      add("AUTH_URL", "Set AUTH_URL to the public origin so callbacks and cookies are correct.");
    }
  }

  if (Boolean(env.AUTH_GOOGLE_ID) !== Boolean(env.AUTH_GOOGLE_SECRET)) {
    add("AUTH_GOOGLE_ID", "Google sign-in requires both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.");
  }

  const supabaseUrl = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY);
  if (supabaseUrl !== supabaseKey) {
    add(
      "NEXT_PUBLIC_SUPABASE_URL",
      "Supabase Storage requires NEXT_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY; falling back to local disk until both are set.",
    );
  }

  const redisPairs = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["REDIS_REST_URL", "REDIS_REST_TOKEN"],
  ] as const;
  for (const [urlKey, tokenKey] of redisPairs) {
    if (Boolean(env[urlKey]) !== Boolean(env[tokenKey])) {
      add(tokenKey, `${urlKey} and ${tokenKey} must be set together; using the in-process limiter.`);
    }
  }

  if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    add("OPENAI_API_KEY", "AI_PROVIDER=openai has no key; chat falls back to local mode.");
  }
  if (env.AI_PROVIDER === "gemini" && !(env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    add("GEMINI_API_KEY", "AI_PROVIDER=gemini has no key; chat falls back to local mode.");
  }
  if (env.NODE_ENV === "production" && storageBackend(env) === "local") {
    add(
      "CLOUDVAULT_STORAGE_DIR",
      "Local file storage is ephemeral on serverless hosts and not shared between instances. Configure Supabase Storage or mount a durable volume.",
    );
  }
}

/** Parses and validates the environment once. Never throws. */
export function getEnvReport(): EnvReport {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues: EnvIssue[] = parsed.error.issues.map((issue) => ({
      key: issue.path.join(".") || "environment",
      message: issue.message,
      severity: "error" as const,
    }));
    cached = buildReport(
      {
        NODE_ENV: (process.env.NODE_ENV as Env["NODE_ENV"]) ?? "development",
        DATABASE_URL: process.env.DATABASE_URL ?? "",
      } as Env,
      issues,
    );
    return cached;
  }

  const issues: EnvIssue[] = [];
  collectWarnings(parsed.data, issues);
  cached = buildReport(parsed.data, issues);
  return cached;
}

/** Resets the memoized report. Intended for tests and for `next dev` reloads. */
export function resetEnvReport(): void {
  cached = null;
}

export class EnvironmentError extends Error {
  readonly issues: EnvIssue[];

  constructor(issues: EnvIssue[]) {
    super(
      `Invalid environment configuration: ${issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => `${issue.key}: ${issue.message}`)
        .join("; ")}`,
    );
    this.issues = issues;
    this.name = "EnvironmentError";
  }
}

/**
 * Fails fast in production when critical configuration is missing. Called once
 * from `instrumentation.ts` before the server accepts requests.
 */
export function assertProductionEnv(): EnvReport {
  const report = getEnvReport();
  if (process.env.NODE_ENV === "production" && !report.ok) {
    throw new EnvironmentError(report.issues);
  }
  return report;
}
