# Contributing to Lore

Use pnpm and TypeScript. Before review, format changed files with Prettier and run
`pnpm ts`, `pnpm lint`, and `pnpm test`.

## Structure and UI

- Next.js 16: UI routes in `src/pages`, page content in `src/screens`, reusable components in
  `src/components`, hooks in `src/hooks`, URLs in `src/constants/pages.ts`.
- Use functional components with a typed `Props` interface and argument defaults. Reusable components
  have a named folder with a component file and an index export. Use absolute `@/` imports.
- Inspect nearby screens, `src/styles/globals.css`, and `tailwind.config.ts` before changing UI.
- Use shadcn/ui (install new primitives with `pnpm dlx shadcn@latest add <component>`), Tailwind,
  and `cn` from `@/lib/utils`. Use Sonner for toasts. No styled-jsx.
- Keep the design clean and grayscale. Use semantic theme classes (`bg-background`, `bg-primary`,
  `text-muted-foreground`) so dark mode works. Memory content uses `font-serif`; UI uses sans.
- Use client requests or `getStaticProps`; never `getServerSideProps`.

## Data and authorization

- Business logic and JSON data access belong in tRPC procedures under `src/server/trpc/routers`,
  consumed with `trpc.<resource>.<procedure>.useQuery/useMutation`. The endpoint is `/api/trpc/[trpc]`.
- Use `protectedProcedure` for authenticated work. Run the appropriate helper from
  `src/server/trpc/authz.ts` before touching a resource; unreadable resources return `NOT_FOUND`.
  There is no database row-level security. Sharing is collection membership (owner/contributor/viewer).
- Import tables from `@/db/schema`, never directly from `@/db/sqlite` or `@/db/pg`. Use `getDb()` per
  request. SQLite is canonical; keep the Postgres mirror in lockstep and run `pnpm db:generate`.
- Queries must work on both dialects: no dialect-specific SQL, keep `inArray` lists below about 90 IDs,
  and use `runBatch` from `@/db/batch` for atomic writes, with IDs generated up front. Do not call
  `db.transaction()` or `db.batch()` directly.
- Use Drizzle-inferred row types and `RouterOutputs` from `@/lib/client/trpc` for API types.
  Store rich text as Markdown; render with `react-markdown` without raw HTML.
- Tests live beside the code. `pnpm test` checks routers on D1/Miniflare and Postgres/PGLite plus schema parity.

## Auth, media, and offline capture

- Auth is better-auth at `/api/auth/[...all]`. Call `getAuth(request)` / `getViewer(request)` per request;
  Worker bindings are request-scoped. Sign-up defaults to invite-only after the first account.
- Non-JSON routes (auth, upload, streaming) use App Router handlers in `src/app/api`, Web Request/Response,
  `getViewer`, and the same authz helpers. Do not set `runtime = 'edge'`.
- Media stays in private R2/S3 and is served through `/api/media/[id]` after access checks. Deleted media
  uses `storage.trash()` for recovery. Keep secrets and external integrations in `src/services/server`.
- Capture flows use `useOutbox().save()`, never `stories.create` directly. IndexedDB retries use the
  outbox ID as `clientId` to prevent duplicate memories. Preserve existing browser storage keys.
- Use `useViewer()` on screens that open offline, and `isConnectionError()` / `OfflineNotice` to
  distinguish connection failures from missing resources. Never cache memories or `/api/*` in the
  service worker; bump its `VERSION` when changing the app shell cache.
- Audio is saved as pending, then the client calls `media.transcribe`. Do not move transcription into
  `waitUntil`; Workers can stop it before Whisper finishes. Pending audio older than 10 minutes is failed.

## MCP

- Tools in `src/server/mcp/server.ts` call the tRPC caller to share authorization. Set read-only/destructive
  hints; there are no delete tools. Unauthenticated requests return 401 with `WWW-Authenticate` metadata.
- OAuth uses better-auth's MCP plugin and the consent screen. MCP Apps sources are in
  `src/server/mcp/views/client`; run `pnpm mcp-views:build` after changes and commit the generated HTML.
  Media uses short-lived signed links to Lore's own media endpoint.

## Deployment

- Cloudflare Workers via OpenNext; plain Node is also supported. Keep `next build --webpack`:
  Turbopack duplicates shared server code and exceeds the free Worker bundle limit.
- Config values use `getEnvVar()` from `@/lib/server/cloudflare`. D1 is the default; Postgres uses
  `DATABASE_PROVIDER=postgres` with Hyperdrive on Workers or `DATABASE_URL` on Node.
- Deploy only through `pnpm deploy:cloudflare`. It provisions resources, migrates, and hides local env
  files during the build so OpenNext cannot bundle their secrets. Production secrets belong in Worker
  secrets; `.env.cloudflare` supplies the deploy script. See [deployment docs](docs/deploy-cloudflare.md).
- Keep account IDs, custom domains, local databases, generated Wrangler config/types, and internal
  notes out of shared files. `pnpm install` generates Cloudflare types; use `pnpm cf-typegen` after
  binding changes. `worker.ts` includes the nightly D1 backup cron.
