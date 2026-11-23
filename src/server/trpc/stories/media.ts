/**
 * Validation + background work shared by stories.create and media.addToStory.
 */
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { type Storage, userKeyPrefix } from '@/services/server/storage';
import { getTranscriptionProvider, transcribeAudio } from '@/services/server/transcription';
import type { Db } from '@/db';
import type { TranscriptStatus } from '@/db/constants';
import { storyMedia } from '@/db/schema';

export const MAX_TEXT_LENGTH = 100_000;

export const mediaInputSchema = z.object({
  kind: z.enum(['text', 'audio', 'image', 'video']),
  /** Markdown for text; optional caption for files. */
  text: z.string().max(MAX_TEXT_LENGTH).optional(),
  storageKey: z.string().max(300).optional(),
  durationMs: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60 * 60 * 1000)
    .optional(),
  width: z.number().int().positive().max(100_000).optional(),
  height: z.number().int().positive().max(100_000).optional(),
});

export type MediaInput = z.infer<typeof mediaInputSchema>;
type MediaInsert = typeof storyMedia.$inferInsert;

/**
 * Check uploaded objects belong to the viewer and exist, and build insert rows.
 * Size and content type come from storage, not the client.
 */
export async function prepareMediaRows({
  userId,
  storyId,
  items,
  storage,
  startPosition = 0,
}: {
  userId: string;
  storyId: string;
  items: MediaInput[];
  storage: Storage | null;
  startPosition?: number;
}): Promise<MediaInsert[]> {
  const transcription = getTranscriptionProvider();
  const rows: MediaInsert[] = [];

  for (const [index, item] of items.entries()) {
    const position = startPosition + index;
    if (item.kind === 'text') {
      const text = item.text?.trim();
      if (!text) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Write something first' });
      rows.push({ id: uuidv7(), storyId, kind: 'text', position, text });
      continue;
    }

    if (!item.storageKey || !item.storageKey.startsWith(userKeyPrefix(userId))) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'That upload does not belong to you' });
    }
    if (!storage) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media storage is not set up' });
    }
    const object = await storage.head(item.storageKey);
    if (!object) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload not found — please try again' });
    }
    const family = object.contentType.split('/')[0];
    if (family !== item.kind) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload type does not match' });
    }

    let transcriptStatus: TranscriptStatus | null = null;
    if (item.kind === 'audio') transcriptStatus = transcription ? 'pending' : 'unavailable';

    rows.push({
      id: uuidv7(),
      storyId,
      kind: item.kind,
      position,
      storageKey: item.storageKey,
      contentType: object.contentType,
      sizeBytes: object.size,
      text: item.text?.trim() || null,
      transcriptStatus,
      durationMs: item.durationMs ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
    });
  }
  return rows;
}

/** Transcribe one audio item and store the result. Never throws. */
export async function transcribeMediaItem(
  db: Db,
  storage: Storage,
  media: { id: string; storageKey: string | null },
): Promise<{ status: TranscriptStatus; text: string | null }> {
  try {
    if (!media.storageKey) throw new Error('No audio stored');
    const object = await storage.read(media.storageKey);
    if (!object) throw new Error('Audio not found');
    const { text, segments } = await transcribeAudio(object);
    await db
      .update(storyMedia)
      .set({
        text: text || null,
        transcriptStatus: 'done',
        transcriptSegments: segments.length ? segments : null,
      })
      .where(eq(storyMedia.id, media.id));
    return { status: 'done', text: text || null };
  } catch (error) {
    console.error('[transcription]', error);
    await db
      .update(storyMedia)
      .set({ transcriptStatus: 'failed' })
      .where(eq(storyMedia.id, media.id));
    return { status: 'failed', text: null };
  }
}

/**
 * Transcripts are requested by the client right after a recording is saved
 * (`media.transcribe`), in a request that can wait as long as Whisper needs —
 * background work on Workers is cut off 30s after the response. If nobody
 * finished it (tab closed mid-way), a pending transcript goes stale and the
 * UI offers "Try again".
 */
export const TRANSCRIPT_STALE_MS = 10 * 60 * 1000;

export function effectiveTranscriptStatus(
  status: TranscriptStatus | null,
  createdAt: Date,
  now = Date.now(),
): TranscriptStatus | null {
  return status === 'pending' && now - createdAt.getTime() > TRANSCRIPT_STALE_MS
    ? 'failed'
    : status;
}
