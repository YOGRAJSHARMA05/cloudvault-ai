# CloudVault AI

CloudVault AI is a production-minded foundation for a secure, AI-powered cloud storage SaaS. This repository currently contains the application shell and reusable UI primitives only; authentication, storage, AI, and product workflows are intentionally out of scope for this initial setup.

## Tech stack

- Next.js 16 App Router
- React 19 and TypeScript
- Tailwind CSS 4
- ESLint 9
- Git and GitHub
- Authentication: Auth.js, Prisma, PostgreSQL, and bcrypt
- Planned: AWS S3, UploadThing, Gemini API, and Vercel

## Project structure

```text
app/                  App Router pages, root layout, global styles, and app icon
components/
  common/              Shared brand and cross-cutting components
  layout/              Navbar and footer
  ui/                  Reusable interface primitives
constants/             Shared site and navigation configuration
hooks/                 Reserved for reusable React hooks
lib/                   Shared utilities
public/
  icons/               Static icon assets
  images/              Static image assets
styles/                Global design tokens
  tokens.css
types/                 Shared TypeScript types
```

## Setup

### Requirements

- Node.js 20.9 or newer
- npm

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the app.

## Development

- `npm run dev` — start the local development server.
- `npm run lint` — run ESLint.
- `npm run build` — create a production build.
- `npm run start` — serve the production build locally.

Keep shared UI in `components/`, application-wide constants in `constants/`, and framework-independent helpers in `lib/`. Use strict TypeScript, accessible semantic HTML, and the shared design tokens when extending the foundation.

## Authentication setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a PostgreSQL database URL. Set `AUTH_SECRET` to a unique secret (for example, generate one with `openssl rand -base64 32`).
2. Apply the initial schema with `npm run db:migrate`.
3. To enable Google sign-in, create OAuth credentials in Google Cloud Console, set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, and add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. The Google option is hidden until both values are configured.
4. Start the app with `npm run dev`, then use `/signup` and `/login`. Successful authentication redirects to `/dashboard`. Signing out from the dashboard clears the Auth.js session.

Auth.js uses encrypted JWT cookie sessions for credentials and Google sign-in, with Prisma persisting users and OAuth account records. Passwords are hashed with bcrypt and never stored in plaintext. Server-rendered routes should use `requireUser()` or `requireRole()` from `lib/auth-guard.ts`; the Next.js 16 `proxy.ts` performs early route redirects but is not a substitute for authorization checks at data access boundaries.

## File management

The protected `/dashboard` workspace supports per-user uploads, browsing, live search, category filters, sorting, pagination, rename, favorites, details, secure download, and confirmed deletion. Uploads accept PDF, DOC, DOCX, TXT, PNG, JPG/JPEG, and WEBP files up to 25 MB. Files are validated for extension, MIME type, and recognizable file signatures before storage. Each database query is scoped to the signed-in user's ID.

Nested folders are supported alongside files: create, rename, move, breadcrumb navigation, drag-and-drop organization, workspace search across folders and files, and deletion once a folder is empty. Folder names are validated and kept unique within their parent.

Files are stored outside `public/` in `storage/uploads/<user-id>/` so they cannot be fetched without authorization. The default path can be changed with `CLOUDVAULT_STORAGE_DIR`. Persist this directory on the host or mount a durable volume when deploying; a local container filesystem is ephemeral, and local disk is not shared between multiple app instances. For multi-instance/production deployments, use private object storage such as S3 with signed downloads. Storage totals report actual uploaded bytes; no user quota is implied.

## Roadmap

1. Establish product requirements and UX flows.
2. Add Supabase-backed persistence and secure file storage.
3. Implement authentication and authorization.
4. Integrate AI workflows through the OpenAI API.
5. Add automated tests, observability, and production deployment on Vercel.

## License

No open-source license has been selected. All rights are reserved unless and until a license is added to this repository.
