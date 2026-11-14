/**
 * Apps connected over MCP (ChatGPT, Ri, …): what the consent screen shows,
 * and the list in Settings where you can disconnect them.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { runBatch } from '@/db';
import { oauthAccessTokens, oauthApplications, oauthConsents } from '@/db/schema';
import { protectedProcedure, router } from '../trpc';

const clientId = z.string().min(1).max(200);

function hostOf(urls: string) {
  try {
    return new URL(urls.split(',')[0]).host;
  } catch {
    return null;
  }
}

export const connectionsRouter = router({
  /** The app asking for access, for the consent screen. */
  client: protectedProcedure.input(z.object({ clientId })).query(async ({ ctx, input }) => {
    const [app] = await ctx.db
      .select()
      .from(oauthApplications)
      .where(eq(oauthApplications.clientId, input.clientId))
      .limit(1);
    if (!app || app.disabled) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown app' });
    return { name: app.name || 'An app', icon: app.icon, redirectHost: hostOf(app.redirectUrls) };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        clientId: oauthApplications.clientId,
        name: oauthApplications.name,
        icon: oauthApplications.icon,
        redirectUrls: oauthApplications.redirectUrls,
        lastUsedAt: max(oauthAccessTokens.updatedAt),
      })
      .from(oauthAccessTokens)
      .innerJoin(oauthApplications, eq(oauthApplications.clientId, oauthAccessTokens.clientId))
      .where(eq(oauthAccessTokens.userId, ctx.userId))
      .groupBy(
        oauthApplications.clientId,
        oauthApplications.name,
        oauthApplications.icon,
        oauthApplications.redirectUrls,
      )
      .orderBy(desc(max(oauthAccessTokens.updatedAt)));
    return rows.map((r) => ({
      clientId: r.clientId,
      name: r.name || 'Unnamed app',
      icon: r.icon,
      redirectHost: hostOf(r.redirectUrls),
      lastUsedAt: r.lastUsedAt ? new Date(r.lastUsedAt as unknown as Date) : null,
    }));
  }),

  /** Disconnect an app: its tokens stop working immediately. */
  revoke: protectedProcedure.input(z.object({ clientId })).mutation(async ({ ctx, input }) => {
    await runBatch(ctx.db, (tx) => [
      tx
        .delete(oauthAccessTokens)
        .where(
          and(
            eq(oauthAccessTokens.clientId, input.clientId),
            eq(oauthAccessTokens.userId, ctx.userId),
          ),
        ),
      tx
        .delete(oauthConsents)
        .where(
          and(eq(oauthConsents.clientId, input.clientId), eq(oauthConsents.userId, ctx.userId)),
        ),
    ]);
    return { clientId: input.clientId };
  }),
});
