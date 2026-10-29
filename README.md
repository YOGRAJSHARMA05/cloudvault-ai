# CloudVault AI

A production-minded, AI-powered cloud storage workspace built with Next.js 16, PostgreSQL, Prisma, Auth.js, and optional OpenAI/Gemini providers. Users can upload and organize files, share them with expiring links, search by meaning, and chat with their documents with citations.

The app runs fully offline: when no AI provider key is configured, a deterministic local embedding model and an extractive answer fallback keep every AI feature working.

## Features

- **Authentication** — credentials and optional Google sign-in, JWT sessions, bcrypt password hashing, role support, and per-user data scoping.
- **File management** — upload, browse, rename, favorite, search, sort, paginate, secure download, and confirmed deletion. File signatures, MIME types, and extensions are validated; uploads are capped at 25 MB.
- **Folders** — nested folders, breadcrumbs, move/rename, drag-and-drop organization, and empty-folder deletion.
- **Trash** — soft delete with restore and permanent purge.
- **Shared links** — expiring, optionally password-protected links with revocation.
- **AI search** — semantic search over file chunks and metadata, with lexical blending.
- **AI analysis** — summaries, key points, technologies, dates, action items, keywords, topic tags, and categories.
- **Document chat (RAG)** — file-scoped or workspace-wide Q&A with streaming answers, numbered source citations, persisted per-user history, rename/delete, and daily usage limits.
- **Recommendations** — similar-document suggestions based on content, tags, and names.
- **Analytics** — storage usage, upload mix, and AI search activity.
- **Production infrastructure** — environment validation, structured logging, request error capture, health checks, Redis-ready rate limiting, and Docker/Vercel deployment support.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Turbopack) |
| Language | TypeScript (strict) |
| UI | React 19, Tailwind CSS 4 |
| Database | PostgreSQL + Prisma 6 |
| Auth | Auth.js (NextAuth 5 beta) + Prisma adapter |
| Storage | Local disk or private Supabase Storage |
| AI | OpenAI or Google Gemini over REST, local fallback |
| Rate limiting | Redis REST (Upstash/Vercel KV) with in-process fallback |
| Logging | Structured JSON/pretty logger with redaction |

## Project structure

```text
app/
  (auth)/                 Login and signup pages
  (dashboard)/            Files, search, chat, share, analytics, trash, settings
  api/                    Route handlers (AI, files, share, health, auth)
  files/[fileId]/         File detail and preview pages
  actions/                Server actions (files, folders, share, trash, settings)
components/
  ai/                     Chat UI
  files/                  Dashboard and preview surfaces
  layout/, ui/, ...       Shared UI
lib/
  ai/                     Provider, embeddings, RAG, prompts, usage
  security/               Rate limiting and HTTP helpers
  storage/                Supabase Storage adapter
  env.ts                  Environment schema and reports
  logger.ts               Structured logging
  file-storage.ts         Storage abstraction (local or Supabase)
prisma/                   Schema and migrations
docs/production.md        Deployment and operations runbook
instrumentation.ts        Startup validation and request error logging
Dockerfile                Standalone production image
```

## Getting started

### Requirements

- Node.js 20.9 or newer (22 LTS recommended)
- PostgreSQL 14+ (or a hosted Postgres such as Neon/Supabase)
- npm

### Setup

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # then fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate               # create/apply migrations in development
npm run dev                      # http://localhost:3000
```

Generate a secret with `openssl rand -base64 32`.

Create an account at `/signup`, then sign in at `/login`. Google sign-in appears only when both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set; add `https://your-origin/api/auth/callback/google` as an authorized redirect URI.

## Environment variables

All variables are optional unless marked **required**. `lib/env.ts` validates them at startup, logs non-fatal warnings, and fails fast in production when critical values are missing.

### Core

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string. |
| `AUTH_SECRET` | — | **Required in production.** Session/JWT encryption secret. |
| `AUTH_URL` | — | Public origin (e.g. `https://vault.example.com`). Recommended in production. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | — | Enable Google sign-in when both are set. |
| `SHARE_SECRET` | `AUTH_SECRET` | Signs password-protected share cookies. |
| `APP_VERSION` | `0.1.0` | Reported by the health endpoint. |

### Storage

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Server-only key. Prefer this over `SUPABASE_SECRET_KEY`. |
| `SUPABASE_SECRET_KEY` | — | Alias for older Supabase naming. |
| `SUPABASE_STORAGE_BUCKET` | `cloudvault` | Private bucket; created automatically if missing. |
| `CLOUDVAULT_STORAGE_DIR` | `storage/uploads` | Local storage root when Supabase is not configured. |

### Rate limiting

| Variable | Default | Description |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | — | Shared fixed-window limiter. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | — | Vercel KV aliases, also supported. |
| `REDIS_REST_URL` + `REDIS_REST_TOKEN` | — | Generic Redis REST proxy aliases. |

When neither pair is complete, each instance uses an in-process limiter. If Redis is configured but unreachable, requests fall back to the local limiter and a throttled warning is logged.

### Observability

| Variable | Default | Description |
| --- | --- | --- |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | `debug`, `info`, `warn`, or `error`. |
| `LOG_FORMAT` | `json` (prod) / `pretty` (dev) | Output format. |
| `HEALTH_CHECK_TOKEN` | — | When set, `/api/health` requires `Authorization: Bearer <token>`. |

### AI (optional)

| Variable | Default | Description |
| --- | --- | --- |
| `AI_PROVIDER` | `auto` | `auto`, `openai`, `gemini`, or `local`. `auto` prefers OpenAI, then Gemini, then local. |
| `OPENAI_API_KEY` | — | Enables OpenAI chat and embeddings. |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | Chat model. |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible gateway. |
| `GEMINI_API_KEY` | — | Enables Gemini (`GOOGLE_*` aliases supported). |
| `GEMINI_CHAT_MODEL` | `gemini-2.0-flash` | Chat model. |
| `GEMINI_EMBEDDING_MODEL` | `text-embedding-004` | Embedding model. |
| `GEMINI_BASE_URL` | Google Generative Language API | Override for proxies. |
| `AI_EMBEDDING_PROVIDER` | `auto` | Force embedding provider independently. |
| `AI_EMBEDDING_DIMENSIONS` | provider default | Override vector size (re-index required when changed). |
| `AI_DAILY_REQUEST_LIMIT` | `120` | Per-user AI requests per UTC day. |
| `AI_MAX_CONTEXT_CHARS` | `14000` | Retrieved context budget for chat. |
| `AI_MAX_OUTPUT_TOKENS` | `900` | Response budget. |
| `AI_TEMPERATURE` | `0.2` | Sampling temperature. |

Vectors are only compared when their stored model matches, so switching embedding providers never mixes incompatible similarity scores.

> Optional: `MALWARE_SCAN_URL` and `MALWARE_SCAN_TOKEN` enable an external malware scanner that receives the uploaded file as multipart form data.

## Storage

Uploads are written to one of two backends:

1. **Supabase Storage** — private bucket, server-side service key, short-lived signed URLs. Used when the project URL and a service key are present.
2. **Local disk** — `storage/uploads/<userId>/` by default, with restrictive permissions. Configure `CLOUDVAULT_STORAGE_DIR` to use a mounted volume.

Files never live under `public/`; downloads always pass through an authorization check. On serverless platforms the local filesystem is ephemeral, so configure Supabase Storage (or a durable volume for containers).

## AI behavior

- **Providers** are resolved from the environment at request time. OpenAI and Gemini are called directly over REST (no SDK).
- **Local fallback** uses `hashed-tfidf-v1` embeddings (256 dimensions) and an extractive answer that quotes retrieved passages. Chat still streams, cites sources, and persists history.
- **RAG** chunks documents at heading/section boundaries and retrieves the most relevant passages per question. Citations include the file, section, chunk index, and excerpt.
- **Quotas** are per-user, per UTC day, and shared across chat, summaries, keywords, and tags. Responses include the current usage.

## Rate limiting

`applyRateLimit()` protects API route handlers with a fixed window and returns `429` plus `Retry-After` when exhausted. It uses the shared Redis store when configured:

```text
POST {UPSTASH_REDIS_REST_URL}/pipeline   INCR + PEXPIRE
Authorization: Bearer {token}
```

Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Backend` when a request is throttled, alongside `Retry-After`. The active backend is also reported by `/api/health` under `checks.rateLimit`. If Redis fails, the limiter degrades gracefully to memory instead of rejecting traffic. See [docs/production.md](docs/production.md#rate-limiting) for multi-instance guidance.

## Logging and health

Structured logs are emitted as JSON in production and human-readable lines in development. Sensitive field names (passwords, tokens, cookies, keys) are redacted automatically. `instrumentation.ts` logs one startup summary and captures unhandled server errors with route context.

### `GET /api/health`

Returns `200` for healthy/degraded and `503` for failing checks. It never exposes secrets.

```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "production",
  "uptimeSeconds": 128,
  "timestamp": "2026-10-29T10:00:00.000Z",
  "checks": {
    "database": { "status": "up", "latencyMs": 8 },
    "storage": { "status": "up", "latencyMs": 12, "backend": "supabase" },
    "rateLimit": { "status": "up", "backend": "redis" },
    "ai": {
      "status": "up",
      "provider": "openai",
      "model": "gpt-4o-mini",
      "embeddings": { "provider": "openai", "model": "text-embedding-3-small", "dimensions": 1536 },
      "dailyRequestLimit": 120
    },
    "configuration": { "status": "valid", "errors": [], "warnings": [] }
  }
}
```

`HEAD /api/health` returns the same status code for load balancers. Point uptime monitors at `/api/health`; set `HEALTH_CHECK_TOKEN` if the endpoint should not be public.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build (also emits `.next/standalone`). |
| `npm run start` | Serve the production build. |
| `npm run start:standalone` | Run the traced standalone server. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript without emitting. |
| `npm run check` | Typecheck, lint, and build. |
| `npm run db:migrate` | Create/apply migrations (development). |
| `npm run db:deploy` | Apply committed migrations (production). |
| `npm run db:generate` | Regenerate the Prisma client. |
| `npm run db:studio` | Open Prisma Studio. |

## Deployment

### Vercel

1. Import the repository and add the environment variables from `.env.example` (at minimum `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_URL`).
2. Set the build command to `npm run build` (the default) so `postinstall` generates Prisma.
3. Run `npm run db:deploy` against the production database before or during release.
4. Configure Supabase Storage for durable uploads.
5. Add a Redis REST store if you run more than one instance.
6. Monitor `/api/health`.

### Docker / self-hosting

```bash
docker build -t cloudvault-ai .
docker run --env-file .env -p 3000:3000 \
  -v cloudvault-storage:/app/storage \
  cloudvault-ai
```

The image serves the standalone server as a non-root user and includes a container health check. Run migrations from a one-off container or your release pipeline:

```bash
docker run --rm --env-file .env cloudvault-ai npx prisma migrate deploy
```

The runtime image does not include the Prisma CLI; run migrations from a build/CI stage instead. See [docs/production.md](docs/production.md) for a complete checklist, reverse-proxy notes, backups, and scaling guidance.

## Security notes

- Every database query is scoped to the signed-in user. `proxy.ts` redirects unauthenticated navigation but is not an authorization boundary.
- Uploads are validated by extension, MIME type, and file signature before storage.
- Shared links support expiry and optional password protection.
- Security headers (nosniff, frame protection, referrer policy, permissions policy, HSTS) are set globally.
- Provider keys and storage service keys are server-only; never expose them with `NEXT_PUBLIC_`.
- A strict Content Security Policy is not enabled yet because it requires nonce plumbing through the App Router.

Report or fix configuration issues from the health endpoint’s `configuration` block and the startup log summary.

## License

No open-source license has been selected. All rights are reserved unless and until a license is added to this repository.
