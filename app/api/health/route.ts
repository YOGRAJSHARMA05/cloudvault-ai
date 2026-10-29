import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { getAiConfig, providerLabel } from "@/lib/ai/config";
import { getEnvReport } from "@/lib/env";
import { checkStorageHealth } from "@/lib/file-storage";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRateLimitBackend } from "@/lib/security/rate-limit";

const log = createLogger("api/health");

const PROBE_TIMEOUT_MS = 3_000;
const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

type CheckState = "up" | "down";

type Check = {
  status: CheckState;
  latencyMs?: number;
  detail?: string;
};

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out after ${ms} ms.`)), ms).unref?.();
  });
}

async function probeDatabase(): Promise<Check> {
  const started = Date.now();
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout(PROBE_TIMEOUT_MS)]);
    return { status: "up", latencyMs: Date.now() - started };
  } catch (error) {
    return { status: "down", detail: error instanceof Error ? error.message : "Database probe failed." };
  }
}

async function probeStorage(): Promise<Check & { backend: string }> {
  const configuredBackend = getEnvReport().summary.storageBackend;
  const started = Date.now();
  try {
    const backend = await checkStorageHealth();
    return { status: "up", latencyMs: Date.now() - started, backend };
  } catch (error) {
    return {
      status: "down",
      backend: configuredBackend,
      detail: error instanceof Error ? error.message : "Storage probe failed.",
    };
  }
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.HEALTH_CHECK_TOKEN?.trim();
  if (!expected) return true;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

async function buildHealth() {
  const env = getEnvReport();
  const [database, storage] = await Promise.all([probeDatabase(), probeStorage()]);
  const ai = getAiConfig();
  const configErrors = env.issues.filter((issue) => issue.severity === "error");
  const configWarnings = env.issues.filter((issue) => issue.severity === "warning");

  const hardFailure = database.status === "down" || storage.status === "down" || configErrors.length > 0;
  const status = hardFailure ? "error" : configWarnings.length ? "degraded" : "ok";

  return {
    status,
    version: env.summary.version,
    environment: env.environment,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      database,
      storage,
      rateLimit: {
        status: "up" as const,
        backend: getRateLimitBackend(),
      },
      ai: {
        status: ai.chat.provider === "local" ? ("degraded" as const) : ("up" as const),
        provider: ai.chat.provider,
        label: providerLabel(ai.chat.provider),
        model: ai.chat.model,
        embeddings: {
          provider: ai.embedding.provider,
          model: ai.embedding.model,
          dimensions: ai.embedding.dimensions,
        },
        dailyRequestLimit: ai.dailyRequestLimit,
      },
      configuration: {
        status: configErrors.length ? ("invalid" as const) : ("valid" as const),
        errors: configErrors,
        warnings: configWarnings,
      },
    },
  };
}

export async function GET(request: Request) {
  // Opts the route into request-time rendering under Cache Components.
  await connection();

  if (!isAuthorized(request)) {
    return Response.json(
      { status: "unauthorized" },
      { status: 401, headers: noStore },
    );
  }

  try {
    const health = await buildHealth();
    if (health.status === "error") {
      log.warn("Health check reported a degraded service", {
        database: health.checks.database.status,
        storage: health.checks.storage.status,
        configuration: health.checks.configuration.status,
      });
    }
    return Response.json(health, {
      status: health.status === "error" ? 503 : 200,
      headers: noStore,
    });
  } catch (error) {
    log.error("Health check failed", error);
    return Response.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503, headers: noStore },
    );
  }
}

export async function HEAD(request: Request) {
  await connection();

  if (!isAuthorized(request)) {
    return new Response(null, { status: 401, headers: noStore });
  }
  try {
    const health = await buildHealth();
    return new Response(null, {
      status: health.status === "error" ? 503 : 200,
      headers: noStore,
    });
  } catch (error) {
    log.error("Health check failed", error);
    return new Response(null, { status: 503, headers: noStore });
  }
}
