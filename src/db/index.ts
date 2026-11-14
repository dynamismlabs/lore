/**
 * Database handle for the current request.
 *
 * `getDb()` picks the driver for this deployment (see ./provider.ts):
 * - D1: wraps the `DB` binding (cheap; cached per binding object).
 * - Postgres on Workers: a fresh single-connection client per request through
 *   Hyperdrive — Workers forbid sharing sockets across requests.
 * - Postgres on Node: one pooled client for the process.
 *
 * `Db` is typed as the D1 client so all query code gets full inference; the
 * Postgres client exposes the same query-builder surface at runtime. Never call
 * `db.transaction()` or `db.batch()` directly — use `runBatch` (./batch.ts).
 */
import { type DrizzleD1Database, drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { tryGetCloudflareContext } from '@/lib/server/cloudflare';
import * as pgSchema from './pg';
import { getDatabaseProvider } from './provider';
import * as sqliteSchema from './sqlite';

export type Db = DrizzleD1Database<typeof sqliteSchema>;

const d1Cache = new WeakMap<D1Database, Db>();
const perRequestPg = new WeakMap<object, Db>();

declare global {
  // Reused across hot reloads in dev and across requests on Node.
  var __loreNodePg: Db | undefined;
}

function pgFromUrl(url: string, options: postgres.Options<Record<string, never>>): Db {
  const client = postgres(url, options);
  return drizzlePostgres(client, { schema: pgSchema }) as unknown as Db;
}

export function getDb(): Db {
  const cf = tryGetCloudflareContext();

  if (getDatabaseProvider() === 'd1') {
    const binding = cf?.env.DB;
    if (!binding) {
      throw new Error(
        'DATABASE_PROVIDER is d1 but no D1 binding named "DB" is available. ' +
          'Run on Cloudflare (or `pnpm dev`), or set DATABASE_PROVIDER=postgres.',
      );
    }
    let db = d1Cache.get(binding);
    if (!db) {
      db = drizzleD1(binding, { schema: sqliteSchema });
      d1Cache.set(binding, db);
    }
    return db;
  }

  const hyperdrive = cf?.env.HYPERDRIVE;
  if (hyperdrive && cf) {
    let db = perRequestPg.get(cf.ctx);
    if (!db) {
      // Hyperdrive pools origin connections; keep one socket per request and
      // let the runtime close it when the request ends.
      db = pgFromUrl(hyperdrive.connectionString, { max: 1, fetch_types: false, prepare: true });
      perRequestPg.set(cf.ctx, db);
    }
    return db;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_PROVIDER is postgres but neither a HYPERDRIVE binding nor DATABASE_URL is set.',
    );
  }
  globalThis.__loreNodePg ??= pgFromUrl(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
  return globalThis.__loreNodePg;
}

export { runBatch } from './batch';
