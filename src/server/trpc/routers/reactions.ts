import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { reactions } from '@/db/schema';
import { requireStoryRead } from '../authz';
import { HEART } from '../stories/hydrate';
import { protectedProcedure, router } from '../trpc';

export const reactionsRouter = router({
  /** Heart / un-heart a memory. */
  toggleHeart: protectedProcedure
    .input(z.object({ storyId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await requireStoryRead(ctx.db, ctx.userId, input.storyId);
      const where = and(
        eq(reactions.storyId, input.storyId),
        eq(reactions.userId, ctx.userId),
        eq(reactions.emoji, HEART),
      );
      const [existing] = await ctx.db.select().from(reactions).where(where).limit(1);
      if (existing) {
        await ctx.db.delete(reactions).where(where);
        return { hearted: false };
      }
      await ctx.db
        .insert(reactions)
        .values({ storyId: input.storyId, userId: ctx.userId, emoji: HEART })
        .onConflictDoNothing();
      return { hearted: true };
    }),
});
