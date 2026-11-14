/**
 * People you tag in memories. A person is visible to you if you created them,
 * or they're tagged in a memory you can see — so a family sharing a collection
 * naturally converges on one "Maya" instead of each making their own.
 */
import { TRPCError } from '@trpc/server';
import { and, asc, count, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import type { Db } from '@/db';
import { people, stories, storyPeople } from '@/db/schema';
import { canReadStoryCondition, requireStoryContributor } from '../authz';
import { protectedProcedure, router } from '../trpc';

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(80);
const relationship = z.string().trim().max(80).nullable().optional();

/** SQL condition on the `people` row: visible to `userId`. */
export function visiblePeopleCondition(db: Db, userId: string) {
  return or(
    eq(people.ownerId, userId),
    exists(
      db
        .select({ one: sql`1` })
        .from(storyPeople)
        .innerJoin(stories, eq(stories.id, storyPeople.storyId))
        .where(and(eq(storyPeople.personId, people.id), canReadStoryCondition(db, userId))),
    ),
  )!;
}

async function requireVisiblePerson(db: Db, userId: string, personId: string) {
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), visiblePeopleCondition(db, userId)))
    .limit(1);
  if (!person) throw new TRPCError({ code: 'NOT_FOUND', message: 'Person not found' });
  return person;
}

async function requireOwnedPerson(db: Db, userId: string, personId: string) {
  const person = await requireVisiblePerson(db, userId, personId);
  if (person.ownerId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the person who added them can change this',
    });
  }
  return person;
}

export const peopleRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { db, userId } = ctx;
    const rows = await db
      .select()
      .from(people)
      .where(visiblePeopleCondition(db, userId))
      .orderBy(asc(people.name));
    if (rows.length === 0) return [];

    // Count only the memories this viewer can see.
    const counts = await db
      .select({ personId: storyPeople.personId, total: count() })
      .from(storyPeople)
      .innerJoin(stories, eq(stories.id, storyPeople.storyId))
      .where(
        and(
          inArray(
            storyPeople.personId,
            rows.slice(0, 90).map((p) => p.id),
          ),
          canReadStoryCondition(db, userId),
        ),
      )
      .groupBy(storyPeople.personId);
    const byId = new Map(counts.map((c) => [c.personId, c.total]));
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      isMine: p.ownerId === userId,
      storyCount: byId.get(p.id) ?? 0,
    }));
  }),

  byId: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const person = await requireVisiblePerson(ctx.db, ctx.userId, input.id);
    return {
      id: person.id,
      name: person.name,
      relationship: person.relationship,
      isMine: person.ownerId === ctx.userId,
    };
  }),

  create: protectedProcedure
    .input(z.object({ name, relationship }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(people)
        .values({
          id: uuidv7(),
          ownerId: ctx.userId,
          name: input.name,
          relationship: input.relationship || null,
        })
        .returning();
      return {
        id: created.id,
        name: created.name,
        relationship: created.relationship,
        isMine: true,
      };
    }),

  update: protectedProcedure
    .input(z.object({ id, name: name.optional(), relationship }))
    .mutation(async ({ ctx, input }) => {
      await requireOwnedPerson(ctx.db, ctx.userId, input.id);
      const changes: Partial<typeof people.$inferInsert> = { updatedAt: new Date() };
      if (input.name) changes.name = input.name;
      if (input.relationship !== undefined) changes.relationship = input.relationship || null;
      await ctx.db.update(people).set(changes).where(eq(people.id, input.id));
      return { id: input.id };
    }),

  delete: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    await requireOwnedPerson(ctx.db, ctx.userId, input.id);
    await ctx.db.delete(people).where(eq(people.id, input.id));
    return { id: input.id };
  }),

  tag: protectedProcedure
    .input(z.object({ storyId: id, personId: id }))
    .mutation(async ({ ctx, input }) => {
      await requireStoryContributor(ctx.db, ctx.userId, input.storyId);
      await requireVisiblePerson(ctx.db, ctx.userId, input.personId);
      await ctx.db
        .insert(storyPeople)
        .values({ storyId: input.storyId, personId: input.personId, addedBy: ctx.userId })
        .onConflictDoNothing();
      return input;
    }),

  untag: protectedProcedure
    .input(z.object({ storyId: id, personId: id }))
    .mutation(async ({ ctx, input }) => {
      await requireStoryContributor(ctx.db, ctx.userId, input.storyId);
      await ctx.db
        .delete(storyPeople)
        .where(
          and(eq(storyPeople.storyId, input.storyId), eq(storyPeople.personId, input.personId)),
        );
      return input;
    }),
});
