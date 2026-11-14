import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { runBatch } from '@/db';
import { INVITABLE_ROLES } from '@/db/constants';
import {
  collectionMembers,
  collectionStories,
  collections,
  stories,
  storyMedia,
  users,
} from '@/db/schema';
import { requireCollectionRole } from '../authz';
import { mediaUrl } from '../stories/hydrate';
import { protectedProcedure, router } from '../trpc';

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1, 'Give it a name').max(80);
const description = z.string().trim().max(500).nullable().optional();

export const collectionsRouter = router({
  /** Every collection the viewer belongs to: shared collections first, then Personal. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const { db, userId } = ctx;
    const rows = await db
      .select({ collection: collections, role: collectionMembers.role })
      .from(collectionMembers)
      .innerJoin(collections, eq(collections.id, collectionMembers.collectionId))
      .where(eq(collectionMembers.userId, userId));
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.collection.id).slice(0, 90);

    const [memberCounts, storyStats, storyCounts, members, covers] = await Promise.all([
      db
        .select({ collectionId: collectionMembers.collectionId, total: count() })
        .from(collectionMembers)
        .where(inArray(collectionMembers.collectionId, ids))
        .groupBy(collectionMembers.collectionId),
      // Activity counts everything added, vibes included…
      db
        .select({
          collectionId: collectionStories.collectionId,
          lastAddedAt: max(collectionStories.addedAt),
        })
        .from(collectionStories)
        .where(inArray(collectionStories.collectionId, ids))
        .groupBy(collectionStories.collectionId),
      // …but "N memories" counts memories only (vibes live on the Vibes page).
      db
        .select({ collectionId: collectionStories.collectionId, total: count() })
        .from(collectionStories)
        .innerJoin(stories, eq(stories.id, collectionStories.storyId))
        .where(and(inArray(collectionStories.collectionId, ids), isNull(stories.format)))
        .groupBy(collectionStories.collectionId),
      db
        .select({
          collectionId: collectionMembers.collectionId,
          id: users.id,
          name: users.name,
          image: users.image,
        })
        .from(collectionMembers)
        .innerJoin(users, eq(users.id, collectionMembers.userId))
        .where(inArray(collectionMembers.collectionId, ids))
        .orderBy(asc(collectionMembers.createdAt)),
      // Latest photo in each collection, for the card cover.
      db
        .select({
          collectionId: collectionStories.collectionId,
          mediaId: storyMedia.id,
          createdAt: storyMedia.createdAt,
        })
        .from(collectionStories)
        .innerJoin(storyMedia, eq(storyMedia.storyId, collectionStories.storyId))
        .where(and(inArray(collectionStories.collectionId, ids), eq(storyMedia.kind, 'image')))
        .orderBy(desc(storyMedia.createdAt))
        .limit(400),
    ]);

    const memberCount = new Map(memberCounts.map((m) => [m.collectionId, m.total]));
    const stats = new Map(storyStats.map((s) => [s.collectionId, s]));
    const memoryCount = new Map(storyCounts.map((s) => [s.collectionId, s.total]));
    const coverFor = new Map<string, string>();
    for (const c of covers)
      if (!coverFor.has(c.collectionId)) coverFor.set(c.collectionId, c.mediaId);
    const membersFor = new Map<string, { id: string; name: string; image: string | null }[]>();
    for (const m of members) {
      const list = membersFor.get(m.collectionId) ?? [];
      list.push({ id: m.id, name: m.name, image: m.image });
      membersFor.set(m.collectionId, list);
    }

    return rows
      .map(({ collection, role }) => {
        const s = stats.get(collection.id);
        const cover = coverFor.get(collection.id);
        return {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          isDefault: collection.isDefault,
          role,
          memberCount: memberCount.get(collection.id) ?? 1,
          members: (membersFor.get(collection.id) ?? []).slice(0, 5),
          storyCount: memoryCount.get(collection.id) ?? 0,
          lastAddedAt: s?.lastAddedAt ? new Date(s.lastAddedAt as unknown as number | Date) : null,
          coverUrl: cover ? mediaUrl(cover) : null,
          createdAt: collection.createdAt,
        };
      })
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
        const at = (a.lastAddedAt ?? a.createdAt).getTime();
        const bt = (b.lastAddedAt ?? b.createdAt).getTime();
        return bt - at;
      });
  }),

  byId: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const { db, userId } = ctx;
    const { collection, role } = await requireCollectionRole(db, userId, input.id, 'viewer');
    const [members, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
          role: collectionMembers.role,
          joinedAt: collectionMembers.createdAt,
        })
        .from(collectionMembers)
        .innerJoin(users, eq(users.id, collectionMembers.userId))
        .where(eq(collectionMembers.collectionId, input.id))
        .orderBy(asc(collectionMembers.createdAt)),
      // Memories only: vibes in this collection live on the Vibes page.
      db
        .select({ total: count() })
        .from(collectionStories)
        .innerJoin(stories, eq(stories.id, collectionStories.storyId))
        .where(and(eq(collectionStories.collectionId, input.id), isNull(stories.format))),
    ]);
    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      isDefault: collection.isDefault,
      ownerId: collection.ownerId,
      role,
      storyCount: total,
      // Emails are only shown to the owner (who manages membership).
      members: members.map((m) => ({ ...m, email: role === 'owner' ? m.email : null })),
    };
  }),

  create: protectedProcedure
    .input(z.object({ name, description, includeMoments: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const collectionId = uuidv7();
      const myStoryIds = input.includeMoments
        ? (
            await ctx.db
              .select({ id: stories.id })
              .from(stories)
              .where(eq(stories.authorId, ctx.userId))
          ).map((s) => s.id)
        : [];
      await runBatch(ctx.db, (tx) => [
        tx.insert(collections).values({
          id: collectionId,
          ownerId: ctx.userId,
          name: input.name,
          description: input.description || null,
        }),
        tx.insert(collectionMembers).values({ collectionId, userId: ctx.userId, role: 'owner' }),
        ...myStoryIds.map((storyId) =>
          tx
            .insert(collectionStories)
            .values({ collectionId, storyId, addedBy: ctx.userId })
            .onConflictDoNothing(),
        ),
      ]);
      return { id: collectionId };
    }),

  update: protectedProcedure
    .input(z.object({ id, name: name.optional(), description }))
    .mutation(async ({ ctx, input }) => {
      await requireCollectionRole(ctx.db, ctx.userId, input.id, 'owner');
      const changes: Partial<typeof collections.$inferInsert> = { updatedAt: new Date() };
      if (input.name) changes.name = input.name;
      if (input.description !== undefined) changes.description = input.description || null;
      await ctx.db.update(collections).set(changes).where(eq(collections.id, input.id));
      return { id: input.id };
    }),

  /**
   * Delete a collection. Memories that only lived here go back to their
   * authors' Moments instead of disappearing.
   */
  delete: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const { db, userId } = ctx;
    const { collection } = await requireCollectionRole(db, userId, input.id, 'owner');
    if (collection.isDefault) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Personal can’t be deleted' });
    }
    const here = await db
      .select({ storyId: collectionStories.storyId, authorId: stories.authorId })
      .from(collectionStories)
      .innerJoin(stories, eq(stories.id, collectionStories.storyId))
      .where(eq(collectionStories.collectionId, input.id));

    const orphans: { storyId: string; authorId: string }[] = [];
    for (let i = 0; i < here.length; i += 80) {
      const chunk = here.slice(i, i + 80);
      const elsewhere = await db
        .select({ storyId: collectionStories.storyId })
        .from(collectionStories)
        .where(
          and(
            inArray(
              collectionStories.storyId,
              chunk.map((s) => s.storyId),
            ),
          ),
        );
      const counts = new Map<string, number>();
      for (const e of elsewhere) counts.set(e.storyId, (counts.get(e.storyId) ?? 0) + 1);
      orphans.push(...chunk.filter((s) => (counts.get(s.storyId) ?? 0) <= 1));
    }

    const authorIds = [...new Set(orphans.map((o) => o.authorId))];
    const defaults = authorIds.length
      ? await db
          .select({ id: collections.id, ownerId: collections.ownerId })
          .from(collections)
          .where(and(inArray(collections.ownerId, authorIds), eq(collections.isDefault, true)))
      : [];
    const defaultFor = new Map(defaults.map((d) => [d.ownerId, d.id]));

    await runBatch(db, (tx) => [
      ...orphans
        .filter((o) => defaultFor.has(o.authorId))
        .map((o) =>
          tx
            .insert(collectionStories)
            .values({
              collectionId: defaultFor.get(o.authorId)!,
              storyId: o.storyId,
              addedBy: o.authorId,
            })
            .onConflictDoNothing(),
        ),
      tx.delete(collections).where(eq(collections.id, input.id)),
    ]);
    return { id: input.id, movedToMoments: orphans.length };
  }),

  leave: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const { role } = await requireCollectionRole(ctx.db, ctx.userId, input.id, 'viewer');
    if (role === 'owner') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Owners can’t leave their own collection',
      });
    }
    await ctx.db
      .delete(collectionMembers)
      .where(
        and(eq(collectionMembers.collectionId, input.id), eq(collectionMembers.userId, ctx.userId)),
      );
    return { id: input.id };
  }),

  removeMember: protectedProcedure
    .input(z.object({ id, userId: id }))
    .mutation(async ({ ctx, input }) => {
      await requireCollectionRole(ctx.db, ctx.userId, input.id, 'owner');
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You own this collection' });
      }
      await ctx.db
        .delete(collectionMembers)
        .where(
          and(
            eq(collectionMembers.collectionId, input.id),
            eq(collectionMembers.userId, input.userId),
          ),
        );
      return { id: input.id };
    }),

  setMemberRole: protectedProcedure
    .input(z.object({ id, userId: id, role: z.enum(INVITABLE_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      await requireCollectionRole(ctx.db, ctx.userId, input.id, 'owner');
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You own this collection' });
      }
      await ctx.db
        .update(collectionMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(collectionMembers.collectionId, input.id),
            eq(collectionMembers.userId, input.userId),
          ),
        );
      return { id: input.id };
    }),
});
