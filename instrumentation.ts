import type { Instrumentation } from "next";

/**
 * Runs once per server instance before it starts accepting requests. Validates
 * the environment (failing fast on critical production mistakes) and emits a
 * single structured startup line describing the active integrations.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ assertProductionEnv }, { createLogger }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/logger"),
  ]);
  const log = createLogger("runtime");

  const report = assertProductionEnv();

  log.info("CloudVault AI starting", {
    version: report.summary.version,
    environment: report.environment,
    storage: report.summary.storageBackend,
    rateLimit: report.summary.rateLimitBackend,
    database: report.summary.databaseConfigured ? "configured" : "missing",
    aiProvider: report.summary.aiProviderConfigured ? "configured" : "local",
    logLevel: report.summary.logLevel,
    logFormat: report.summary.logFormat,
  });

  for (const issue of report.issues) {
    const fields = { key: issue.key, severity: issue.severity };
    if (issue.severity === "error") log.error(issue.message, fields);
    else log.warn(issue.message, fields);
  }
}

/**
 * Forwards framework-captured server errors to the structured logger. Keep this
 * free of request headers: they can contain cookies and authorization tokens.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { createLogger } = await import("@/lib/logger");
  const log = createLogger("request-error");
  const digest =
    error && typeof error === "object" && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : undefined;

  log.error("Unhandled server error", error, {
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    ...(digest ? { digest } : {}),
  });
};
