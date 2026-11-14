import { defineConfig } from 'drizzle-kit';

// Postgres mirror. `pnpm db:migrate:pg` applies these to DATABASE_URL.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/pg/index.ts',
  out: './src/db/migrations/pg',
  strict: true,
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
