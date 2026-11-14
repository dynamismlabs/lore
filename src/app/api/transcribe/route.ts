/**
 * POST /api/transcribe — dictation for the writer. Raw audio body in, text out.
 * Nothing is stored: the words go into what you're writing, the audio is
 * discarded. (Voice memories go through /api/media/upload + media.transcribe.)
 */
import { getViewer } from '@/lib/auth/server';
import { baseContentType } from '@/lib/server/media';
import {
  getTranscriptionProvider,
  TranscriptionError,
  transcribeAudio,
} from '@/services/server/transcription';

const MAX_BYTES = 15 * 1024 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  const viewer = await getViewer(request);
  if (!viewer) return json({ error: 'Please sign in' }, 401);
  if (!getTranscriptionProvider()) {
    return json({ error: 'Transcription isn’t set up on this server' }, 503);
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!baseContentType(contentType).startsWith('audio/')) {
    return json({ error: 'Send audio' }, 415);
  }
  const size = Number(request.headers.get('content-length') ?? '0');
  if (size > MAX_BYTES) return json({ error: 'That’s too long to dictate — try a voice memory' }, 413);

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: 'Empty recording' }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'That’s too long to dictate' }, 413);

  try {
    const text = await transcribeAudio({ bytes, contentType });
    return json({ text });
  } catch (error) {
    console.error('[dictate]', error);
    return json(
      { error: error instanceof TranscriptionError ? error.message : 'Couldn’t write that down — try again' },
      502,
    );
  }
}
