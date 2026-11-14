import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isEmailConfigured } from '@/services/server/email';
import { getTranscriptionProvider } from '@/services/server/transcription';
import { getSignupMode } from '@/lib/auth/server';
import { getEnvVar } from '@/lib/server/cloudflare';
import { users } from '@/db/schema';
import { protectedProcedure, publicProcedure, router } from '../trpc';

export const meRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await ctx.db
      .select({ id: users.id, name: users.name, email: users.email, image: users.image })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    return user ?? ctx.viewer;
  }),

  update: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(users.id, ctx.userId));
      return { name: input.name };
    }),

  /** What this deployment can do, so the UI can explain instead of failing. */
  capabilities: publicProcedure.query(async ({ ctx }) => {
    const [{ total }] = await ctx.db.select({ total: count() }).from(users);
    return {
      storage: !!ctx.storage,
      transcription: getTranscriptionProvider(),
      email: isEmailConfigured(),
      signupMode: getSignupMode(),
      google: !!(getEnvVar('GOOGLE_CLIENT_ID') && getEnvVar('GOOGLE_CLIENT_SECRET')),
      /** Fresh deployment: the first sign-up is always allowed. */
      isFirstAccount: total === 0,
    };
  }),
});
