/**
 * Moments: separate memories found in a long recording. A model suggests them;
 * only the recording's author can add or dismiss them. An added moment is an
 * ordinary memory (text, date, people, collections) that also plays its stretch
 * of the recording through a `story_clips` row, for viewers who can see the
 * conversation too.
 */
import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import {
  type FoundMoment,
  MomentsError,
  findMoments,
  getMomentsProvider,
} from '@/services/server/moments';
import { anchorDate } from '@/lib/dates';
import { visiblePeopleCondition } from './people';
import { type Db, runBatch } from '@/db';
import { DATE_PRECISIONS } from '@/db/constants';
import {
  collectionMembers,
  collectionStories,
  momentSuggestions,
  people,
  stories,
  storyClips,
  storyMedia,
  storyPeople,
} from '@/db/schema';
import {
  canReadStoryCondition,
  getDefaultCollectionId,
  requireStoryAuthor,
  requireStoryRead,
} from '../authz';
import { hydrateStories } from '../stories/hydrate';
import { protectedProcedure, router } from '../trpc';

const id = z.string().min(1).max(64);
/** People handed to the model so it can match names and work out ages. */
const MAX_PEOPLE_IN_PROMPT = 200;

type Suggestion = typeof momentSuggestions.$inferSelect;

async function requireAudioAuthor(db: Db, userId: string, mediaId: string) {
  const [media] = await db.select().from(storyMedia).where(eq(storyMedia.id, mediaId)).limit(1);
  if (!media) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
  const story = await requireStoryAuthor(db, userId, media.storyId);
  if (media.kind !== 'audio')
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not a recording' });
  return { media, story };
}

async function requireSuggestionAuthor(db: Db, userId: string, suggestionId: string) {
  const [suggestion] = await db
    .select()
    .from(momentSuggestions)
    .where(eq(momentSuggestions.id, suggestionId))
    .limit(1);
  if (!suggestion) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
  const { story } = await requireAudioAuthor(db, userId, suggestion.mediaId);
  return { suggestion, story };
}

/** Two suggestions cover the same part of the recording (or say the same thing). */
function sameMoment(
  a: Pick<Suggestion, 'startMs' | 'endMs' | 'summary' | 'title'>,
  b: FoundMoment,
) {
  if (a.startMs != null && a.endMs != null && b.startMs != null && b.endMs != null) {
    const overlap = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
    const shorter = Math.min(a.endMs - a.startMs, b.endMs - b.startMs);
    return overlap > 0 && overlap >= shorter / 2;
  }
  const same = (x: string | null, y: string | null) =>
    !!x && !!y && x.trim().toLowerCase() === y.trim().toLowerCase();
  return same(a.title, b.title) || same(a.summary, b.summary);
}

function suggestionView(s: Suggestion) {
  return {
    id: s.id,
    mediaId: s.mediaId,
    title: s.title,
    summary: s.summary,
    occurredAt: s.occurredAt,
    occurredPrecision: s.occurredPrecision,
    startMs: s.startMs,
    endMs: s.endMs,
    people: s.people,
  };
}

/** In the conversation's order; untimed ones (typed transcripts) in the order they were found. */
function byPosition(a: Suggestion, b: Suggestion) {
  if (a.startMs != null && b.startMs != null && a.startMs !== b.startMs)
    return a.startMs - b.startMs;
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

export const momentsRouter = router({
  /** Moments for a memory's recordings: pending suggestions (author only) and the ones already added. */
  forStory: protectedProcedure.input(z.object({ storyId: id })).query(async ({ ctx, input }) => {
    const { db, userId } = ctx;
    const story = await requireStoryRead(db, userId, input.storyId);
    const audio = await db
      .select({ id: storyMedia.id, text: storyMedia.text })
      .from(storyMedia)
      .where(and(eq(storyMedia.storyId, story.id), eq(storyMedia.kind, 'audio')));
    const isAuthor = story.authorId === userId;
    if (!audio.length) return { suggestions: [], moments: [], findable: [] as string[] };

    const mediaIds = audio.map((a) => a.id);
    const [suggestions, clips] = await Promise.all([
      db.select().from(momentSuggestions).where(inArray(momentSuggestions.mediaId, mediaIds)),
      db
        .select({ storyId: storyClips.storyId })
        .from(storyClips)
        .where(inArray(storyClips.mediaId, mediaIds)),
    ]);
    const momentIds = [
      ...new Set([
        ...suggestions.flatMap((s) => (s.status === 'accepted' && s.storyId ? [s.storyId] : [])),
        ...clips.map((c) => c.storyId),
      ]),
    ].slice(0, 50);
    const momentRows = momentIds.length
      ? await db
          .select()
          .from(stories)
          .where(and(inArray(stories.id, momentIds), canReadStoryCondition(db, userId)))
          .orderBy(asc(stories.occurredAt), asc(stories.id))
      : [];

    return {
      suggestions: isAuthor
        ? suggestions
            .filter((s) => s.status === 'pending')
            .sort(byPosition)
            .map(suggestionView)
        : [],
      moments: await hydrateStories(db, userId, momentRows),
      /** Recordings the viewer can look through for moments. */
      findable:
        isAuthor && getMomentsProvider() ? audio.filter((a) => a.text).map((a) => a.id) : [],
    };
  }),

  /**
   * Look through a recording for moments. Called by the app after a long
   * recording is transcribed, and by "Find moments". Replaces the pending
   * suggestions; never re-suggests one that was added or dismissed.
   */
  suggest: protectedProcedure.input(z.object({ mediaId: id })).mutation(async ({ ctx, input }) => {
    const { db, userId } = ctx;
    const { media, story } = await requireAudioAuthor(db, userId, input.mediaId);
    if (!media.text) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'There’s no transcript to look through yet',
      });
    }
    if (!getMomentsProvider()) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Finding moments isn’t set up' });
    }

    const known = await db
      .select()
      .from(people)
      .where(visiblePeopleCondition(db, userId))
      .orderBy(asc(people.name))
      .limit(MAX_PEOPLE_IN_PROMPT);
    let found: FoundMoment[];
    try {
      found = await findMoments({
        transcript: media.text,
        segments: media.transcriptSegments ?? [],
        recordedAt: story.occurredAt,
        people: known.map((p) => ({
          id: p.id,
          name: p.name,
          relationship: p.relationship,
          birthDate: p.birthDate,
        })),
      });
    } catch (error) {
      console.error('[moments]', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          error instanceof MomentsError && error.message.startsWith('This recording')
            ? error.message
            : 'Couldn’t look through this recording — try again',
      });
    }

    const handled = await db
      .select()
      .from(momentSuggestions)
      .where(and(eq(momentSuggestions.mediaId, media.id), ne(momentSuggestions.status, 'pending')));
    const rows = found
      .filter((moment) => !handled.some((h) => sameMoment(h, moment)))
      .map((moment) => ({
        id: uuidv7(),
        mediaId: media.id,
        title: moment.title,
        summary: moment.summary,
        occurredAt: moment.occurredAt,
        occurredPrecision: moment.precision,
        startMs: moment.startMs,
        endMs: moment.endMs,
        people: moment.people,
      }));

    // One statement per row keeps each under D1's bound-parameter limit.
    await runBatch(db, (tx) => [
      tx
        .delete(momentSuggestions)
        .where(
          and(eq(momentSuggestions.mediaId, media.id), eq(momentSuggestions.status, 'pending')),
        ),
      ...rows.map((row) => tx.insert(momentSuggestions).values(row)),
    ]);
    return { found: rows.length };
  }),

  /** Add a suggested moment to the timeline as its own memory. */
  accept: protectedProcedure
    .input(
      z.object({
        id,
        occurredAt: z.date().optional(),
        occurredPrecision: z.enum(DATE_PRECISIONS).optional(),
        /** People already in People to tag. */
        personIds: z.array(id).max(30).default([]),
        /** Names to add to People and tag. */
        newPeople: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;
      const { suggestion, story: source } = await requireSuggestionAuthor(db, userId, input.id);
      if (suggestion.status === 'accepted' && suggestion.storyId)
        return { storyId: suggestion.storyId };

      const precision = input.occurredPrecision ?? suggestion.occurredPrecision;
      const occurredAt = anchorDate(input.occurredAt ?? suggestion.occurredAt, precision);
      if (occurredAt.getTime() > Date.now() + 86_400_000) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That date is in the future' });
      }

      const visible = await db
        .select({ id: people.id, name: people.name })
        .from(people)
        .where(visiblePeopleCondition(db, userId));
      const visibleIds = new Set(visible.map((p) => p.id));
      const personIds = new Set(input.personIds);
      if ([...personIds].some((p) => !visibleIds.has(p))) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown person' });
      }
      // A name someone already added since the suggestion was made is reused, not duplicated.
      const byName = new Map(visible.map((p) => [p.name.toLowerCase(), p.id]));
      const newPeople: { id: string; name: string }[] = [];
      for (const name of input.newPeople) {
        const existing = byName.get(name.toLowerCase());
        if (existing) personIds.add(existing);
        else {
          const person = { id: uuidv7(), name };
          byName.set(name.toLowerCase(), person.id);
          newPeople.push(person);
          personIds.add(person.id);
        }
      }

      // It goes wherever the conversation is that the author can still add to.
      const shared = await db
        .select({ collectionId: collectionStories.collectionId })
        .from(collectionStories)
        .innerJoin(
          collectionMembers,
          and(
            eq(collectionMembers.collectionId, collectionStories.collectionId),
            eq(collectionMembers.userId, userId),
          ),
        )
        .where(
          and(
            eq(collectionStories.storyId, source.id),
            or(eq(collectionMembers.role, 'owner'), eq(collectionMembers.role, 'contributor')),
          ),
        );
      const collectionIds = shared.length
        ? shared.map((c) => c.collectionId)
        : [await getDefaultCollectionId(db, userId)];

      const storyId = uuidv7();
      const now = new Date();
      await runBatch(db, (tx) => [
        tx.insert(stories).values({
          id: storyId,
          authorId: userId,
          title: suggestion.title,
          occurredAt,
          occurredPrecision: precision,
          createdAt: now,
          updatedAt: now,
        }),
        tx.insert(storyMedia).values({
          id: uuidv7(),
          storyId,
          kind: 'text',
          position: 0,
          text: suggestion.summary,
        }),
        ...collectionIds.map((collectionId) =>
          tx.insert(collectionStories).values({ collectionId, storyId, addedBy: userId }),
        ),
        ...newPeople.map((person) => tx.insert(people).values({ ...person, ownerId: userId })),
        ...[...personIds].map((personId) =>
          tx.insert(storyPeople).values({ storyId, personId, addedBy: userId }),
        ),
        ...(suggestion.startMs != null && suggestion.endMs != null
          ? [
              tx.insert(storyClips).values({
                storyId,
                mediaId: suggestion.mediaId,
                startMs: suggestion.startMs,
                endMs: suggestion.endMs,
              }),
            ]
          : []),
        tx
          .update(momentSuggestions)
          .set({ status: 'accepted', storyId })
          .where(eq(momentSuggestions.id, suggestion.id)),
      ]);
      return { storyId };
    }),

  dismiss: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    await requireSuggestionAuthor(ctx.db, ctx.userId, input.id);
    await ctx.db
      .update(momentSuggestions)
      .set({ status: 'dismissed' })
      .where(eq(momentSuggestions.id, input.id));
    return { id: input.id };
  }),
});
