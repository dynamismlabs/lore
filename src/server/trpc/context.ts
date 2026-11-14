/**
 * tRPC context, built per request: the request's database handle, the
 * signed-in viewer (or null), media storage, and the public origin (for links).
 */
import { type Storage, getStorage } from '@/services/server/storage';
import { type Viewer, getViewer } from '@/lib/auth/server';
import { getEnvVar } from '@/lib/server/cloudflare';
import { type Db, getDb } from '@/db';

export interface Context {
  db: Db;
  viewer: Viewer | null;
  storage: Storage | null;
  /** Public origin of the app, e.g. https://lore.example.workers.dev */
  origin: string;
}

export async function createContext(request: Request): Promise<Context> {
  return {
    db: getDb(),
    viewer: await getViewer(request),
    storage: getStorage(),
    origin: getEnvVar('BETTER_AUTH_URL') ?? new URL(request.url).origin,
  };
}
