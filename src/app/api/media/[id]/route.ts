/**
 * GET /api/media/[id] — serve a photo/recording/video to someone allowed to
 * see the memory it belongs to. Supports single byte ranges (audio/video
 * seeking, required by Safari). An MCP view, which has no sign-in cookie, uses
 * a short-lived signed link instead (`?exp&sig`, see `media-links.ts`).
 */
import { eq } from 'drizzle-orm';
import { getStorage } from '@/services/server/storage';
import { getViewer } from '@/lib/auth/server';
import { parseRange } from '@/lib/server/media';
import { verifyMediaLink } from '@/lib/server/media-links';
import { getDb } from '@/db';
import { storyMedia } from '@/db/schema';
import { requireStoryRead } from '@/server/trpc/authz';

const notFound = () => new Response('Not found', { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const signed = url.searchParams.has('sig');
  // A signed link was handed out by an MCP tool that already checked access.
  const linkExpires = signed
    ? await verifyMediaLink(id, url.searchParams.get('exp'), url.searchParams.get('sig'))
    : null;
  if (signed && !linkExpires) return new Response('This link has expired', { status: 403 });
  const viewer = linkExpires ? null : await getViewer(request);
  if (!linkExpires && !viewer) return new Response('Please sign in', { status: 401 });

  const db = getDb();
  const [media] = await db.select().from(storyMedia).where(eq(storyMedia.id, id)).limit(1);
  if (!media?.storageKey) return notFound();
  if (viewer) {
    try {
      await requireStoryRead(db, viewer.id, media.storyId);
    } catch {
      return notFound();
    }
  }

  const storage = getStorage();
  if (!storage) return new Response('Media storage is not set up', { status: 503 });

  const range = parseRange(request.headers.get('range'));
  const object = await storage.get(media.storageKey, range ?? undefined);
  if (!object) return notFound();

  const headers = new Headers({
    'Content-Type': object.contentType,
    'Accept-Ranges': 'bytes',
    // Objects never change (every upload gets a new key). Private: never in shared caches.
    'Cache-Control': linkExpires
      ? `private, max-age=${Math.max(0, Math.floor((linkExpires - Date.now()) / 1000))}`
      : 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': 'inline',
  });
  if (object.etag) headers.set('ETag', object.etag);
  // The view lives in the assistant's frame on another origin.
  if (linkExpires) headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  if (range && object.range) {
    const { offset, length } = object.range;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}
