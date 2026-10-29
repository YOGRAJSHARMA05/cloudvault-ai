# Production & operations runbook

This document covers deployment, observability, scaling, and recovery for CloudVault AI. For local setup and the environment reference, see the [README](../README.md).

## 1. Pre-deployment checklist

- [ ] `DATABASE_URL` points at a managed PostgreSQL instance with automated backups.
- [ ] `AUTH_SECRET` is unique per environment (`openssl rand -base64 32`).
- [ ] `AUTH_URL` is the public HTTPS origin; OAuth redirect URIs match it.
- [ ] `npm run db:deploy` has applied all committed migrations.
- [ ] Storage is durable: Supabase Storage configured, or `CLOUDVAULT_STORAGE_DIR` mounted on a persistent volume.
- [ ] `LOG_FORMAT=json` and `LOG_LEVEL=info` (the defaults in production).
- [ ] A Redis REST pair is configured if more than one instance runs.
- [ ] `/api/health` returns `200` and `status` is `ok` or `degraded`; monitor it externally.
- [ ] `HEALTH_CHECK_TOKEN` is set if the health endpoint must not be public.
- [ ] `npm run check` passes in CI.
- [ ] Upstream proxy strips client-supplied `X-Forwarded-For` headers and terminates TLS.

## 2. Environment matrix

| Variable | Local | Preview | Production |
| --- | --- | --- | --- |
| `DATABASE_URL` | Local/Neon dev DB | Branch DB | Managed Postgres |
| `AUTH_SECRET` | Generated | Generated | Generated, rotated on compromise |
| `AUTH_URL` | `http://localhost:3000` | Preview URL | Public HTTPS origin |
| `AUTH_GOOGLE_*` | Optional | Optional | Optional |
| Supabase Storage | Optional | Recommended | Required unless a durable volume is mounted |
| `CLOUDVAULT_STORAGE_DIR` | Default | — | Volume path when not using Supabase |
| Redis REST pair | Optional | Recommended | Required for multi-instance |
| `LOG_LEVEL` | `debug` | `info` | `info` |
| `LOG_FORMAT` | `pretty` | `json` | `json` |
| `AI_PROVIDER` | `auto` | `auto` | `auto` or explicit provider |

Startup validation logs a single structured summary. In production, a missing `DATABASE_URL` or invalid schema aborts startup before requests are served, so deploys fail loudly instead of serving a broken app.

## 3. Database

### Migrations

```bash
# development
npm run db:migrate

# production / CI
npm run db:deploy
```

- Migrations are forward-only. Review generated SQL in `prisma/migrations/` before deploying.
- Run `db:deploy` as a release step, before new application instances receive traffic.
- Keep a connection pooler (PgBouncer, Neon pooler, Supabase pooler) in front of Postgres for serverless deployments. Use a pooled URL for the app and a direct URL for migrations.

### Backups and recovery

1. Enable point-in-time recovery on the managed database.
2. Take a logical backup before risky migrations: `pg_dump "$DATABASE_URL" > backup.sql`.
3. Restore into a new database, run `db:deploy`, and switch `DATABASE_URL`.
4. Test restore procedures quarterly.

Deleted files are retained in the trash until purged. Database backups are the only protection after a permanent purge.

## 4. Object storage

### Supabase Storage

1. Create a project and set `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`.
2. The bucket named by `SUPABASE_STORAGE_BUCKET` (default `cloudvault`) is created automatically if missing.
3. Keep the bucket **private**. Files are served through `/api/files/<id>/signed-url`, which returns a short-lived signed URL after an authorization check.
4. The service role key bypasses row-level security; it must remain server-only.

Verify connectivity through `/api/health` (`checks.storage.backend` should be `supabase`).

### Local disk

- Set `CLOUDVAULT_STORAGE_DIR` to a mounted persistent volume.
- Back up the directory alongside the database; DB rows are useless without the stored bytes.
- On serverless platforms local disk is ephemeral — do not use it in production without a volume.

## 5. Rate limiting

The limiter uses a fixed window:

- **Redis configured** — `INCR` + `PEXPIRE` through `POST {url}/pipeline`, shared by every instance. Fixed-window counters are approximate at boundaries, which is acceptable for abuse protection.
- **No Redis** — an in-process `Map` per instance. Fine for a single container; ineffective behind a load balancer with multiple instances.
- **Redis failure** — falls back to the in-process limiter, logs a warning at most once per minute, and never fails closed.

Throttled requests return `429` with `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Backend`, and `Retry-After`; `/api/health` reports the active backend under `checks.rateLimit`.

Set up Redis with Upstash or Vercel KV and copy the REST URL/token pair. No Redis client package is required.

## 6. Logging

Logs are structured and include `time`, `level`, `scope`, `message`, `service`, and `environment`.

```json
{"time":"2026-10-29T10:00:00.000Z","level":"error","scope":"api:ai:chat","message":"Chat streaming failed","service":"cloudvault-ai","environment":"production","error":{"name":"AiProviderError","message":"..."}}
```

- `LOG_LEVEL` filters entries. `debug` includes request-level detail; `info` is recommended in production.
- Sensitive keys (`password`, `secret`, `token`, `apiKey`, `authorization`, `cookie`, `session`, `private`) are redacted recursively.
- Stack traces are included outside production only; use digests and error names for production triage.
- `instrumentation.ts` reports unhandled server errors with path, method, route, and render context — never request headers.

### Suggested alerts

| Signal | Condition | Action |
| --- | --- | --- |
| Health | `/api/health` non-200 for 3 minutes | Page on-call |
| Database latency | `checks.database.latencyMs` above baseline | Inspect pool saturation |
| Storage failures | `checks.storage.status = down` | Check Supabase status/keys |
| Redis fallback | Repeated rate-limit warnings | Verify Redis REST credentials |
| AI errors | Elevated provider error logs | Confirm quota/key; local fallback keeps chat available |

## 7. Health checks

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Full JSON report. `200` when ok/degraded, `503` when a hard check fails. |
| `HEAD /api/health` | Status code only, for load balancers. |

Checks: database (`SELECT 1` with a 3s timeout), storage (bucket exists or local directory writable), rate-limit backend, AI provider configuration, and environment validity. When `HEALTH_CHECK_TOKEN` is set, requests must include `Authorization: Bearer <token>`.

The Docker image includes a `HEALTHCHECK` that calls this endpoint.

## 8. Container deployment

```bash
docker build -t cloudvault-ai .
docker run --env-file .env.production -p 3000:3000 \
  --read-only --tmpfs /tmp \
  -v cloudvault-storage:/app/storage \
  cloudvault-ai
```

- The image runs as the unprivileged `nextjs` user.
- Build output is a standalone server; `public` and `.next/static` are copied in.
- The Prisma client and engines are copied from the builder stage.
- Run migrations in CI or a one-off job with the Prisma CLI, not in the runtime image.
- Terminate TLS at a reverse proxy (nginx, Caddy, ALB) and forward `X-Forwarded-For`; the app trusts the first forwarded address.

### Scaling

- Stateless app instances scale horizontally when Redis and object storage are configured.
- The in-process limiter is per instance; do not rely on it behind multiple replicas.
- File analysis runs in `after()` background work. Keep request timeouts generous and DB connections pooled.
- AI calls are external; set provider quotas to match expected concurrency.

## 9. Vercel

1. Import the repo, set the environment variables per environment.
2. `postinstall` regenerates the Prisma client; the default build command is `npm run build`.
3. Run `npm run db:deploy` as a release command.
4. Add a Vercel KV (or Upstash) REST pair for multi-region/instance limiting.
5. Use Supabase Storage; the Vercel filesystem is ephemeral.
6. Configure an uptime monitor for `/api/health`.

## 10. Incident response

### Application will not start

1. Read the startup log line and `EnvironmentError` details.
2. Confirm required variables exist in the runtime environment (not only at build time).
3. Run `npm run db:deploy` if the schema is behind.

### Uploads fail

1. Check `/api/health` `checks.storage`.
2. Supabase: verify URL, service key, bucket existence, and project status.
3. Local: verify volume mount, ownership (`nextjs` user), and free space.

### Chat returns local answers unexpectedly

1. Confirm `OPENAI_API_KEY`/`GEMINI_API_KEY` is present at runtime.
2. Check `AI_PROVIDER`; a forced provider without a key resolves to local.
3. Inspect provider error logs (quota, invalid model, network).
4. Verify embedding model changes were followed by re-indexing.

### Rate limiting stops working

1. Check `X-RateLimit-Backend`; `local` means Redis is not configured or unreachable.
2. Validate the REST URL/token pair and outbound network access.
3. Redis failures degrade rather than reject traffic by design.

### Rollback

1. Redeploy the previous image/build.
2. Roll back the database only if the release included a migration and you have a verified backup; Prisma does not provide automatic down migrations.
3. Invalidate sessions by rotating `AUTH_SECRET` if credentials were exposed.

## 11. Security hardening

- Use HTTPS only; HSTS is sent by default.
- Keep Supabase buckets private and service keys server-side.
- Rotate `AUTH_SECRET`, `SHARE_SECRET`, provider keys, and storage keys on a schedule and after any leak.
- Restrict database network access to the application and CI.
- Review dependencies with `npm audit` and update on a cadence.
- A strict CSP is not yet enabled; add nonce-based headers when a policy is ready.
- Set request size limits at the proxy in addition to the app’s 25 MB upload cap.

## 12. Known limitations

- Automated tests are not committed as a suite; validate changes with `npm run check` and targeted smoke tests.
- In-process rate limiting and local storage are single-instance features.
- Provider integrations are validated against REST contracts but need real keys for live verification.
- The local AI fallback is extractive, not generative.
