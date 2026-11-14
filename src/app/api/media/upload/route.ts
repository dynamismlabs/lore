/**
 * POST /api/media/upload — raw file body, `Content-Type` = the file's type.
 * Streams into the private bucket under the uploader's prefix and returns the
 * key, which `stories.create` / `media.addToStory` then attach to a memory.
 */
import { v7 as uuidv7 } from 'uuid';
import { getStorage, userKeyPrefix } from '@/services/server/storage';
import { getViewer } from '@/lib/auth/server';
import { UPLOAD_TYPES, baseContentType } from '@/lib/server/media';

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  const viewer = await getViewer(request);
  if (!viewer) return json({ error: 'Please sign in' }, 401);

  const storage = getStorage();
  if (!storage) return json({ error: 'Media storage is not set up on this server' }, 503);

  const fullType = request.headers.get('content-type') ?? '';
  const type = baseContentType(fullType);
  const rule = UPLOAD_TYPES[type];
  if (!rule) return json({ error: `Can’t upload ${type || 'that file type'}` }, 415);

  const size = Number(request.headers.get('content-length') ?? '');
  if (!Number.isFinite(size) || size <= 0) return json({ error: 'Missing file size' }, 411);
  if (size > rule.maxBytes) {
    return json(
      { error: `That file is too big (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB)` },
      413,
    );
  }
  if (!request.body) return json({ error: 'Empty upload' }, 400);

  const key = `${userKeyPrefix(viewer.id)}${uuidv7()}.${rule.ext}`;
  // Keep codec parameters for audio (e.g. audio/webm;codecs=opus) — browsers use them.
  const storedType = type.startsWith('audio/') ? fullType.trim() : type;
  try {
    await storage.put(key, request.body, storedType, size);
  } catch (error) {
    console.error('[upload]', error);
    return json({ error: 'Upload failed — please try again' }, 500);
  }
  return json({ key, contentType: storedType, size });
}
