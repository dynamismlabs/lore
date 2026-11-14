import { defineConfig } from 'drizzle-kit';

// Canonical schema (D1 / SQLite). `pnpm db:generate` writes migrations that
// wrangler applies (`pnpm db:migrate:local`, and the Cloudflare deploy).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/sqlite/index.ts',
  out: './src/db/migrations/sqlite',
  strict: true,
});
