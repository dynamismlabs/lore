/**
 * Test harness: a fresh database per test (D1 via Miniflare, or Postgres via
 * PGLite, chosen by DATABASE_PROVIDER), in-memory media storage, and callers
 * bound to synthetic users.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import type { Storage } from '@/services/server/storage';
import { createMomentsCollection } from '@/lib/auth/server';
import type { Db } from '@/db';
import { getDatabaseProvider } from '@/db/provider';
import { users } from '@/db/schema';
import { appRouter } from '../root';

const MIGRATIONS = path.resolve(__dirname, '../../../db/migrations');

export interface TestDb {
  db: Db;
  dispose: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  if (getDatabaseProvider() === 'postgres') {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const pgSchema = await import('@/db/pg');
    const client = new PGlite();
    const db = drizzle(client, { schema: pgSchema });
    await migrate(db, { migrationsFolder: path.join(MIGRATIONS, 'pg') });
    return { db: db as unknown as Db, dispose: () => client.close() };
  }

  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const { drizzle } = await import('drizzle-orm/d1');
  const sqliteSchema = await import('@/db/sqlite');
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response(null) } }',
      d1Databases: { DB: `test-${uuidv7()}` },
    }),
  );
  const d1 = await mf.getD1Database('DB');
  const dir = path.join(MIGRATIONS, 'sqlite');
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const statements = readFileSync(path.join(dir, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) await d1.prepare(statement).run();
  }
  return { db: drizzle(d1, { schema: sqliteSchema }) as Db, dispose: () => mf.dispose() };
}

export function memoryStorage(): Storage & {
  objects: Map<string, { bytes: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      const bytes =
        body instanceof ArrayBuffer
          ? new Uint8Array(body)
          : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes, contentType });
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        body: new Response(o.bytes).body!,
        size: o.bytes.byteLength,
        contentType: o.contentType,
        etag: key,
      };
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.byteLength, contentType: o.contentType } : null;
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key);
    },
    async read(key) {
      const o = objects.get(key);
      return o ? { bytes: o.bytes.buffer as ArrayBuffer, contentType: o.contentType } : null;
    },
    async trash(keys) {
      for (const key of keys) {
        const o = objects.get(key);
        if (o) objects.set(`trash/${key}`, o);
        objects.delete(key);
      }
    },
  };
}

export async function createUser(db: Db, storage: Storage | null, name = 'Alex') {
  const id = uuidv7();
  const email = `${name.toLowerCase().replace(/\W/g, '')}-${id}@test.local`;
  await db.insert(users).values({ id, email, name });
  await createMomentsCollection(db, id);
  const viewer = { id, name, email, image: null };
  return {
    id,
    viewer,
    caller: appRouter.createCaller({ db, viewer, storage, origin: 'https://lore.test' }),
  };
}

export const textMemory = (text: string) => ({ media: [{ kind: 'text' as const, text }] });
