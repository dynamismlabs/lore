import { TRPCError } from '@trpc/server';
import { count, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { getTranscriptionProvider } from '@/services/server/transcription';
import { runInBackground } from '@/lib/server/cloudflare';
import { stories, storyMedia } from '@/db/schema';
import { requireStoryAuthor } from '../authz';
import {
  MAX_TEXT_LENGTH,
  mediaInputSchema,
  prepareMediaRows,
  transcribeMediaItem,
} from '../stories/media';
import { protectedProcedure, router } from '../trpc';

const id = z.string().min(1).max(64);

async function requireMediaAuthor(
  ctx: { db: Parameters<typeof requireStoryAuthor>[0]; userId: string },
  mediaId: string,
) {
  const [media] = await ctx.db.select().from(storyMedia).where(eq(storyMedia.id, mediaId)).limit(1);
  if (!media) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
  await requireStoryAuthor(ctx.db, ctx.userId, media.storyId);
  return media;
}

export const mediaRouter = router({
  /** Edit text, a transcript, or a caption. */
  updateText: protectedProcedure
    .input(z.object({ id, text: z.string().max(MAX_TEXT_LENGTH) }))
    .mutation(async ({ ctx, input }) => {
      const media = await requireMediaAuthor(ctx, input.id);
      const text = input.text.trim();
      if (media.kind === 'text' && !text) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Write something, or delete the memory',
        });
      }
      await ctx.db
        .update(storyMedia)
        .set({
          text: text || null,
          ...(media.kind === 'audio' && text ? { transcriptStatus: 'done' as const } : {}),
        })
        .where(eq(storyMedia.id, input.id));
      await ctx.db
        .update(stories)
        .set({ updatedAt: new Date() })
        .where(eq(stories.id, media.storyId));
      return { id: input.id };
    }),

  /**
   * Write down what was said. Called by the app right after a recording is
   * saved (and by "Try again"); waits for the transcript and returns it.
   */
  transcribe: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const media = await requireMediaAuthor(ctx, input.id);
    if (media.kind !== 'audio') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not audio' });
    if (media.transcriptStatus === 'done') return { status: 'done' as const, text: media.text };
    if (!getTranscriptionProvider() || !ctx.storage) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Transcription isn’t set up' });
    }
    await ctx.db
      .update(storyMedia)
      .set({ transcriptStatus: 'pending' })
      .where(eq(storyMedia.id, input.id));
    return transcribeMediaItem(ctx.db, ctx.storage, media);
  }),

  /** Add more photos/recordings to an existing memory. */
  addToStory: protectedProcedure
    .input(z.object({ storyId: id, media: z.array(mediaInputSchema).min(1).max(30) }))
    .mutation(async ({ ctx, input }) => {
      await requireStoryAuthor(ctx.db, ctx.userId, input.storyId);
      const [{ last }] = await ctx.db
        .select({ last: max(storyMedia.position) })
        .from(storyMedia)
        .where(eq(storyMedia.storyId, input.storyId));
      const rows = await prepareMediaRows({
        userId: ctx.userId,
        storyId: input.storyId,
        items: input.media,
        storage: ctx.storage,
        startPosition: (last ?? -1) + 1,
      });
      await ctx.db.insert(storyMedia).values(rows);
      await ctx.db
        .update(stories)
        .set({ updatedAt: new Date() })
        .where(eq(stories.id, input.storyId));
      return { ids: rows.map((r) => r.id!) };
    }),

  remove: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const media = await requireMediaAuthor(ctx, input.id);
    const [{ total }] = await ctx.db
      .select({ total: count() })
      .from(storyMedia)
      .where(eq(storyMedia.storyId, media.storyId));
    if (total <= 1) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'That’s the only thing in this memory — delete the memory instead',
      });
    }
    await ctx.db.delete(storyMedia).where(eq(storyMedia.id, input.id));
    if (ctx.storage && media.storageKey) runInBackground(ctx.storage.trash([media.storageKey]));
    return { id: input.id };
  }),
});
