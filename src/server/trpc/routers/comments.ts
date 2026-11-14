import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { comments, stories, users } from '@/db/schema';
import { requireStoryRead } from '../authz';
import { protectedProcedure, router } from '../trpc';

const id = z.string().min(1).max(64);

export const commentsRouter = router({
  list: protectedProcedure.input(z.object({ storyId: id })).query(async ({ ctx, input }) => {
    const story = await requireStoryRead(ctx.db, ctx.userId, input.storyId);
    const rows = await ctx.db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        author: { id: users.id, name: users.name, image: users.image },
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.storyId, input.storyId))
      .orderBy(asc(comments.createdAt));
    return rows.map((c) => ({
      ...c,
      canDelete: c.author.id === ctx.userId || story.authorId === ctx.userId,
    }));
  }),

  create: protectedProcedure
    .input(z.object({ storyId: id, body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      await requireStoryRead(ctx.db, ctx.userId, input.storyId);
      const commentId = uuidv7();
      await ctx.db
        .insert(comments)
        .values({ id: commentId, storyId: input.storyId, authorId: ctx.userId, body: input.body });
      return { id: commentId };
    }),

  delete: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({ comment: comments, storyAuthorId: stories.authorId })
      .from(comments)
      .innerJoin(stories, eq(stories.id, comments.storyId))
      .where(eq(comments.id, input.id))
      .limit(1);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
    await requireStoryRead(ctx.db, ctx.userId, row.comment.storyId);
    if (row.comment.authorId !== ctx.userId && row.storyAuthorId !== ctx.userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only delete your own comments' });
    }
    await ctx.db.delete(comments).where(eq(comments.id, input.id));
    return { id: input.id };
  }),
});
