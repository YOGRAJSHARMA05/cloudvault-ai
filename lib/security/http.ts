import { NextResponse } from "next/server";
import {
  checkRateLimit,
  getRequestIp,
  type RateLimitResult,
} from "@/lib/security/rate-limit";

function headersFor(result: RateLimitResult, limit: number): HeadersInit {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Backend": result.backend,
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
    headers["X-RateLimit-Reset"] = String(result.retryAfterSeconds);
  }
  return headers;
}

/**
 * Applies a per-caller rate limit. Uses the shared Redis store when configured
 * and transparently falls back to the in-process limiter.
 */
export async function applyRateLimit(
  request: Request,
  key: string,
  limit = 30,
  windowMs = 60_000,
): Promise<NextResponse | null> {
  const result = await checkRateLimit(
    `${key}:${getRequestIp(request)}`,
    limit,
    windowMs,
  );
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: headersFor(result, limit),
    },
  );
}
