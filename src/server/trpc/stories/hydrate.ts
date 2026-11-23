/**
 * Turn story rows into the shape every screen renders: author, media (with
 * the authenticated URL each item is served from), the collections the viewer
 * can see it in, people tags, and comment/heart counts.
 *
 * Batched: one query per relation for the whole page of stories. Pages are
 * capped at 50 ids, well under D1's 100-bound-parameter limit.
 */
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { effectiveTranscriptStatus } from './media';
import type { Db } from '@/db';
import type {
  DatePrecision,
  MediaKind,
  MemberRole,
  StoryFormat,
  TranscriptStatus,
} from '@/db/constants';
import {
  collectionMembers,
  collectionStories,
  collections,
  comments,
  people,
  reactions,
  stories,
  storyClips,
  storyMedia,
  storyPeople,
  users,
} from '@/db/schema';
import { canReadStoryCondition, roleAtLeast } from '../authz';

type StoryRow = typeof stories.$inferSelect;

export interface StoryMediaView {
  id: string;
  kind: MediaKind;
  position: number;
  contentType: string | null;
  sizeBytes: number | null;
  text: string | null;
  transcriptStatus: TranscriptStatus | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  /** Authenticated URL; null for text. */
  url: string | null;
}

/** A stretch of another memory's recording that this memory plays (a moment). */
export interface StoryClipView {
  mediaId: string;
  url: string;
  startMs: number;
  endMs: number;
  source: { id: string; title: string | null; occurredAt: Date; occurredPrecision: DatePrecision };
}

export interface StoryView {
  id: string;
  title: string | null;
  format: StoryFormat | null;
  occurredAt: Date;
  occurredPrecision: DatePrecision;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; image: string | null };
  media: StoryMediaView[];
  /** Only clips whose recording the viewer can also see. */
  clips: StoryClipView[];
  collections: { id: string; name: string; isDefault: boolean; role: MemberRole }[];
  people: { id: string; name: string }[];
  commentCount: number;
  heartCount: number;
  heartedByMe: boolean;
  isMine: boolean;
  /** Author, or owner/contributor of a collection it's in. */
  canContribute: boolean;
}

export const HEART = '❤️';

export function mediaUrl(mediaId: string) {
  return `/api/media/${mediaId}`;
}

export async function hydrateStories(
  db: Db,
  viewerId: string,
  rows: StoryRow[],
): Promise<StoryView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.authorId))];

  const [authorRows, mediaRows, collectionRows, peopleRows, commentRows, reactionRows, clipRows] =
    await Promise.all([
      db
        .select({ id: users.id, name: users.name, image: users.image })
        .from(users)
        .where(inArray(users.id, authorIds)),
      db
        .select()
        .from(storyMedia)
        .where(inArray(storyMedia.storyId, ids))
        .orderBy(asc(storyMedia.position), asc(storyMedia.createdAt)),
      db
        .select({
          storyId: collectionStories.storyId,
          id: collections.id,
          name: collections.name,
          isDefault: collections.isDefault,
          role: collectionMembers.role,
        })
        .from(collectionStories)
        .innerJoin(collections, eq(collections.id, collectionStories.collectionId))
        .innerJoin(
          collectionMembers,
          and(
            eq(collectionMembers.collectionId, collectionStories.collectionId),
            eq(collectionMembers.userId, viewerId),
          ),
        )
        .where(inArray(collectionStories.storyId, ids))
        .orderBy(asc(collections.name)),
      db
        .select({ storyId: storyPeople.storyId, id: people.id, name: people.name })
        .from(storyPeople)
        .innerJoin(people, eq(people.id, storyPeople.personId))
        .where(inArray(storyPeople.storyId, ids))
        .orderBy(asc(people.name)),
      db
        .select({ storyId: comments.storyId, total: count() })
        .from(comments)
        .where(inArray(comments.storyId, ids))
        .groupBy(comments.storyId),
      db
        .select({ storyId: reactions.storyId, userId: reactions.userId })
        .from(reactions)
        .where(and(inArray(reactions.storyId, ids), eq(reactions.emoji, HEART))),
      // `stories` here is the memory the recording belongs to: the viewer must be able to read it.
      db
        .select({
          storyId: storyClips.storyId,
          mediaId: storyClips.mediaId,
          startMs: storyClips.startMs,
          endMs: storyClips.endMs,
          sourceId: stories.id,
          sourceTitle: stories.title,
          sourceOccurredAt: stories.occurredAt,
          sourcePrecision: stories.occurredPrecision,
        })
        .from(storyClips)
        .innerJoin(storyMedia, eq(storyMedia.id, storyClips.mediaId))
        .innerJoin(stories, eq(stories.id, storyMedia.storyId))
        .where(and(inArray(storyClips.storyId, ids), canReadStoryCondition(db, viewerId)))
        .orderBy(asc(storyClips.startMs)),
    ]);

  const authors = new Map(authorRows.map((a) => [a.id, a]));
  const group = <T extends { storyId: string }>(items: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const list = map.get(item.storyId) ?? [];
      list.push(item);
      map.set(item.storyId, list);
    }
    return map;
  };
  const mediaByStory = group(mediaRows);
  const collectionsByStory = group(collectionRows);
  const peopleByStory = group(peopleRows);
  const commentCounts = new Map(commentRows.map((c) => [c.storyId, c.total]));
  const heartsByStory = group(reactionRows);
  const clipsByStory = group(clipRows);

  return rows.map((row) => {
    const author = authors.get(row.authorId);
    const storyCollections = (collectionsByStory.get(row.id) ?? []).map(
      ({ id, name, isDefault, role }) => ({ id, name, isDefault, role }),
    );
    const hearts = heartsByStory.get(row.id) ?? [];
    const isMine = row.authorId === viewerId;
    return {
      id: row.id,
      title: row.title,
      format: row.format,
      occurredAt: row.occurredAt,
      occurredPrecision: row.occurredPrecision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      author: { id: row.authorId, name: author?.name || 'Someone', image: author?.image ?? null },
      media: (mediaByStory.get(row.id) ?? []).map((m) => ({
        id: m.id,
        kind: m.kind,
        position: m.position,
        contentType: m.contentType,
        sizeBytes: m.sizeBytes,
        text: m.text,
        transcriptStatus: effectiveTranscriptStatus(m.transcriptStatus, m.createdAt),
        durationMs: m.durationMs,
        width: m.width,
        height: m.height,
        url: m.kind === 'text' ? null : mediaUrl(m.id),
      })),
      clips: (clipsByStory.get(row.id) ?? []).map((c) => ({
        mediaId: c.mediaId,
        url: mediaUrl(c.mediaId),
        startMs: c.startMs,
        endMs: c.endMs,
        source: {
          id: c.sourceId,
          title: c.sourceTitle,
          occurredAt: c.sourceOccurredAt,
          occurredPrecision: c.sourcePrecision,
        },
      })),
      collections: storyCollections,
      people: (peopleByStory.get(row.id) ?? []).map(({ id, name }) => ({ id, name })),
      commentCount: commentCounts.get(row.id) ?? 0,
      heartCount: hearts.length,
      heartedByMe: hearts.some((h) => h.userId === viewerId),
      isMine,
      canContribute: isMine || storyCollections.some((c) => roleAtLeast(c.role, 'contributor')),
    };
  });
}
