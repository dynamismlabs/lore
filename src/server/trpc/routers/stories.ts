import { TRPCError } from '@trpc/server';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { runInBackground } from '@/lib/server/cloudflare';
import { visiblePeopleCondition } from './people';
import { type Db, runBatch } from '@/db';
import { STORY_FORMATS, type StoryFormat } from '@/db/constants';
import {
  collectionMembers,
  collectionStories,
  collections,
  people,
  stories,
  storyMedia,
  storyPeople,
  users,
} from '@/db/schema';
import {
  canReadStoryCondition,
  getDefaultCollectionId,
  requireCollectionRole,
  requireStoryAuthor,
  requireStoryRead,
} from '../authz';
import { hydrateStories, mediaUrl } from '../stories/hydrate';
import { mediaInputSchema, prepareMediaRows } from '../stories/media';
import { protectedProcedure, router } from '../trpc';

const id = z.string().min(1).max(64);
const PAGE_MAX = 50;

const listInput = z.object({
  collectionId: id.optional(),
  /** Several collections at once (Timeline filter). */
  collectionIds: z.array(id).max(20).optional(),
  /** 'second' = only vibes (short daily clips). Default: regular memories only. */
  format: z.enum(STORY_FORMATS).optional(),
  personId: id.optional(),
  /**
   * recent = newest added first (home); occurred = when it happened, newest first (collections,
   * people); oldest = when it happened, oldest first (story mode plays from the beginning).
   */
  sort: z.enum(['recent', 'occurred', 'oldest']).default('recent'),
  limit: z.number().int().min(1).max(PAGE_MAX).default(20),
  cursor: z.number().int().min(0).nullish(),
});

/** Restrict a query to stories in any of these collections (after checking membership). */
async function inCollections(db: Db, userId: string, collectionIds: string[]) {
  for (const collectionId of collectionIds) {
    await requireCollectionRole(db, userId, collectionId, 'viewer');
  }
  return exists(
    db
      .select({ one: sql`1` })
      .from(collectionStories)
      .where(
        and(
          eq(collectionStories.storyId, stories.id),
          inArray(collectionStories.collectionId, collectionIds),
        ),
      ),
  );
}

function formatCondition(format: StoryFormat | undefined) {
  return format ? eq(stories.format, format) : isNull(stories.format);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const storiesRouter = router({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const { db, userId } = ctx;
    const conditions = [canReadStoryCondition(db, userId), formatCondition(input.format)];

    if (input.collectionIds?.length) {
      conditions.push(await inCollections(db, userId, [...new Set(input.collectionIds)]));
    }
    if (input.collectionId) {
      await requireCollectionRole(db, userId, input.collectionId, 'viewer');
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(collectionStories)
            .where(
              and(
                eq(collectionStories.storyId, stories.id),
                eq(collectionStories.collectionId, input.collectionId),
              ),
            ),
        ),
      );
    }
    if (input.personId) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(storyPeople)
            .where(
              and(eq(storyPeople.storyId, stories.id), eq(storyPeople.personId, input.personId)),
            ),
        ),
      );
    }

    const offset = input.cursor ?? 0;
    const order =
      input.sort === 'recent'
        ? [desc(stories.createdAt), desc(stories.id)]
        : input.sort === 'oldest'
          ? [asc(stories.occurredAt), asc(stories.id)]
          : [desc(stories.occurredAt), desc(stories.id)];
    const rows = await db
      .select()
      .from(stories)
      .where(and(...conditions))
      .orderBy(...order)
      .limit(input.limit + 1)
      .offset(offset);

    const page = rows.slice(0, input.limit);
    return {
      items: await hydrateStories(db, userId, page),
      nextCursor: rows.length > input.limit ? offset + input.limit : null,
    };
  }),

  search: protectedProcedure
    .input(z.object({ q: z.string().trim().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;
      const pattern = `%${escapeLike(input.q.toLowerCase())}%`;
      const matches = (column: typeof stories.title | typeof storyMedia.text) =>
        sql`lower(${column}) like ${pattern} escape '\\'`;
      const rows = await db
        .select()
        .from(stories)
        .where(
          and(
            canReadStoryCondition(db, userId),
            isNull(stories.format),
            or(
              matches(stories.title),
              exists(
                db
                  .select({ one: sql`1` })
                  .from(storyMedia)
                  .where(
                    and(
                      eq(storyMedia.storyId, stories.id),
                      isNotNull(storyMedia.text),
                      matches(storyMedia.text),
                    ),
                  ),
              ),
            ),
          ),
        )
        .orderBy(desc(stories.occurredAt))
        .limit(PAGE_MAX);
      return hydrateStories(db, userId, rows);
    }),

  byId: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const story = await requireStoryRead(ctx.db, ctx.userId, input.id);
    const [view] = await hydrateStories(ctx.db, ctx.userId, [story]);
    return view;
  }),

  create: protectedProcedure
    .input(
      z.object({
        /**
         * Id chosen on the device (the offline outbox) so a retry after a lost
         * response returns the memory it already saved instead of a copy.
         */
        clientId: z.string().uuid().optional(),
        collectionId: id.optional(),
        title: z.string().trim().max(200).optional(),
        occurredAt: z.date().optional(),
        media: z.array(mediaInputSchema).min(1).max(30),
        personIds: z.array(id).max(30).optional(),
        format: z.enum(STORY_FORMATS).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, userId, storage } = ctx;
      if (input.clientId) {
        const [existing] = await db.select().from(stories).where(eq(stories.id, input.clientId));
        if (existing) {
          if (existing.authorId !== userId) {
            throw new TRPCError({ code: 'CONFLICT', message: 'That memory id is already taken' });
          }
          const [view] = await hydrateStories(db, userId, [existing]);
          return view;
        }
      }
      if (
        input.format === 'second' &&
        (input.media.length !== 1 || input.media[0].kind !== 'video')
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A vibe is exactly one short video',
        });
      }
      const collectionId = input.collectionId ?? (await getDefaultCollectionId(db, userId));
      await requireCollectionRole(db, userId, collectionId, 'contributor');

      const storyId = input.clientId ?? uuidv7();
      const mediaRows = await prepareMediaRows({ userId, storyId, items: input.media, storage });

      const personIds = [...new Set(input.personIds ?? [])];
      if (personIds.length) {
        const visible = await db
          .select({ id: people.id })
          .from(people)
          .where(and(inArray(people.id, personIds), visiblePeopleCondition(db, userId)));
        if (visible.length !== personIds.length) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown person' });
        }
      }

      const now = new Date();
      await runBatch(db, (tx) => [
        tx.insert(stories).values({
          id: storyId,
          authorId: userId,
          title: input.title || null,
          format: input.format ?? null,
          occurredAt: input.occurredAt ?? now,
          createdAt: now,
          updatedAt: now,
        }),
        tx.insert(storyMedia).values(mediaRows),
        tx.insert(collectionStories).values({ collectionId, storyId, addedBy: userId }),
        ...personIds.map((personId) =>
          tx.insert(storyPeople).values({ storyId, personId, addedBy: userId }),
        ),
      ]);

      const [created] = await db.select().from(stories).where(eq(stories.id, storyId));
      const [view] = await hydrateStories(db, userId, [created]);
      return view;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id,
        title: z.string().trim().max(200).nullable().optional(),
        occurredAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireStoryAuthor(ctx.db, ctx.userId, input.id);
      const changes: Partial<typeof stories.$inferInsert> = { updatedAt: new Date() };
      if (input.title !== undefined) changes.title = input.title || null;
      if (input.occurredAt) changes.occurredAt = input.occurredAt;
      await ctx.db.update(stories).set(changes).where(eq(stories.id, input.id));
      return { id: input.id };
    }),

  /** Choose exactly which of the author's collections a memory lives in. */
  setCollections: protectedProcedure
    .input(z.object({ id, collectionIds: z.array(id).min(1).max(30) }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;
      await requireStoryAuthor(db, userId, input.id);
      const wanted = [...new Set(input.collectionIds)];
      for (const collectionId of wanted) {
        await requireCollectionRole(db, userId, collectionId, 'contributor');
      }
      const current = await db
        .select({ collectionId: collectionStories.collectionId })
        .from(collectionStories)
        .where(eq(collectionStories.storyId, input.id));
      const currentIds = new Set(current.map((c) => c.collectionId));
      const toAdd = wanted.filter((c) => !currentIds.has(c));
      const toRemove = [...currentIds].filter((c) => !wanted.includes(c));

      await runBatch(db, (tx) => [
        ...toAdd.map((collectionId) =>
          tx
            .insert(collectionStories)
            .values({ collectionId, storyId: input.id, addedBy: userId })
            .onConflictDoNothing(),
        ),
        ...(toRemove.length
          ? [
              tx
                .delete(collectionStories)
                .where(
                  and(
                    eq(collectionStories.storyId, input.id),
                    inArray(collectionStories.collectionId, toRemove),
                  ),
                ),
            ]
          : []),
      ]);
      return { id: input.id, added: toAdd.length, removed: toRemove.length };
    }),

  /**
   * A collection owner taking someone else's memory out of their collection.
   * If that was its last collection, it goes back to the author's Moments.
   */
  removeFromCollection: protectedProcedure
    .input(z.object({ id, collectionId: id }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;
      const story = await requireStoryRead(db, userId, input.id);
      if (story.authorId !== userId) {
        await requireCollectionRole(db, userId, input.collectionId, 'owner');
      }
      const links = await db
        .select({ collectionId: collectionStories.collectionId })
        .from(collectionStories)
        .where(eq(collectionStories.storyId, input.id));
      if (!links.some((l) => l.collectionId === input.collectionId)) return { id: input.id };

      const remaining = links.filter((l) => l.collectionId !== input.collectionId);
      if (remaining.length === 0 && story.authorId === userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A memory needs at least one collection. Delete it instead?',
        });
      }
      const fallback =
        remaining.length === 0 ? await getDefaultCollectionId(db, story.authorId) : null;

      await runBatch(db, (tx) => [
        tx
          .delete(collectionStories)
          .where(
            and(
              eq(collectionStories.storyId, input.id),
              eq(collectionStories.collectionId, input.collectionId),
            ),
          ),
        ...(fallback
          ? [
              tx
                .insert(collectionStories)
                .values({ collectionId: fallback, storyId: input.id, addedBy: story.authorId })
                .onConflictDoNothing(),
            ]
          : []),
      ]);
      return { id: input.id };
    }),

  delete: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const { db, userId, storage } = ctx;
    await requireStoryAuthor(db, userId, input.id);
    const keys = (
      await db
        .select({ key: storyMedia.storageKey })
        .from(storyMedia)
        .where(eq(storyMedia.storyId, input.id))
    )
      .map((m) => m.key)
      .filter((k): k is string => !!k);
    await db.delete(stories).where(eq(stories.id, input.id));
    if (storage && keys.length) runInBackground(storage.trash(keys));
    return { id: input.id };
  }),

  /**
   * Vibes (short daily clips) in a date range, oldest first (for the calendar
   * and the montage). Optionally only some collections (a family montage).
   */
  seconds: protectedProcedure
    .input(
      z.object({
        from: z.date(),
        to: z.date(),
        collectionIds: z.array(id).max(20).optional(),
        onlyMine: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;
      const conditions = [
        canReadStoryCondition(db, userId),
        eq(stories.format, 'second'),
        gte(stories.occurredAt, input.from),
        lt(stories.occurredAt, input.to),
      ];
      if (input.collectionIds?.length) {
        conditions.push(await inCollections(db, userId, [...new Set(input.collectionIds)]));
      }
      if (input.onlyMine) conditions.push(eq(stories.authorId, userId));
      const rows = await db
        .select({
          id: stories.id,
          occurredAt: stories.occurredAt,
          authorId: stories.authorId,
          authorName: users.name,
          mediaId: storyMedia.id,
          contentType: storyMedia.contentType,
        })
        .from(stories)
        .innerJoin(storyMedia, eq(storyMedia.storyId, stories.id))
        .innerJoin(users, eq(users.id, stories.authorId))
        .where(and(...conditions))
        .orderBy(asc(stories.occurredAt))
        .limit(800);
      return rows.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt,
        author: { id: r.authorId, name: r.authorName || 'Someone' },
        isMine: r.authorId === userId,
        url: mediaUrl(r.mediaId),
        contentType: r.contentType,
      }));
    }),

  /** Memories from this day in past years ("On this day"), in the viewer's time zone. */
  onThisDay: protectedProcedure
    .input(
      z.object({
        /** Viewer's local date as YYYY-MM-DD and UTC offset (Date#getTimezoneOffset). */
        today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        tzOffsetMinutes: z.number().int().min(-840).max(840),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;
      const [year, month, day] = input.today.split('-').map(Number);
      // One [start, end) window per past year — dialect-neutral (no date functions).
      const windows: { start: Date; end: Date }[] = [];
      for (let y = year - 1; y >= year - 30; y--) {
        if (month === 2 && day === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1) continue;
        const start = new Date(Date.UTC(y, month - 1, day) + input.tzOffsetMinutes * 60_000);
        windows.push({ start, end: new Date(start.getTime() + 86_400_000) });
      }
      const rows = await db
        .select()
        .from(stories)
        .where(
          and(
            canReadStoryCondition(db, userId),
            isNull(stories.format),
            or(
              ...windows.map((w) =>
                and(gte(stories.occurredAt, w.start), lt(stories.occurredAt, w.end)),
              ),
            ),
          ),
        )
        .orderBy(desc(stories.occurredAt))
        .limit(20);
      return hydrateStories(db, userId, rows);
    }),

  /** Collections the viewer can add memories to (for pickers): shared collections first, then Moments. */
  writableCollections: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: collections.id,
        name: collections.name,
        isDefault: collections.isDefault,
        role: collectionMembers.role,
      })
      .from(collectionMembers)
      .innerJoin(collections, eq(collections.id, collectionMembers.collectionId))
      .where(
        and(
          eq(collectionMembers.userId, ctx.userId),
          or(eq(collectionMembers.role, 'owner'), eq(collectionMembers.role, 'contributor')),
        ),
      )
      .orderBy(asc(collections.isDefault), asc(collections.createdAt));
  }),
});
