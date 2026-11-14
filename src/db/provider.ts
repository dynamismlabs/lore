/**
 * Which database backs this deployment.
 *
 * - `d1` (default): Cloudflare D1 via the `DB` binding. Free, zero-config
 *   self-hosting; also what `pnpm dev` uses (a local D1 under .wrangler/).
 * - `postgres`: any Postgres. On Workers through a `HYPERDRIVE` binding, on
 *   Node through `DATABASE_URL`.
 *
 * Inlined at build time by next.config.ts (a deployment is one or the other),
 * read from the environment in tests and scripts.
 */
export type DatabaseProvider = 'd1' | 'postgres';

export function getDatabaseProvider(): DatabaseProvider {
  const value = process.env.DATABASE_PROVIDER;
  if (!value || value === 'd1') return 'd1';
  if (value === 'postgres') return 'postgres';
  throw new Error(`Unsupported DATABASE_PROVIDER "${value}". Expected "d1" or "postgres".`);
}
