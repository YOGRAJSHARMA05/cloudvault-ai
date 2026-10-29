import { createLogger } from "@/lib/logger";

const log = createLogger("security/rate-limit");

export type RateLimitBackend = "redis" | "local";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  backend: RateLimitBackend;
};

type RedisRestConfig = {
  url: string;
  token: string;
};

const REDIS_TIMEOUT_MS = 1_000;
const REDIS_WARNING_COOLDOWN_MS = 60_000;

const buckets = new Map<string, { count: number; resetAt: number }>();
let lastRedisWarning = 0;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/**
 * Returns the first complete Redis REST pair. Upstash, Vercel KV, and generic
 * REST proxies are supported without adding a client dependency.
 */
function getRedisConfig(): RedisRestConfig | null {
  const pairs: Array<[string, string]> = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["REDIS_REST_URL", "REDIS_REST_TOKEN"],
  ];
  for (const [urlKey, tokenKey] of pairs) {
    const url = env(urlKey);
    const token = env(tokenKey);
    if (url && token) return { url: url.replace(/\/+$/, ""), token };
  }
  return null;
}

export function getRateLimitBackend(): RateLimitBackend {
  return getRedisConfig() ? "redis" : "local";
}

function warnRedisFailure(error: unknown): void {
  const now = Date.now();
  if (now - lastRedisWarning < REDIS_WARNING_COOLDOWN_MS) return;
  lastRedisWarning = now;
  log.warn("Shared rate-limit store unavailable; using the in-process fallback", error);
}

/** Evicts expired buckets so a busy instance does not grow unbounded. */
function sweepExpired(now: number): void {
  if (buckets.size <= 10_000) return;
  for (const [bucketKey, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
}

/**
 * In-process fixed-window limiter. Protects a single instance and acts as the
 * automatic fallback when Redis is not configured or temporarily unavailable.
 */
export function checkLocalRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0, backend: "local" };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      backend: "local",
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds: 0,
    backend: "local",
  };
}

type PipelineEntry = { result?: unknown; error?: string };

async function redisCommand(
  config: RedisRestConfig,
  command: Array<string | number>,
): Promise<unknown> {
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command]),
    cache: "no-store",
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Redis REST request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as PipelineEntry[];
  const entry = payload[0];
  if (!entry || entry.error) {
    throw new Error(entry?.error ?? "Redis REST returned an empty response.");
  }
  return entry.result;
}

/**
 * Fixed-window limiter backed by a Redis REST endpoint. INCR is atomic across
 * instances; the expiry is refreshed so a bucket can never become stranded
 * without a TTL. Failures fall back to the in-process limiter.
 */
async function checkRedisRateLimit(
  config: RedisRestConfig,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const [rawCount, rawTtl] = await Promise.all([
    redisCommand(config, ["INCR", key]),
    redisCommand(config, ["PEXPIRE", key, windowMs]),
  ]);
  const count = Number(rawCount);
  if (!Number.isFinite(count)) throw new Error("Redis REST returned a non-numeric counter.");
  const ttl = Number(rawTtl);

  const remaining = Math.max(0, limit - count);
  if (count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Number.isFinite(ttl) && ttl > 0 ? Math.ceil(ttl / 1000) : Math.ceil(windowMs / 1000),
      backend: "redis",
    };
  }

  return { allowed: true, remaining, retryAfterSeconds: 0, backend: "redis" };
}

/**
 * Checks a fixed-window limit against Redis when configured, otherwise against
 * the in-process store. The returned `backend` makes the active store visible
 * in logs and the health endpoint.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const config = getRedisConfig();
  if (!config) return checkLocalRateLimit(key, limit, windowMs);

  try {
    return await checkRedisRateLimit(config, key, limit, windowMs);
  } catch (error) {
    warnRedisFailure(error);
    return checkLocalRateLimit(key, limit, windowMs);
  }
}

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

/** Test helper; clears in-process counters and the Redis warning cooldown. */
export function resetRateLimitState(): void {
  buckets.clear();
  lastRedisWarning = 0;
}
